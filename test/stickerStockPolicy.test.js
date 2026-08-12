import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlockSchedule, parseIndividualSchedule } from '../src/stickers/policy.js';

test('individual sticker schedules accept minutes, hours and days but reject seconds', () => {
  assert.deepEqual(parseIndividualSchedule('15m'), { intervalSeconds: 900, label: '15m' });
  assert.deepEqual(parseIndividualSchedule('2h'), { intervalSeconds: 7200, label: '2h' });
  assert.deepEqual(parseIndividualSchedule('1d'), { intervalSeconds: 86400, label: '1d' });
  assert.equal(parseIndividualSchedule('20s'), null);
});

test('block schedules cap the block at five and require a one-hour minimum pause', () => {
  assert.deepEqual(parseBlockSchedule('5 15s 1h'), {
    blockSize: 5,
    inBlockDelaySeconds: 15,
    blockIntervalSeconds: 3600,
    label: '5 stickers, 15s entre cada uno, cada 1h'
  });
  assert.equal(parseBlockSchedule('6 15s 1h'), null);
  assert.equal(parseBlockSchedule('5 5s 1h'), null);
  assert.equal(parseBlockSchedule('5 15s 30m'), null);
});
