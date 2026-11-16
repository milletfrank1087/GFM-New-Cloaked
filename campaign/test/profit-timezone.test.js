// Athens day-boundary tests for the Profit Cockpit.
// Run: node --test campaign/test/profit-timezone.test.js
// getLocalHourAndDate takes tzOffset in getTimezoneOffset() sign convention
// (Athens winter UTC+2 => -120, summer UTC+3 => -180), matching what the
// cockpit frontend sends (profit-main.js: tzOffset = -athensOffsetMinutes()).
const test = require('node:test');
const assert = require('node:assert/strict');
const { getLocalHourAndDate, athensTodayYmd, shiftYmd, presetForRange, PRESET_BY_RANGE } = require('../lib/profit');

const WINTER = -120; // Europe/Athens EET (UTC+2)
const SUMMER = -180; // Europe/Athens EEST (UTC+3)

test('Athens winter midnight boundary (UTC+2)', () => {
  assert.deepEqual(getLocalHourAndDate('2026-11-16T21:59:59Z', WINTER), { dateKey: '2026-11-16', hourKey: '23:00' });
  assert.deepEqual(getLocalHourAndDate('2026-11-16T22:00:00Z', WINTER), { dateKey: '2026-11-17', hourKey: '00:00' });
  assert.deepEqual(getLocalHourAndDate('2026-11-16T10:00:00Z', WINTER), { dateKey: '2026-11-16', hourKey: '12:00' });
});

test('Athens summer midnight boundary (UTC+3, DST)', () => {
  assert.deepEqual(getLocalHourAndDate('2026-07-01T20:59:59Z', SUMMER), { dateKey: '2026-07-01', hourKey: '23:00' });
  assert.deepEqual(getLocalHourAndDate('2026-07-01T21:00:00Z', SUMMER), { dateKey: '2026-07-02', hourKey: '00:00' });
});

test('DST transition weeks keep the Athens calendar date', () => {
  // Spring forward 2026-03-29: Athens 03:00 -> 04:00 (UTC+3 from 01:00Z).
  assert.equal(athensTodayYmd(new Date('2026-03-28T21:30:00Z')), '2026-03-28'); // 23:30 EET
  assert.equal(athensTodayYmd(new Date('2026-03-28T22:30:00Z')), '2026-03-29'); // 00:30 EET
  assert.equal(athensTodayYmd(new Date('2026-03-29T21:30:00Z')), '2026-03-30'); // 00:30 EEST next day
  // Fall back 2026-10-25: Athens 04:00 -> 03:00 (UTC+2 from 01:00Z).
  assert.equal(athensTodayYmd(new Date('2026-10-24T20:30:00Z')), '2026-10-24'); // 23:30 EEST
  assert.equal(athensTodayYmd(new Date('2026-10-24T21:30:00Z')), '2026-10-25'); // 00:30 EEST
  assert.equal(athensTodayYmd(new Date('2026-10-25T22:30:00Z')), '2026-10-26'); // 00:30 EET
});

test('shiftYmd crosses month and DST boundaries by calendar day', () => {
  assert.equal(shiftYmd('2026-03-28', 1), '2026-03-29');
  assert.equal(shiftYmd('2026-10-25', 1), '2026-10-26');
  assert.equal(shiftYmd('2026-11-16', -6), '2026-11-10');
  assert.equal(shiftYmd('2026-01-01', -1), '2025-12-31');
});

test('every cockpit range key resolves to a spend preset or daily-row source', () => {
  // Short ranges use a Meta preset whose Athens window equals the payments window
  // (the manager fetches the same Athens calendar days). Long ranges have no Meta
  // preset wide enough, so getProfitOverview sums Athens daily rows instead and
  // reports spendSource='daily-athens-rows'.
  for (const key of ['today', 'yesterday', 'last7days', 'last30days', 'thisMonth', 'lastMonth']) {
    assert.ok(PRESET_BY_RANGE[key], `missing preset for ${key}`);
    assert.equal(presetForRange(key), PRESET_BY_RANGE[key]);
  }
  assert.equal(PRESET_BY_RANGE.thisYear, 'last_90d'); // fallback only; daily rows take precedence
  assert.equal(PRESET_BY_RANGE.allTime, 'last_90d');
});
