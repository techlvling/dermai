const express = require('express');
const { GROQ_VISION_MODELS } = require('../lib/ai-models');

function createAnalyzeRouter(upload, analyzeLimit, getClient, getGroqClient) {
  const router = express.Router();

  router.post('/api/analyze', analyzeLimit, upload.array('images', 3), async (req, res) => {
    try {
      const files = req.files || [];

      if (files.length === 0) {
        return res.status(400).json({ error: 'No image received. Field name must be "images".' });
      }

      const client = getClient();
      if (!client) {
        return res.status(500).json({ error: 'Analysis service not available.' });
      }

      const imageContents = files.map(file => ({
        type: 'image_url',
        image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` }
      }));

      const count     = files.length;
      const photoWord = count === 1 ? 'photo' : `${count} photos (front, left, right)`;

      const prompt =
        `You are an expert dermatologist. You are looking at ${photoWord} of a patient's face.\n` +
        (count > 1 ? 'Aggregate findings across all angles. Use the worst-angle severity for each concern.\n' : '') +
        '\nReturn ONLY a raw JSON object — no markdown fences, no explanation:\n' +
        '{"overallHealth":72,"skinType":"Combination","concerns":[' +
        '{"name":"Acne","severity":65,"description":"Active breakouts on forehead and chin."},' +
        '{"name":"Hyperpigmentation","severity":40,"description":"Mild post-inflammatory dark spots."}' +
        ']}\n\n' +
        'Rules:\n' +
        '- overallHealth: integer 1-100 (100 = perfect skin)\n' +
        '- skinType: exactly one of Oily, Dry, Combination, Normal\n' +
        '- concerns: 1-5 items, only what is actually visible in the image(s)\n' +
        '  - name: one of Acne, Hyperpigmentation, Pores, Fine Lines, Texture, Dryness, Oiliness, Sensitivity\n' +
        '  - severity: integer 1-100\n' +
        '  - description: 1-2 plain-English sentences about what you observe\n' +
        'Raw JSON only. No markdown.';

      const messages = [{
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...imageContents]
      }];

      const modelsToTry = [
        'qwen/qwen2.5-vl-72b-instruct:free',
        'meta-llama/llama-3.2-90b-vision-instruct:free',
        'meta-llama/llama-3.2-11b-vision-instruct:free',
        'google/gemma-4-31b-it:free',
        'google/gemma-3-27b-it:free',
      ];

      let aiResponse = null;
      let lastError  = null;
      let quotaHit   = false;

      for (const model of modelsToTry) {
        try {
          console.log(`[analyze] ${model} — ${count} image(s)`);
          const completion = await client.chat.completions.create({
            model,
            messages,
            temperature: 0.3,
            max_tokens: 800
          });
          aiResponse = completion.choices[0].message.content;
          console.log(`[analyze] success: ${model}`);
          break;
        } catch (err) {
          const msg = String(err.message || err);
          console.warn(`[analyze] ${model} failed:`, msg.slice(0, 300));
          if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
            quotaHit = true;
          }
          lastError = err;
        }
      }

      // Groq fallback when OpenRouter chain exhausts
      if (!aiResponse) {
        const groq = getGroqClient();
        if (groq) {
          for (const model of GROQ_VISION_MODELS) {
            try {
              console.log(`[analyze] groq:${model} — ${count} image(s)`);
              const completion = await groq.chat.completions.create({
                model,
                messages,
                temperature: 0.3,
                max_tokens: 800
              });
              aiResponse = completion.choices[0].message.content;
              quotaHit = false;
              console.log(`[analyze] success: groq:${model}`);
              break;
            } catch (err) {
              const msg = String(err.message || err);
              console.warn(`[analyze] groq:${model} failed:`, msg.slice(0, 300));
              lastError = err;
            }
          }
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
