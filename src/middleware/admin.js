import { supabaseAdmin } from '../config/supabase.js';

/** Use after requireAuth. Allows only users whose profiles.role = 'admin'. */
export async function requireAdmin(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .maybeSingle();
    if (error || data?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
}
