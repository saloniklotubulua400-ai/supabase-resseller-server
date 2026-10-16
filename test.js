// Usage (from the project folder, with the server running in another terminal):
//   node test.js
// Optional: TEST_EMAIL=you@gmail.com TEST_PASSWORD=secret123 node test.js

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const PASSWORD = process.env.TEST_PASSWORD || 'secret123';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function report(name, r, extra = '') {
  console.log(`${r.ok ? '✅' : '❌'} ${name} (HTTP ${r.status}) ${extra}`);
  if (!r.ok) console.log('   ', JSON.stringify(r.data));
}

async function main() {
  console.log(`Testing ${BASE} as ${EMAIL}\n`);

  let r = await call('GET', '/api/health');
  report('Health check', r, r.data?.supabase ? `- supabase: ${r.data.supabase}` : '');
  if (!r.ok) return console.log('\nStop: fix the Supabase connection first (check your .env keys).');

  r = await call('POST', '/api/auth/signup', { email: EMAIL, password: PASSWORD });
  report('Sign up', r, r.ok ? '' : '(fine if the user already exists)');

  r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  report('Log in', r);
  const token = r.data?.session?.access_token;
  if (!token) {
    return console.log(
      '\nStop: no token. If the error says "Email not confirmed", turn off "Confirm email" in\n' +
      'Supabase -> Authentication -> Providers -> Email, or confirm the user in Authentication -> Users.'
    );
  }

  r = await call('GET', '/api/auth/me', null, token);
  report('Get current user', r, r.data?.user?.email || '');

  r = await call('POST', '/api/items', { title: 'First item', description: 'It works' }, token);
  report('Create item', r);
  const id = r.data?.id;
  if (!id) return console.log('\nStop: could not create an item. Did you run sql/schema.sql in Supabase?');

  r = await call('GET', '/api/items', null, token);
  report('List items', r, Array.isArray(r.data) ? `- ${r.data.length} item(s)` : '');

  r = await call('PATCH', `/api/items/${id}`, { title: 'Updated title' }, token);
  report('Update item', r, r.data?.title ? `- title now "${r.data.title}"` : '');

  r = await call('DELETE', `/api/items/${id}`, null, token);
  report('Delete item', r);

  console.log('\nDone.');
}

main().catch((e) => console.error('Could not reach the server. Is `npm run dev` running?\n', e.message));
