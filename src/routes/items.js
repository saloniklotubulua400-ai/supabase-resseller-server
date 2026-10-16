import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const TABLE = 'items';

// GET /api/items
router.get('/', async (req, res) => {
  const { data, error } = await req.supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/items/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await req.supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Item not found' });
  res.json(data);
});

// POST /api/items
router.post('/', async (req, res) => {
  const { title, description } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });

  const { data, error } = await req.supabase
    .from(TABLE)
    .insert({ title, description, user_id: req.user.id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/items/:id
router.patch('/:id', async (req, res) => {
  const { title, description } = req.body || {};
  const { data, error } = await req.supabase
    .from(TABLE)
    .update({ title, description })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(404).json({ error: 'Item not found or not allowed' });
  res.json(data);
});

// DELETE /api/items/:id
router.delete('/:id', async (req, res) => {
  const { error } = await req.supabase.from(TABLE).delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
