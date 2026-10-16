# Supabase + Express: Software Reseller Server

Sell software services online: product catalog, orders, payments, automatic license keys,
manual delivery for services you fulfil by hand, and an admin API.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase keys.
3. Supabase -> SQL Editor: run `sql/schema_shop.sql`.
4. Sign up through `POST /api/auth/signup`, then make yourself admin in the SQL Editor:
   `update public.profiles set role = 'admin' where email = 'you@example.com';`
5. `npm run dev`, then in another terminal `ADMIN_EMAIL=... ADMIN_PASSWORD=... node test-shop.js`

## How selling works
- You create **products** (price in cents: 1999 = 19.99).
  - `fulfillment_type: license_key` -> a key is generated automatically after payment.
  - `fulfillment_type: manual` -> you deliver credentials/instructions via the admin API.
- A customer creates an **order** -> the server calculates the total from the database.
- Payment:
  - `PAYMENT_PROVIDER=manual`: you confirm payment with `POST /api/admin/orders/:id/mark-paid`.
  - `PAYMENT_PROVIDER=paystack`: the order response contains a `checkout_url`; Paystack calls
    `/api/payments/webhook/paystack` when paid (needs a public URL, e.g. your deployed server or ngrok).
- On payment the order is fulfilled and licenses appear in `GET /api/licenses`.

## Endpoints
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | /api/health | public | Connection check |
| POST | /api/auth/signup, /login | public | Accounts |
| GET | /api/auth/me | user | Current user |
| GET | /api/products, /api/products/:idOrSlug | public | Catalog |
| POST/PATCH/DELETE | /api/products(/:id) | admin | Manage products (DELETE hides) |
| POST | /api/orders | user | `{ items: [{ product_id, quantity }] }` |
| GET | /api/orders, /api/orders/:id | user | My orders |
| GET | /api/licenses | user | My keys / credentials |
| GET | /api/payments/verify/:orderId | user | Re-check payment after checkout |
| POST | /api/payments/webhook/paystack | Paystack | Payment confirmation |
| GET | /api/admin/stats, /orders, /customers, /licenses | admin | Dashboard data |
| POST | /api/admin/orders/:id/mark-paid | admin | Confirm offline payment |
| PATCH | /api/admin/licenses/:id/deliver | admin | Deliver a manual service |
| POST | /api/admin/licenses/:id/revoke | admin | Revoke access |

Authenticated routes need `Authorization: Bearer <access_token>`.

## Known limits (fine to start, improve later)
- Recurring billing: `monthly`/`yearly` set an expiry date, but renewals are not charged automatically yet.
- Stock is reduced when an order is paid; two simultaneous buyers of the last unit could both succeed.
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret. Admin and payment routes depend on it.
# supabase-resseller-server
# supabase-resseller-server
