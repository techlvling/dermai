const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');
const { insertAuditLog } = require('../../lib/audit');

const router = Router();

// Supported catalog resource types and their table names
const RESOURCES = {
  products:    'products',
  ingredients: 'ingredients',
  concerns:    'concerns',
  conflicts:   'conflicts',
};

function getTable(resource) {
  return RESOURCES[resource] || null;
}

// GET /api/admin/catalog/:resource?limit=50&page=1
router.get('/:resource', async (req, res) => {
  const table = getTable(req.params.resource);
  if (!table) return res.status(404).json({ error: 'Unknown resource' });

  try {
    const supabase = getSupabaseAdmin();
    const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
    const page   = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .order('id')
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ items: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error(`[admin/catalog] GET /${req.params.resource}`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/catalog/:resource
router.post('/:resource', async (req, res) => {
  const table = getTable(req.params.resource);
  if (!table) return res.status(404).json({ error: 'Unknown resource' });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(table)
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    insertAuditLog(req, { action: 'create', resourceType: req.params.resource, resourceId: data.id, payload: req.body });
    res.status(201).json(data);
  } catch (err) {
    console.error(`[admin/catalog] POST /${req.params.resource}`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/catalog/:resource/:id
router.patch('/:resource/:id', async (req, res) => {
  const table = getTable(req.params.resource);
  if (!table) return res.status(404).json({ error: 'Unknown resource' });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(table)
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    insertAuditLog(req, { action: 'update', resourceType: req.params.resource, resourceId: req.params.id, payload: req.body });
    res.json(data);
  } catch (err) {
    console.error(`[admin/catalog] PATCH /${req.params.resource}/:id`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/catalog/:resource/:id
router.delete('/:resource/:id', async (req, res) => {
  const table = getTable(req.params.resource);
  if (!table) return res.status(404).json({ error: 'Unknown resource' });

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from(table).delete().eq('id', req.params.id);
    if (error) throw error;
    insertAuditLog(req, { action: 'delete', resourceType: req.params.resource, resourceId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error(`[admin/catalog] DELETE /${req.params.resource}/:id`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
