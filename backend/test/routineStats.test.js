const { computeStats, STEPS_PER_DAY } = require('../lib/routineStats.js');

const TODAY = new Date('2026-04-30T00:00:00Z');

function dateNDaysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('computeStats', () => {
  it('returns zeros for empty logs', () => {
    const s = computeStats({}, 30, TODAY);
    expect(s.overall_pct).toBe(0);
    expect(s.total_steps_completed).toBe(0);
    expect(s.total_steps_possible).toBe(30 * STEPS_PER_DAY);
    expect(s.trend).toBe('flat');
    for (const slot of ['am', 'pm']) {
      for (const key of Object.keys(s.per_step[slot])) {
        expect(s.per_step[slot][key]).toBe(0);
      }
    }
  });

  it('returns 100% when every step is checked every day', () => {
    const logs = {};
    for (let i = 0; i < 30; i++) {
      logs[dateNDaysAgo(i)] = {
        am: { cleanser: true, treatment: true, moisturizer: true, sunscreen: true },
        pm: { cleanser: true, treatment: true, moisturizer: true },
      };
    }
    const s = computeStats(logs, 30, TODAY);
    expect(s.overall_pct).toBe(100);
    expect(s.total_steps_completed).toBe(30 * STEPS_PER_DAY);
    expect(s.per_step.am.cleanser).toBe(100);
    expect(s.per_step.pm.moisturizer).toBe(100);
  });

  it('per-step %: sunscreen done 4 of 30 days = 13%', () => {
    const logs = {};
    for (let i = 0; i < 4; i++) {
      logs[dateNDaysAgo(i)] = { am: { sunscreen: true }, pm: {} };
    }
    const s = computeStats(logs, 30, TODAY);
    expect(s.per_step.am.sunscreen).toBe(Math.round(4 / 30 * 100)); // 13
    expect(s.per_step.am.cleanser).toBe(0);
  });

  it('respects the rangeDays window — older entries are excluded', () => {
    const logs = {
      [dateNDaysAgo(40)]: { am: { cleanser: true } },  // outside 30d
      [dateNDaysAgo(5)]:  { am: { cleanser: true } },  // inside 30d
    };
    const s = computeStats(logs, 30, TODAY);
    expect(s.total_steps_completed).toBe(1);
  });

  it('trend up: newer half has more completion than older half', () => {
    const logs = {};
    // Old 15 days: 1 step/day. New 15 days: all 7 steps/day.
    for (let i = 15; i < 30; i++) {
      logs[dateNDaysAgo(i)] = { am: { cleanser: true }, pm: {} };
    }
    for (let i = 0; i < 15; i++) {
      logs[dateNDaysAgo(i)] = {
        am: { cleanser: true, treatment: true, moisturizer: true, sunscreen: true },
        pm: { cleanser: true, treatment: true, moisturizer: true },
      };
    }
    const s = computeStats(logs, 30, TODAY);
    expect(s.trend).toBe('up');
  });

  it('trend down: newer half has less completion than older half', () => {
    const logs = {};
    for (let i = 0; i < 15; i++) {
      logs[dateNDaysAgo(i)] = { am: { cleanser: true }, pm: {} };
    }
    for (let i = 15; i < 30; i++) {
      logs[dateNDaysAgo(i)] = {
        am: { cleanser: true, treatment: true, moisturizer: true, sunscreen: true },
        pm: { cleanser: true, treatment: true, moisturizer: true },
      };
    }
    const s = computeStats(logs, 30, TODAY);
    expect(s.trend).toBe('down');
  });

  it('trend flat when difference is within ±5%', () => {
    const logs = {};
    for (let i = 0; i < 30; i++) {
      logs[dateNDaysAgo(i)] = { am: { cleanser: true, treatment: true }, pm: {} };
    }
    const s = computeStats(logs, 30, TODAY);
    expect(s.trend).toBe('flat');
  });

  it('defaults to 30 days when rangeDays is invalid', () => {
    const s = computeStats({}, -1, TODAY);
    expect(s.total_steps_possible).toBe(30 * STEPS_PER_DAY);
  });

  it('boundary: rangeDays=1 only counts today', () => {
    const logs = {
      [dateNDaysAgo(0)]: { am: { cleanser: true }, pm: {} },
      [dateNDaysAgo(1)]: { am: { cleanser: true, treatment: true }, pm: {} },
    };
    const s = computeStats(logs, 1, TODAY);
    expect(s.total_steps_completed).toBe(1);
    expect(s.total_steps_possible).toBe(STEPS_PER_DAY);
  });

  it('treats only `=== true` as done — truthy non-bools do not count', () => {
    const logs = {
      [dateNDaysAgo(0)]: { am: { cleanser: 1, treatment: 'yes', moisturizer: true } },
    };
    const s = computeStats(logs, 1, TODAY);
    expect(s.total_steps_completed).toBe(1);
  });
});
