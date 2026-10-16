import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.'
  );
}

const baseOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** Admin client: bypasses Row Level Security. Use only for trusted server tasks. */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, baseOptions);

/** Anon client: used for sign up / sign in. */
export const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, baseOptions);

/** Per-user client: acts as the logged-in user, so Row Level Security applies. */
export const supabaseForUser = (accessToken) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
