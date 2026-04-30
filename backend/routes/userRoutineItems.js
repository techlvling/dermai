const express = require('express');
const fs = require('fs');
const path = require('path');

const SLOTS = ['cleanser', 'treatment', 'moisturizer', 'sunscreen'];
const TIMES = ['AM', 'PM', 'both'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Load catalog product ids once at module load — used to validate that
// product_id refers to a real catalog entry. The catalog is small and
// curated (~20 products); a Set lookup is plenty.
let _catalogIds = null;
function getCatalogIds() {
  if (_catalogIds) return _catalogIds;
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'));
    const products = JSON.parse(raw);
    _catalogIds = new Set(products.map(p => p.id));
  } catch (_) {
    _catalogIds = new Set();
  }
  return _catalogIds;
}

function createUserRoutineItemsRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // GET /api/routine-items — list this user's owned products
  router.get('/api/routine-items', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { data, error } = await supabase
      .from('user_routine_items')
      .select('id, product_id, slot, time_of_day, order_index, added_at')
      .eq('user_id', req.user.id)
      .order('added_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data });
  });

  // POST /api/routine-items — add a catalog product to user's owned list
  router.post('/api/routine-items', async (req, res) => {
    const { product_id, slot, time_of_day, order_index } = req.body || {};

    if (typeof product_id !== 'string' || !product_id.trim()) {
      return res.status(400).json({ error: 'product_id is required' });
    }
    if (!SLOTS.includes(slot)) {
      return res.status(400).json({ error: `slot must be one of: ${SLOTS.join(', ')}` });
    }
    if (!TIMES.includes(time_of_day)) {
      return res.status(400).json({ error: `time_of_day must be one of: ${TIMES.join(', ')}` });
    }
    if (!getCatalogIds().has(product_id)) {
      return res.status(400).json({ error: `product_id ${product_id} not found in catalog` });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const row = {
      user_id: req.user.id,
      product_id,
      slot,
      time_of_day,
      order_index: Number.isInteger(order_index) ? order_index : 0,
    };

    // Upsert behavior: if the same (user, product, slot, time) row already
    // exists, return it. Otherwise insert new.
    const { data, error } = await supabase
      .from('user_routine_items')
      .upsert(row, { onConflict: 'user_id,product_id,slot,time_of_day', ignoreDuplicates: false })
      .select('id, product_id, slot, time_of_day, order_index, added_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ item: data });
  });

  // DELETE /api/routine-items/:id — remove from user's owned list
  router.delete('/api/routine-items/:id', async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'invalid id' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { error } = await supabase
      .from('user_routine_items')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).end();
  });

  return router;
}

module.exports = createUserRoutineItemsRouter;
module.exports.getCatalogIds = getCatalogIds; // exposed for tests
