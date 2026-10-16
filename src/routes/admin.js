import { Router } from 'express';
import { supabaseAdmin as db } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { wrap, httpError } from '../utils/asyncHandler.js';
import { markOrderPaid, refreshOrderStatus } from '../services/fulfillment.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats
router.get('/stats', wrap(async (req, res) => {
  const { data: orders, error } = await db.from('orders').select('status,total_cents,currency');
  if (error) throw error;

  const ordersByStatus = {};
  const revenueCents = {};
  for (const o of orders) {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
    if (o.status === 'paid' || o.status === 'fulfilled') {
      revenueCents[o.currency] = (revenueCents[o.currency] || 0) + o.total_cents;
    }
  }
  const { count: customers } = await db.from('profiles').select('id', { count: 'exact', head: true });
  const { count: pendingDeliveries } = await db.from('licenses').select('id', { count: 'exact', head: true }).eq('status', 'pending_delivery');

  res.json({ orders_by_status: ordersByStatus, revenue_cents: revenueCents, customers, pending_deliveries: pendingDeliveries });
}));

// GET /api/admin/orders?status=paid
router.get('/orders', wrap(async (req, res) => {
  let q = db.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(100);
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

// POST /api/admin/orders/:id/mark-paid   (offline / manual payments, M-Pesa till, bank transfer...)
router.post('/orders/:id/mark-paid', wrap(async (req, res) => {
  const result = await markOrderPaid(req.params.id);
  res.json(result);
}));

// GET /api/admin/customers
router.get('/customers', wrap(async (req, res) => {
  const { data, error } = await db.from('profiles').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  res.json(data);
}));

// GET /api/admin/licenses?status=pending_delivery
router.get('/licenses', wrap(async (req, res) => {
  let q = db.from('licenses').select('*, products(name)').order('created_at', { ascending: false }).limit(200);
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

// PATCH /api/admin/licenses/:id/deliver   { "delivery_details": "login: ... password: ...", "license_key": "optional" }
router.patch('/licenses/:id/deliver', wrap(async (req, res) => {
  const { delivery_details, license_key } = req.body || {};
  if (!delivery_details && !license_key) throw httpError(400, 'delivery_details or license_key is required');

  const { data, error } = await db
    .from('licenses')
    .update({ delivery_details: delivery_details ?? null, license_key: license_key ?? null, status: 'active' })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'License not found');

  await refreshOrderStatus(data.order_id);
  res.json(data);
}));

// POST /api/admin/licenses/:id/revoke
router.post('/licenses/:id/revoke', wrap(async (req, res) => {
  const { data, error } = await db.from('licenses').update({ status: 'revoked' }).eq('id', req.params.id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'License not found');
  res.json(data);
}));

export default router;
