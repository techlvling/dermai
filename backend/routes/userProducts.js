const express = require('express');

const CATEGORIES = ['cleanser', 'treatment', 'moisturizer', 'sunscreen'];
const TIMES_OF_DAY = ['AM', 'PM', 'both'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createUserProductsRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // GET /api/user-products — list all products for the current user
  router.get('/api/user-products', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { data, error } = await supabase
      .from('user_products')
      .select('id, name, brand, category, best_time_of_day, ingredients, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ products: data });
  });

  // POST /api/user-products — add a product the user owns
  router.post('/api/user-products', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { name, brand, category, best_time_of_day, ingredients } = req.body || {};

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    if (!TIMES_OF_DAY.includes(best_time_of_day)) {
      return res.status(400).json({ error: `best_time_of_day must be one of: ${TIMES_OF_DAY.join(', ')}` });
    }
    if (ingredients != null && (!Array.isArray(ingredients) || ingredients.some(i => typeof i !== 'string'))) {
      return res.status(400).json({ error: 'ingredients must be an array of strings' });
    }

    const row = {
      user_id: req.user.id,
      name: name.trim(),
      brand: typeof brand === 'string' ? brand.trim() || null : null,
      category,
      best_time_of_day,
      ingredients: Array.isArray(ingredients) ? ingredients : [],
    };

    const { data, error } = await supabase
      .from('user_products')
      .insert(row)
      .select('id, name, brand, category, best_time_of_day, ingredients, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ product: data });
  });

  // DELETE /api/user-products/:id — owner-only via RLS + explicit user_id filter
  router.delete('/api/user-products/:id', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'invalid id' });
    }

    const { error } = await supabase
      .from('user_products')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).end();
  });

  return router;
}

module.exports = createUserProductsRouter;
