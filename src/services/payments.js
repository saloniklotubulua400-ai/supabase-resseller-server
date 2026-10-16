import crypto from 'crypto';
import { supabaseAdmin as db } from '../config/supabase.js';
import { markOrderPaid } from './fulfillment.js';

const provider = () => (process.env.PAYMENT_PROVIDER || 'manual').toLowerCase();

function paystackKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw Object.assign(new Error('PAYSTACK_SECRET_KEY is not set'), { status: 500 });
  return key;
}

/** Starts a payment for an order. Returns what the client needs to continue. */
export async function initializePayment({ order, email }) {
  if (provider() === 'paystack') {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: order.total_cents, // Paystack uses the smallest currency unit
        currency: order.currency,
        reference: order.id,
        callback_url: process.env.PAYMENT_CALLBACK_URL || undefined,
        metadata: { order_id: order.id },
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.status) {
      throw Object.assign(new Error(json.message || 'Could not start payment'), { status: 502 });
    }
    return { provider: 'paystack', checkout_url: json.data.authorization_url, reference: json.data.reference };
  }
  return { provider: 'manual', message: 'Order created. Pay offline; an admin will confirm your payment.' };
}

export function isValidPaystackSignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = crypto.createHmac('sha512', paystackKey()).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function verifyPaystackTransaction(reference) {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackKey()}` },
  });
  const json = await res.json();
  if (!res.ok || !json.status) throw Object.assign(new Error(json.message || 'Verify failed'), { status: 502 });
  return json.data;
}

/** Checks a Paystack transaction against our order (amount + currency) and fulfills it. */
export async function settlePaystackTransaction(tx) {
  const { data: order, error } = await db.from('orders').select('*').eq('id', tx.reference).maybeSingle();
  if (error) throw error;
  if (!order) return { ok: false, reason: 'order not found' };
  if (tx.status !== 'success' || tx.amount !== order.total_cents || tx.currency !== order.currency) {
    console.warn('Paystack mismatch for order', order.id, { status: tx.status, amount: tx.amount, currency: tx.currency });
    return { ok: false, reason: 'amount/currency/status mismatch' };
  }
  await markOrderPaid(order.id, { reference: tx.reference });
  return { ok: true };
}
