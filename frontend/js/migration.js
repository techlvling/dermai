(function () {
  async function migrateToServer(userId, token) {
    const migrationKey = `dermai:migrated:${userId}`;
    if (localStorage.getItem(migrationKey)) return; // already done

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // Helper: POST to an endpoint, silently swallow errors
    async function post(url, body) {
      try {
        await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      } catch (_) {}
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
    for (const item of favorites) {
      const product_id = item.id || item.productId;
      if (product_id) await post('/api/favorites', { product_id: String(product_id) });
    }

    // 3. Routine logs — convert nested format to { log_date, am_done, pm_done }
    const routineLog = Storage.get('dermAI_routineLog') || {};
    for (const [date, dayLog] of Object.entries(routineLog)) {
      const am_done = dayLog.am ? Object.values(dayLog.am).some(Boolean) : false;
      const pm_done = dayLog.pm ? Object.values(dayLog.pm).some(Boolean) : false;
      await post('/api/routine', { log_date: date, am_done, pm_done });
    }

    // 4. Reactions
    const reactions = Storage.get('dermAI_reactions') || [];
    for (const r of reactions) {
      if (r.productId || r.product_id) {
        await post('/api/reactions', {
          product_id: String(r.product_id || r.productId),
          severity: r.severity || 1,
          notes: r.notes || ''
        });
      }
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
