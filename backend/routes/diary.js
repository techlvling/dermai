const express = require('express');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SELECT_COLS = 'log_date, water_liters, stress_1_5, sleep_hours, mood, notes, sun_minutes, alcohol_drinks, symptoms, wellness_score, scan_id';

// Allowed symptom values — must stay in sync with lifestyle-modal.js chip set.
const ALLOWED_SYMPTOMS = ['acne_flare', 'dryness', 'redness', 'irritation', 'breakout'];

function createDiaryRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // GET /api/diary?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Defaults: last 30 days through today.
  router.get('/api/diary', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const fromDate = DATE_RE.test(req.query.from) ? req.query.from : defaultFrom.toISOString().slice(0, 10);
    const toDate   = DATE_RE.test(req.query.to)   ? req.query.to   : today.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('diary_entries')
      .select(SELECT_COLS)
      .eq('user_id', req.user.id)
      .gte('log_date', fromDate)
      .lte('log_date', toDate)
      .order('log_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ entries: data });
  });

  // POST /api/diary — upsert a day's entry. Partial upserts: only fields the
  // client sends are written, so the lifestyle modal can save symptoms without
  // clobbering an earlier water entry from the same day.
  router.post('/api/diary', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const {
      log_date,
      water_liters, stress_1_5, sleep_hours, mood, notes,
      sun_minutes, alcohol_drinks, symptoms, wellness_score, scan_id,
    } = req.body || {};

    if (!DATE_RE.test(log_date)) {
      return res.status(400).json({ error: 'log_date is required (YYYY-MM-DD)' });
    }
    if (water_liters != null && (typeof water_liters !== 'number' || water_liters < 0 || water_liters > 10)) {
      return res.status(400).json({ error: 'water_liters must be 0–10' });
    }
    if (stress_1_5 != null && (!Number.isInteger(stress_1_5) || stress_1_5 < 1 || stress_1_5 > 5)) {
      return res.status(400).json({ error: 'stress_1_5 must be an integer 1–5' });
    }
    if (sleep_hours != null && (typeof sleep_hours !== 'number' || sleep_hours < 0 || sleep_hours > 24)) {
      return res.status(400).json({ error: 'sleep_hours must be 0–24' });
    }
    if (sun_minutes != null && (!Number.isInteger(sun_minutes) || sun_minutes < 0 || sun_minutes > 720)) {
      return res.status(400).json({ error: 'sun_minutes must be an integer 0–720' });
    }
    if (alcohol_drinks != null && (!Number.isInteger(alcohol_drinks) || alcohol_drinks < 0 || alcohol_drinks > 20)) {
      return res.status(400).json({ error: 'alcohol_drinks must be an integer 0–20' });
    }
    if (symptoms != null) {
      if (!Array.isArray(symptoms) || symptoms.length > 8) {
        return res.status(400).json({ error: 'symptoms must be an array of up to 8 entries' });
      }
      for (const s of symptoms) {
        if (typeof s !== 'string' || !ALLOWED_SYMPTOMS.includes(s)) {
          return res.status(400).json({ error: `symptoms entries must be one of: ${ALLOWED_SYMPTOMS.join(', ')}` });
        }
      }
    }
    if (wellness_score != null && (!Number.isInteger(wellness_score) || wellness_score < 0 || wellness_score > 100)) {
      return res.status(400).json({ error: 'wellness_score must be an integer 0–100' });
    }
    if (scan_id != null && !Number.isInteger(scan_id)) {
      return res.status(400).json({ error: 'scan_id must be an integer' });
    }

    // Build a row containing only the fields the client sent so partial
    // upserts don't clobber columns the user hasn't touched today.
    const row = { user_id: req.user.id, log_date };
    if (water_liters   != null) row.water_liters   = water_liters;
    if (stress_1_5     != null) row.stress_1_5     = stress_1_5;
    if (sleep_hours    != null) row.sleep_hours    = sleep_hours;
    if (mood           != null) row.mood           = mood;
    if (notes          != null) row.notes          = notes;
    if (sun_minutes    != null) row.sun_minutes    = sun_minutes;
    if (alcohol_drinks != null) row.alcohol_drinks = alcohol_drinks;
    if (symptoms       != null) row.symptoms       = symptoms;
    if (wellness_score != null) row.wellness_score = wellness_score;
    if (scan_id        != null) row.scan_id        = scan_id;

    const { data, error } = await supabase
      .from('diary_entries')
      .upsert(row, { onConflict: 'user_id,log_date', ignoreDuplicates: false })
      .select(SELECT_COLS)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ entry: data });
  });

  return router;
}

module.exports = createDiaryRouter;
module.exports.ALLOWED_SYMPTOMS = ALLOWED_SYMPTOMS;
