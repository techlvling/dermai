(function () {
  async function migrateToServer(userId, token) {
    const migrationKey = `dermai:migrated:${userId}`;
    if (localStorage.getItem(migrationKey)) return; // already done

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // Helper: POST to an endpoint, log HTTP errors and exceptions
    async function post(url, body) {
      try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) console.warn('[Migration] POST', url, 'returned', res.status);
      } catch (e) {
        console.warn('[Migration] POST', url, 'failed:', e.message);
      }
    }

    // 1. Scans (modern format only)
    const history = Storage.get('dermAI_history') || [];
    for (const entry of history) {
      if (entry.analysis) {
        await post('/api/scans', { result_json: entry.analysis });
      }
    }

    // 2. Favorites
    const favorites = Storage.get('dermAI_favorites') || [];
    for (const productId of favorites) {
      if (productId) await post('/api/favorites', { product_id: String(productId) });
    }

    // 3. Routine logs — send the full per-step shape directly (matches
    //    the backend's steps_done jsonb column added in migration 0004).
    const routineLog = Storage.get('dermAI_routineLog') || {};
    for (const [date, dayLog] of Object.entries(routineLog)) {
      if (!dayLog || typeof dayLog !== 'object') continue;
      await post('/api/routine', { log_date: date, steps_done: dayLog });
    }

    // 3b. Diary entries — backfill water/stress/sleep from local cache so a
    //     user's history follows them after sign-in.
    const diary = Storage.get('dermAI_diary') || {};
    for (const [date, entry] of Object.entries(diary)) {
      if (!entry || typeof entry !== 'object') continue;
      const body = { log_date: date };
      if (typeof entry.water  === 'number') body.water_liters = entry.water;
      if (typeof entry.stress === 'number') body.stress_1_5   = entry.stress;
      if (typeof entry.sleep  === 'number') body.sleep_hours  = entry.sleep;
      if (Object.keys(body).length > 1) await post('/api/diary', body);
    }

    // 4. Reactions
    const reactions = Storage.get('dermAI_reactions') || {};
    for (const [productId, entries] of Object.entries(reactions)) {
      if (!Array.isArray(entries) || entries.length === 0) continue;
      // Use the most recent reaction entry for this product
      const latest = entries[entries.length - 1];
      await post('/api/reactions', {
        product_id: String(productId),
        severity: latest.severity || 1,
        notes: latest.notes || ''
      });
    }

    localStorage.setItem(migrationKey, 'true');
    console.log('[Migration] localStorage → Supabase complete');
  }

  // Wire up to Auth state changes — runs once when user first signs in
  if (window.Auth) {
    Auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const token = session.access_token;
        await migrateToServer(session.user.id, token);
      }
    });
  }
})();
