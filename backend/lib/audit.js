const { getSupabaseAdmin } = require('./supabase');

function insertAuditLog(req, { action, resourceType, resourceId, payload }) {
  const db = getSupabaseAdmin();
  if (!db) return;
  db.from('admin_audit_log').insert({
    admin_email:   req.user?.email || 'unknown',
    action,
    resource_type: resourceType || null,
    resource_id:   resourceId != null ? String(resourceId) : null,
    payload:       payload || null,
  }).then().catch(() => {});
}

module.exports = { insertAuditLog };
