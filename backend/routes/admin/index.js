const { Router } = require('express');
const { verifyAuth } = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/requireAdmin');

const router = Router();

// All admin routes require a valid Supabase session AND an admin email.
router.use(verifyAuth, requireAdmin);

// ── whoami ─────────────────────────────────────────────────────────────────
router.get('/whoami', (req, res) => {
  res.json({ ok: true, email: req.user.email, id: req.user.id });
});

// ── sub-routers (mounted as they are built) ────────────────────────────────
router.use('/users',    require('./users'));
router.use('/scans',    require('./scans'));
router.use('/reactions',require('./reactions'));
router.use('/diary',    require('./diary'));
router.use('/catalog',  require('./catalog'));
router.use('/evidence', require('./evidence'));
router.use('/ai-usage', require('./aiUsage'));
router.use('/affiliate',require('./affiliate'));
router.use('/analytics',require('./analytics'));
router.use('/audit',   require('./audit'));

module.exports = router;
