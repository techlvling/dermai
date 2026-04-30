// Pure stats helpers for the routine tracker.
// Browser side keeps a sync'd copy inside frontend/js/recommendations.js
// (the frontend can't require this file because frontend/ is type:module).

const ROUTINE_STEPS = {
  am: ['cleanser', 'treatment', 'moisturizer', 'sunscreen'],
  pm: ['cleanser', 'treatment', 'moisturizer'],
};
const STEPS_PER_DAY = ROUTINE_STEPS.am.length + ROUTINE_STEPS.pm.length; // 7

// computeStats(logs, rangeDays, today?)
//   logs: { 'YYYY-MM-DD': { am: { cleanser: bool, ... }, pm: { ... } } }
//   rangeDays: integer number of days to look back (inclusive of today)
//   today: optional Date for testability; defaults to now
// Returns { overall_pct, per_step:{am:{step:%},pm:{step:%}},
//           total_steps_completed, total_steps_possible, trend }
//   trend: 'up' | 'down' | 'flat' — compares newer half vs older half
function computeStats(logs, rangeDays, today) {
  if (!logs || typeof logs !== 'object') logs = {};
  if (!Number.isInteger(rangeDays) || rangeDays < 1) rangeDays = 30;
  if (!(today instanceof Date)) today = new Date();

  const perStep = { am: {}, pm: {} };
  for (const slot of ['am', 'pm']) {
    for (const key of ROUTINE_STEPS[slot]) perStep[slot][key] = 0;
  }

  let totalCompleted = 0;
  const totalPossible = rangeDays * STEPS_PER_DAY;
  const dailyPct = []; // index 0 = oldest in window, last = today

  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const day = logs[k] || {};
    let dayCompleted = 0;
    for (const slot of ['am', 'pm']) {
      const slotLog = day[slot] || {};
      for (const key of ROUTINE_STEPS[slot]) {
        if (slotLog[key] === true) {
          perStep[slot][key]++;
          dayCompleted++;
        }
      }
    }
    totalCompleted += dayCompleted;
    dailyPct.push((dayCompleted / STEPS_PER_DAY) * 100);
  }

  for (const slot of ['am', 'pm']) {
    for (const key of ROUTINE_STEPS[slot]) {
      perStep[slot][key] = Math.round((perStep[slot][key] / rangeDays) * 100);
    }
  }

  const overallPct = totalPossible ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  let trend = 'flat';
  const half = Math.floor(rangeDays / 2);
  if (half >= 1 && rangeDays >= 2) {
    const olderHalf = dailyPct.slice(0, half);
    const newerHalf = dailyPct.slice(rangeDays - half);
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    const diff = avg(newerHalf) - avg(olderHalf);
    if (diff > 5) trend = 'up';
    else if (diff < -5) trend = 'down';
  }

  return {
    overall_pct: overallPct,
    per_step: perStep,
    total_steps_completed: totalCompleted,
    total_steps_possible: totalPossible,
    trend,
  };
}

module.exports = { computeStats, ROUTINE_STEPS, STEPS_PER_DAY };
