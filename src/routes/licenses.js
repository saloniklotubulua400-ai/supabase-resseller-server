import { Router } from 'express';
import { supabaseAdmin as db } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

// GET /api/licenses  (everything I have bought: keys, credentials, expiry)
router.get('/', wrap(async (req, res) => {
  const { data, error } = await db
    .from('licenses')
    .select('*, products(name, slug, category)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  res.json(data);
}));

export default router;
