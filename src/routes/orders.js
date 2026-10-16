import crypto from 'crypto';
import { Router } from 'express';
import { supabaseAdmin as db } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap, httpError } from '../utils/asyncHandler.js';
import { initializePayment } from '../services/payments.js';

const router = Router();
router.use(requireAuth);

// POST /api/orders   { "items": [ { "product_id": "...", "quantity": 1 } ] }
// Prices always come from the database, never from the client.
router.post('/', wrap(async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw httpError(400, 'items must be a non-empty array (max 20)');
  }

  const qtyById = new Map();
  for (const it of items) {
    const qty = Number(it.quantity ?? 1);
    if (!it.product_id || !Number.isInteger(qty) || qty < 1 || qty > 100) {
      throw httpError(400, 'each item needs product_id and a whole quantity between 1 and 100');
    }
    qtyById.set(it.product_id, (qtyById.get(it.product_id) || 0) + qty);
  }

  const { data: products, error } = await db.from('products').select('*').in('id', [...qtyById.keys()]).eq('active', true);
  if (error) throw error;
  if (products.length !== qtyById.size) throw httpError(400, 'One or more products are unavailable');

  if (new Set(products.map((p) => p.currency)).size > 1) {
    throw httpError(400, 'All items in one order must use the same currency');
  }
  for (const p of products) {
    if (p.stock !== null && p.stock < qtyById.get(p.id)) throw httpError(400, `Not enough stock for "${p.name}"`);
  }

  const total = products.reduce((sum, p) => sum + p.price_cents * qtyById.get(p.id), 0);
  const orderId = crypto.randomUUID();

  const { data: order, error: orderErr } = await db.from('orders').insert({
    id: orderId,
    user_id: req.user.id,
    status: 'pending',
    total_cents: total,
    currency: products[0].currency,
    payment_provider: (process.env.PAYMENT_PROVIDER || 'manual').toLowerCase(),
    payment_reference: orderId,
  }).select().single();
  if (orderErr) throw orderErr;

  const rows = products.map((p) => ({
    order_id: orderId,
    product_id: p.id,
    product_name: p.name,
    unit_price_cents: p.price_cents,
    quantity: qtyById.get(p.id),
  }));
  const { data: orderItems, error: itemsErr } = await db.from('order_items').insert(rows).select();
  if (itemsErr) {
    await db.from('orders').delete().eq('id', orderId);
    throw itemsErr;
  }

  let payment;
  try {
    payment = await initializePayment({ order, email: req.user.email });
  } catch (err) {
    await db.from('orders').update({ status: 'failed' }).eq('id', orderId);
    throw err;
  }

  res.status(201).json({ order: { ...order, items: orderItems }, payment });
}));

// GET /api/orders  (my orders)
router.get('/', wrap(async (req, res) => {
  const { data, error } = await db.from('orders').select('*, order_items(*)').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) throw error;
  res.json(data);
}));

// GET /api/orders/:id  (my order, with delivered licenses)
router.get('/:id', wrap(async (req, res) => {
  const { data, error } = await db.from('orders').select('*, order_items(*), licenses(*)').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Order not found');
  res.json(data);
}));

export default router;
