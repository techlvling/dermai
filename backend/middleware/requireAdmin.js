// Reads ADMIN_EMAILS (comma-separated) from env and 403s non-admins.
// Must run AFTER verifyAuth so req.user is already populated.
const _adminSet = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

function requireAdmin(req, res, next) {
  const email = req.user?.email?.toLowerCase();
  if (!email || !_adminSet.has(email)) {
    return res.status(403).json({ error: 'Forbidden: admin access only' });
  }
  next();
}

module.exports = { requireAdmin };
