import { Router } from 'express';
import { supabaseAnon } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const validate = (body) => {
  const { email, password } = body || {};
  if (!email || !password) return 'email and password are required';
  if (password.length < 6) return 'password must be at least 6 characters';
  return null;
};

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const problem = validate(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const { data, error } = await supabaseAnon.auth.signUp({
    email: req.body.email,
    password: req.body.password,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user, session: data.session });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const problem = validate(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: req.body.email,
    password: req.body.password,
  });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
