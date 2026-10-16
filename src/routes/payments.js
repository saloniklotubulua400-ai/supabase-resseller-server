import { Router } from 'express';
import { supabaseAdmin as db } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap, httpError } from '../utils/asyncHandler.js';
import {
  isValidPaystackSignature,
  settlePaystackTransaction,
  verifyPaystackTransaction,
} from '../services/payments.js';

const router = Router();

// POST /api/payments/webhook/paystack  (called by Paystack, no login)
// Set this URL in the Paystack dashboard -> Settings -> API Keys & Webhooks
router.post('/webhook/paystack', wrap(async (req, res) => {
  if (!isValidPaystackSignature(req.rawBody, req.headers['x-paystack-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (req.body?.event === 'charge.success') {
    await settlePaystackTransaction(req.body.data);
  }
  res.sendStatus(200);
}));

// GET /api/payments/verify/:orderId  (customer, call after returning from checkout)
router.get('/verify/:orderId', requireAuth, wrap(async (req, res) => {
  const { data: order, error } = await db.from('orders').select('*').eq('id', req.params.orderId).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  if (!order) throw httpError(404, 'Order not found');

  if (order.status === 'pending' && order.payment_provider === 'paystack') {
    const tx = await verifyPaystackTransaction(order.id);
    await settlePaystackTransaction(tx);
  }
  const { data: fresh } = await db.from('orders').select('id,status,total_cents,currency,paid_at').eq('id', order.id).single();
  res.json(fresh);
}));

export default router;
