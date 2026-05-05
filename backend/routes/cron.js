// Vercel-cron endpoint that refreshes the ingredient evidence cache from
// PubMed once a week. Auth via the CRON_SECRET env var so random callers
// can't spam NCBI on our behalf.
//
// Schedule lives in vercel.json. Vercel hits this path with
// `Authorization: Bearer ${CRON_SECRET}` automatically when the cron fires.

const { fetchAllIngredients } = require('../lib/pubmed-fetcher');

// Core work — shared by the cron HTTP handler and the admin /evidence/refresh endpoint.
async function refreshEvidence(supabase) {
  const startedAt = Date.now();
  const logs = [];
  const ingredients = await fetchAllIngredients({
    log: msg => logs.push(msg),
    perCallDelayMs: 350,
  });
  const totalStudies = ingredients.reduce((s, i) => s + (i.keyStudies?.length || 0), 0);

  const refreshedAt = new Date().toISOString();
  const stamped = ingredients.map(i => ({ ...i, last_refreshed: refreshedAt }));

  const { error } = await supabase
    .from('evidence_cache')
    .update({ ingredients: stamped, last_refreshed: refreshedAt })
    .eq('id', 'singleton');
  if (error) throw new Error(error.message);

  return {
    ingredients_count: ingredients.length,
    total_studies: totalStudies,
    elapsed_ms: Date.now() - startedAt,
    refreshed_at: refreshedAt,
    log_count: logs.length,
    logs,
  };
}

// Returns the bare Express handler so server.js can mount it directly on app
// (not via a sub-router). Mounting via a router was causing the request to
// fall through to other routers' verifyAuth middleware before reaching here.
function createHandler(getSupabaseAdmin) {
  return async (req, res) => {
    const expected = process.env.CRON_SECRET;
    if (!expected) return res.status(500).json({ error: 'CRON_SECRET not configured' });
    const got = req.headers['authorization'] || '';
    if (got !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Invalid CRON_SECRET' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    try {
      const result = await refreshEvidence(supabase);
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

module.exports = { handler: createHandler, refreshEvidence };
