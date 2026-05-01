const express = require('express');

function createAnalyzeRouter(upload, analyzeLimit, getAIStudioClient, getClient) {
  const router = express.Router();

  // Accept the 3 required angles in `images` and up to 3 optional close-ups
  // in `closeups`. Optional `closeup_notes` is a JSON-encoded string array
  // length-matched to `closeups`.
  const fieldsConfig = upload.fields([
    { name: 'images',   maxCount: 3 },
    { name: 'closeups', maxCount: 3 },
  ]);

  router.post('/api/analyze', analyzeLimit, fieldsConfig, async (req, res) => {
    try {
      const filesByField = req.files || {};
      const angleFiles   = filesByField.images   || [];
      const closeupFiles = filesByField.closeups || [];

      if (angleFiles.length === 0) {
        return res.status(400).json({ error: 'No image received. Field name must be "images".' });
      }

      // Notes come in as a JSON string in the multipart body. Tolerate
      // missing / malformed notes — the closeups still go to the AI even
      // without explanatory text.
      let closeupNotes = [];
      if (typeof req.body?.closeup_notes === 'string' && req.body.closeup_notes.trim()) {
        try {
          const parsed = JSON.parse(req.body.closeup_notes);
          if (Array.isArray(parsed)) {
            closeupNotes = parsed.map(n => String(n ?? '').slice(0, 200));
          }
        } catch (_) { /* fall back to empty notes */ }
      }
      // Pad / truncate notes to match closeup count so prompt indexing is safe.
      while (closeupNotes.length < closeupFiles.length) closeupNotes.push('');
      closeupNotes.length = closeupFiles.length;

      const aiStudio   = getAIStudioClient();
      const openRouter = getClient();
      if (!aiStudio && !openRouter) {
        return res.status(500).json({ error: 'Analysis service not available.' });
      }

      const toImageContent = (file) => ({
        type: 'image_url',
        image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` }
      });
      const angleContents   = angleFiles.map(toImageContent);
      const closeupContents = closeupFiles.map(toImageContent);
      const imageContents   = [...angleContents, ...closeupContents];

      const angleCount   = angleFiles.length;
      const closeupCount = closeupFiles.length;
      const angleWord    = angleCount === 1 ? '1 photo' : `${angleCount} photos (front, left, right)`;

      const closeupBlock = closeupCount > 0
        ? '\n\nUSER-FLAGGED CLOSE-UPS:\n' +
          `Photos ${angleCount + 1}-${angleCount + closeupCount} are close-ups the user uploaded ` +
          'to ask about specific spots. The user wrote a short note for each:\n' +
          closeupNotes.map((n, i) => `  ${i + 1}. "${n || '(no note)'}"`).join('\n') +
          '\n\nReturn an additional "spotFindings" array in the JSON, one entry per close-up in the same order. ' +
          'Each spotFinding describes ONLY what is visible in that close-up.\n'
        : '';

      const closeupSchema = closeupCount > 0
        ? `,"spotFindings":[{"note":"this mole on my cheek","observation":"Appears to be a benign symmetric pigmented nevus, ~4mm, even color.","concern":"Mole","severity":20,"seeDerm":true}]`
        : '';

      const closeupRules = closeupCount > 0
        ? '\n- spotFindings: array of EXACTLY ' + closeupCount + ' items, one per close-up in upload order.\n' +
          '  - note: echo the user\'s note string verbatim (or "" if none was given)\n' +
          '  - observation: 1-2 plain-English sentences describing ONLY what you see in this close-up.\n' +
          '  - concern: one of Acne, Hyperpigmentation, Pores, Fine Lines, Texture, Dryness, Oiliness, Sensitivity, Mole, Lesion, Scar, Other.\n' +
          '  - severity: integer 1-100, scoped to this spot only.\n' +
          '  - seeDerm: boolean. MUST be true for ANY of: pigmented mole/nevus, asymmetric pigmented lesion, ' +
          'lesion with irregular borders or multiple colors, growing or changing spot, ' +
          'persistent non-cosmetic lesion, suspicious nail/skin lesion, or anything that warrants in-person evaluation. ' +
          'Bias conservative — when in doubt, set seeDerm to true. ' +
          'Cosmetic-only concerns (acne, mild hyperpigmentation, normal pores) can be false.\n' +
          'IMPORTANT: You are NOT diagnosing. Frame observations as visual descriptions, not diagnoses. ' +
          'NEVER claim a lesion is benign, malignant, cancerous, or "nothing to worry about" — only a clinician can do that.'
        : '';

      const prompt =
        `You are an expert dermatologist. You are looking at ${angleWord} of a patient's face.\n` +
        (angleCount > 1 ? 'Aggregate findings across all angles. Use the worst-angle severity for each concern.\n' : '') +
        closeupBlock +
        '\nReturn ONLY a raw JSON object — no markdown fences, no explanation:\n' +
        '{"overallHealth":72,"skinType":"Combination","concerns":[' +
        '{"name":"Acne","severity":65,"description":"Active breakouts on forehead and chin."},' +
        '{"name":"Hyperpigmentation","severity":40,"description":"Mild post-inflammatory dark spots."}' +
        ']' + closeupSchema + '}\n\n' +
        'Rules:\n' +
        '- overallHealth: integer 1-100 (100 = perfect skin). Base this on the front/left/right angles, not the close-ups.\n' +
        '- skinType: exactly one of Oily, Dry, Combination, Normal\n' +
        '- concerns: 1-5 items, only what is actually visible in the front/left/right images\n' +
        '  - name: one of Acne, Hyperpigmentation, Pores, Fine Lines, Texture, Dryness, Oiliness, Sensitivity\n' +
        '  - severity: integer 1-100\n' +
        '  - description: 1-2 plain-English sentences about what you observe\n' +
        closeupRules + '\n' +
        'Raw JSON only. No markdown.';

      const messages = [{
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...imageContents]
      }];

      const providerChain = [
        { client: aiStudio,   model: 'gemma-4-31b-it',       label: 'aistudio:gemma-4-31b-it' },
        { client: aiStudio,   model: 'gemma-4-26b-a4b-it',   label: 'aistudio:gemma-4-26b-a4b-it' },
        { client: openRouter, model: 'google/gemma-3-27b-it:free', label: 'openrouter:gemma-3-27b' },
      ];

      let aiResponse = null;
      let lastError  = null;
      let quotaHit   = false;

      for (const { client, model, label } of providerChain) {
        if (!client) continue;
        try {
          console.log(`[analyze] ${label} — ${angleCount} angle(s) + ${closeupCount} closeup(s)`);
          const completion = await client.chat.completions.create({
            model,
            messages,
            temperature: 0.3,
            max_tokens: 1500
          });
          aiResponse = completion.choices[0].message.content;
          console.log(`[analyze] success: ${label}`);
          break;
        } catch (err) {
          const msg = String(err.message || err);
          console.warn(`[analyze] ${label} failed:`, msg.slice(0, 300));
          if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
            quotaHit = true;
          }
          lastError = err;
        }
      }

      if (!aiResponse) {
        if (quotaHit) {
          return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment and try again.' });
        }
        throw lastError || new Error('All AI models failed');
      }

      console.log('[analyze] raw output:', aiResponse.slice(0, 400));

      const match = aiResponse.match(/\{[\s\S]*\}/);
      if (!match) {
        return res.status(500).json({ error: 'Analysis failed. Please try again.' });
      }

      let parsed;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return res.status(500).json({ error: 'Analysis failed. Please try again.' });
      }

      res.json(parsed);

    } catch (err) {
      console.error('[analyze] error:', err.message || err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}

module.exports = createAnalyzeRouter;
