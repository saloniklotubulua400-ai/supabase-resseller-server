import { supabaseAdmin, supabaseForUser } from '../config/supabase.js';

/** Requires a valid Supabase JWT: Authorization: Bearer <access_token> */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' });

    req.user = data.user;
    req.token = token;
    req.supabase = supabaseForUser(token); // RLS-aware client for this request
    next();
  } catch (err) {
    next(err);
  }
}
