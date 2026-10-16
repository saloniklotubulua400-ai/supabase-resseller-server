import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

// GET /api/health  -> checks the server and the Supabase connection
router.get('/', async (req, res) => {
  const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  res.status(error ? 503 : 200).json({
    server: 'ok',
    supabase: error ? `error: ${error.message}` : 'connected',
    time: new Date().toISOString(),
  });
});

export default router;
