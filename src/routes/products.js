import { Router } from 'express';
import { supabaseAdmin as db } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { wrap, httpError } from '../utils/asyncHandler.js';

const router = Router();

const BILLING = ['one_time', 'monthly', 'yearly'];
const FULFILLMENT = ['license_key', 'manual'];
const FIELDS = ['name', 'slug', 'description', 'category', 'price_cents', 'currency', 'billing_type', 'fulfillment_type', 'stock', 'active'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function pickProduct(body, { partial }) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];

  if (!partial) {
    if (!out.name) throw httpError(400, 'name is required');
    if (out.price_cents === undefined) throw httpError(400, 'price_cents is required');
    if (!out.slug) out.slug = slugify(out.name);
  }
  if (out.price_cents !== undefined && (!Number.isInteger(out.price_cents) || out.price_cents < 0)) {
    throw httpError(400, 'price_cents must be a whole number >= 0 (e.g. 1999 = 19.99)');
  }
  if (out.billing_type && !BILLING.includes(out.billing_type)) throw httpError(400, `billing_type must be one of: ${BILLING.join(', ')}`);
  if (out.fulfillment_type && !FULFILLMENT.includes(out.fulfillment_type)) throw httpError(400, `fulfillment_type must be one of: ${FULFILLMENT.join(', ')}`);
  if (out.currency) out.currency = String(out.currency).toUpperCase();
  return out;
}

// ---------- public ----------
// GET /api/products?category=vpn
router.get('/', wrap(async (req, res) => {
  let q = db.from('products').select('*').eq('active', true).order('created_at', { ascending: false });
  if (req.query.category) q = q.eq('category', req.query.category);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

// GET /api/products/:idOrSlug
router.get('/:idOrSlug', wrap(async (req, res) => {
  const key = req.params.idOrSlug;
  const { data, error } = await db.from('products').select('*').eq(UUID.test(key) ? 'id' : 'slug', key).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Product not found');
  res.json(data);
}));

// ---------- admin ----------
router.post('/', requireAuth, requireAdmin, wrap(async (req, res) => {
  const product = pickProduct(req.body || {}, { partial: false });
  const { data, error } = await db.from('products').insert(product).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

router.patch('/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const changes = pickProduct(req.body || {}, { partial: true });
  if (!Object.keys(changes).length) throw httpError(400, 'Nothing to update');
  const { data, error } = await db.from('products').update(changes).eq('id', req.params.id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Product not found');
  res.json(data);
}));

// "Delete" hides the product (past orders keep pointing at it)
router.delete('/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { error } = await db.from('products').update({ active: false }).eq('id', req.params.id);
  if (error) throw error;
  res.status(204).end();
}));

export default router;
