// Vercel-cron endpoint that refreshes the ingredient evidence cache from
// PubMed once a week. Auth via the CRON_SECRET env var so random callers
// can't spam NCBI on our behalf.
//
// Schedule lives in vercel.json. Vercel hits this path with
// `Authorization: Bearer ${CRON_SECRET}` automatically when the cron fires.

const { fetchAllIngredients } = require('../lib/pubmed-fetcher');

// Returns the bare Express handler so server.js can mount it directly on app
// (not via a sub-router). Mounting via a router was causing the request to
// fall through to other routers' verifyAuth middleware before reaching here.
function createHandler(getSupabaseAdmin) {
  return async (req, res) => {
    // Auth gate. If CRON_SECRET isn't configured, reject every request to
    // avoid an unauthenticated open scraping endpoint.
    const expected = process.env.CRON_SECRET;
    if (!expected) return res.status(500).json({ error: 'CRON_SECRET not configured' });
    const got = req.headers['authorization'] || '';
    if (got !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Invalid CRON_SECRET' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const startedAt = Date.now();
    const logs = [];
    try {
      const ingredients = await fetchAllIngredients({
        log: msg => logs.push(msg),
        perCallDelayMs: 350,
      });
      const totalStudies = ingredients.reduce((s, i) => s + (i.keyStudies?.length || 0), 0);

      // Stamp last_refreshed onto each ingredient AND on the singleton row
      // so the frontend can tell both per-ingredient + global freshness.
      const refreshedAt = new Date().toISOString();
      const stamped = ingredients.map(i => ({ ...i, last_refreshed: refreshedAt }));

      const { error } = await supabase
        .from('evidence_cache')
        .update({ ingredients: stamped, last_refreshed: refreshedAt })
        .eq('id', 'singleton');
      if (error) return res.status(500).json({ error: error.message, logs });

      const elapsedMs = Date.now() - startedAt;
      return res.json({
        ok: true,
        ingredients_count: ingredients.length,
        total_studies: totalStudies,
        elapsed_ms: elapsedMs,
        refreshed_at: refreshedAt,
        log_count: logs.length,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message, logs });
    }
  };
}

module.exports = { handler: createHandler };
