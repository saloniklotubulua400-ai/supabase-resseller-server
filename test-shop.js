// Tests the reseller flow end to end (manual payment mode).
// Needs: server running, sql/schema_shop.sql executed, and YOUR user promoted to admin:
//   update public.profiles set role = 'admin' where email = 'you@example.com';
//
// Run:  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpass node test-shop.js

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const EMAIL = process.env.ADMIN_EMAIL || process.env.TEST_EMAIL || 'test@example.com';
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.TEST_PASSWORD || 'secret123';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}
const report = (name, r, extra = '') => {
  console.log(`${r.ok ? '✅' : '❌'} ${name} (HTTP ${r.status}) ${extra}`);
  if (!r.ok) console.log('   ', JSON.stringify(r.data));
  return r.ok;
};

async function main() {
  console.log(`Testing shop flow on ${BASE} as ${EMAIL}\n`);

  let r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (!report('Log in', r)) return;
  const token = r.data.session.access_token;

  r = await call('GET', '/api/admin/stats', null, token);
  if (!report('Admin access', r)) {
    return console.log("\nYour user isn't an admin yet. Run in Supabase SQL Editor:\n  update public.profiles set role = 'admin' where email = '" + EMAIL + "';");
  }

  const slug = 'test-vpn-' + Date.now();
  r = await call('POST', '/api/products', { name: 'Test VPN 1 Month', slug, description: 'Demo', category: 'vpn', price_cents: 999, currency: 'USD', billing_type: 'monthly', fulfillment_type: 'license_key' }, token);
  if (!report('Create product (license_key)', r)) return;
  const autoId = r.data.id;

  r = await call('POST', '/api/products', { name: 'Test Account Setup ' + Date.now(), price_cents: 2500, fulfillment_type: 'manual' }, token);
  if (!report('Create product (manual delivery)', r)) return;
  const manualId = r.data.id;

  r = await call('GET', '/api/products');
  report('Public product list', r, Array.isArray(r.data) ? `- ${r.data.length} product(s)` : '');

  r = await call('POST', '/api/orders', { items: [{ product_id: autoId, quantity: 2 }, { product_id: manualId, quantity: 1 }] }, token);
  if (!report('Create order', r, r.data?.order ? `- total ${r.data.order.total_cents} ${r.data.order.currency}` : '')) return;
  const orderId = r.data.order.id;

  r = await call('POST', `/api/admin/orders/${orderId}/mark-paid`, null, token);
  if (!report('Mark order paid (delivers licenses)', r)) return;

  r = await call('GET', '/api/licenses', null, token);
  report('My licenses', r, Array.isArray(r.data) ? `- ${r.data.length} license(s)` : '');
  const pending = (r.data || []).find((l) => l.status === 'pending_delivery');
  const sample = (r.data || []).find((l) => l.license_key);
  if (sample) console.log('   sample key:', sample.license_key);

  if (pending) {
    r = await call('PATCH', `/api/admin/licenses/${pending.id}/deliver`, { delivery_details: 'username: demo / password: demo123' }, token);
    report('Deliver manual service', r);
  }

  r = await call('GET', `/api/orders/${orderId}`, null, token);
  report('Order status', r, r.data?.status ? `- ${r.data.status}` : '');

  r = await call('GET', '/api/admin/stats', null, token);
  report('Stats', r);
  console.log('   ', JSON.stringify(r.data));

  await call('DELETE', `/api/products/${autoId}`, null, token);
  await call('DELETE', `/api/products/${manualId}`, null, token);
  console.log('\nDone. (Test products were hidden again.)');
}
main().catch((e) => console.error('Could not reach the server. Is `npm run dev` running?\n', e.message));
