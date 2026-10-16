import crypto from 'crypto';
import { supabaseAdmin as db } from '../config/supabase.js';

export const generateLicenseKey = () =>
  crypto.randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g).join('-');

function expiryFor(billingType) {
  const d = new Date();
  if (billingType === 'monthly') { d.setMonth(d.getMonth() + 1); return d.toISOString(); }
  if (billingType === 'yearly') { d.setFullYear(d.getFullYear() + 1); return d.toISOString(); }
  return null;
}

/**
 * Marks a pending order as paid and delivers it. Safe to call many times
 * (webhooks retry): only the first call that flips pending -> paid does the work.
 */
export async function markOrderPaid(orderId, { reference } = {}) {
  const update = { status: 'paid', paid_at: new Date().toISOString() };
  if (reference) update.payment_reference = reference;

  const { data: order, error } = await db
    .from('orders')
    .update(update)
    .eq('id', orderId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!order) return { alreadyProcessed: true };

  const { data: items, error: itemsErr } = await db
    .from('order_items')
    .select('*, products(fulfillment_type, billing_type, stock)')
    .eq('order_id', orderId);
  if (itemsErr) throw itemsErr;

  const licenses = [];
  for (const item of items) {
    const p = item.products;
    const auto = p.fulfillment_type === 'license_key';
    for (let i = 0; i < item.quantity; i++) {
      licenses.push({
        order_id: orderId,
        order_item_id: item.id,
        user_id: order.user_id,
        product_id: item.product_id,
        license_key: auto ? generateLicenseKey() : null,
        status: auto ? 'active' : 'pending_delivery',
        expires_at: expiryFor(p.billing_type),
      });
    }
    if (p.stock !== null) {
      await db.from('products').update({ stock: Math.max(0, p.stock - item.quantity) }).eq('id', item.product_id);
    }
  }

  if (licenses.length) {
    const { error: licErr } = await db.from('licenses').insert(licenses);
    if (licErr) throw licErr;
  }

  await refreshOrderStatus(orderId);
  return { alreadyProcessed: false };
}

/** An order becomes 'fulfilled' once nothing is waiting for manual delivery. */
export async function refreshOrderStatus(orderId) {
  const { count, error } = await db
    .from('licenses')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('status', 'pending_delivery');
  if (error) throw error;
  if (count === 0) {
    await db.from('orders').update({ status: 'fulfilled' }).eq('id', orderId).eq('status', 'paid');
  }
}
