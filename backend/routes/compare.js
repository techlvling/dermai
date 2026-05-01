const express  = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const compareLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comparisons. Please wait before trying again.' }
});

function createCompareRouter(verifyAuth, getSupabaseAdmin, getAIStudioClient, getClient, upload) {
  const router = express.Router();

  router.post(
    '/api/compare',
    verifyAuth,
    compareLimit,
    upload.fields([{ name: 'image_a', maxCount: 1 }, { name: 'image_b', maxCount: 1 }]),
    async (req, res) => {
      const { scan_a_id, scan_b_id } = req.body;
      const files = req.files || {};

      if (!scan_a_id) return res.status(400).json({ error: 'scan_a_id is required' });
      if (!scan_b_id) return res.status(400).json({ error: 'scan_b_id is required' });

      const hasA = !!files.image_a?.[0];
      const hasB = !!files.image_b?.[0];
      if (hasA !== hasB) {
        return res.status(400).json({ error: 'Provide both image_a and image_b, or neither.' });
      }
      const isVisualMode = hasA && hasB;

      const db = getSupabaseAdmin();
      if (!db) return res.status(503).json({ error: 'Database not configured' });

      // Check narrative cache — ignore entries older than 30 days
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await db
          .from('scan_comparisons')
          .select('narrative')
          .eq('user_id', req.user.id)
          .eq('scan_a_id', scan_a_id)
          .eq('scan_b_id', scan_b_id)
          .gte('created_at', thirtyDaysAgo)
          .maybeSingle();
        if (cached?.narrative) {
          return res.json({ narrative: cached.narrative });
        }
      } catch (_) {}

      const { data, error } = await db
        .from('scans')
        .select('id, result_json')
        .in('id', [scan_a_id, scan_b_id])
        .eq('user_id', req.user.id);

      if (error) {
        console.error('[compare] db error:', error.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
      if (!data || data.length < 2) {
        return res.status(404).json({ error: 'Scan not found or access denied' });
      }

      const aiStudio   = getAIStudioClient();
      const openRouter = getClient();
      if (!aiStudio && !openRouter) return res.status(500).json({ error: 'AI service not configured' });

      let messages;

      if (isVisualMode) {
        const fileA = files.image_a[0];
        const fileB = files.image_b[0];
        const prompt =
          'You are a dermatologist. Image 1 is an older skin scan; Image 2 is a more recent ' +
          'scan of the same patient. In 3–5 sentences, describe what has visibly changed — ' +
          'improvements, regressions, or no change. Be specific about concerns like acne, ' +
          'texture, tone, and pores. Write in plain English, directly to the patient.';
        messages = [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${fileA.mimetype};base64,${fileA.buffer.toString('base64')}` } },
            { type: 'image_url', image_url: { url: `data:${fileB.mimetype};base64,${fileB.buffer.toString('base64')}` } },
          ]
        }];
      } else {
        const scanA = data.find(s => s.id === scan_a_id);
        const scanB = data.find(s => s.id === scan_b_id);
        if (!scanA?.result_json || !scanB?.result_json) {
          return res.status(400).json({ error: 'Scan data not available for comparison.' });
        }
        const fmt = (r) => {
          const concerns = (r.concerns || [])
            .map(c => `  - ${c.name} (severity ${c.severity}/100): ${c.description}`)
            .join('\n');
          return `Overall health: ${r.overallHealth}/100\nSkin type: ${r.skinType}\nConcerns:\n${concerns || '  None reported'}`;
        };
        const prompt =
          'You are a dermatologist reviewing AI-generated skin analyses for the same patient.\n\n' +
          `Earlier scan:\n${fmt(scanA.result_json)}\n\n` +
          `More recent scan:\n${fmt(scanB.result_json)}\n\n` +
          'In 3–5 sentences, describe what has changed — improvements, regressions, or no significant change. ' +
          'Be specific about the concerns listed. Write in plain English, directly to the patient.';
        messages = [{ role: 'user', content: prompt }];
      }

      const providerChain = [
        { client: aiStudio,   model: 'gemma-4-31b-it',       label: 'aistudio:gemma-4-31b-it' },
        { client: aiStudio,   model: 'gemma-4-26b-a4b-it',   label: 'aistudio:gemma-4-26b-a4b-it' },
        { client: openRouter, model: 'google/gemma-3-27b-it:free', label: 'openrouter:gemma-3-27b' },
      ];

      let narrative = null;
      let lastError = null;
      let quotaHit = false;

      for (const { client, model, label } of providerChain) {
        if (!client) continue;
        try {
          console.log(`[compare] trying ${label}`);
          const completion = await client.chat.completions.create({
            model,
            messages,
            temperature: 0.3,
            max_tokens: 400,
          });
          narrative = completion.choices[0].message.content?.trim();
          console.log(`[compare] success: ${label}`);
          break;
        } catch (err) {
          const msg = String(err.message || err);
          console.warn(`[compare] ${label} failed:`, msg.slice(0, 200));
          if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
            quotaHit = true;
          }
          lastError = err;
        }
      }

      if (!narrative) {
        if (quotaHit) return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment and try again.' });
        throw lastError || new Error('All AI models failed');
      }

      // Save to cache (best-effort)
      try {
        await db.from('scan_comparisons').upsert(
          { user_id: req.user.id, scan_a_id, scan_b_id, narrative },
          { onConflict: 'user_id,scan_a_id,scan_b_id' }
        );
      } catch (_) {}

      res.json({ narrative });
    }
  );

  return router;
}

module.exports = createCompareRouter;
