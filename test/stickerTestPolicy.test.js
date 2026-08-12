import test from 'node:test';
import assert from 'node:assert/strict';
import { stickerCommand, stickerTestSchedule } from '../src/stickers/policy.js';
import { runStickerTestSend } from '../src/stickers/testJobs.js';

test('stickerCommand recognizes the short sticker commands', () => {
  assert.deepEqual(stickerCommand('!st iniciar'), { name: 'iniciar', args: '' });
  assert.deepEqual(stickerCommand('!st prueba'), { name: 'prueba', args: '' });
  assert.equal(stickerCommand('!sticker prueba'), null);
});

test('stickerTestSchedule schedules one test exactly one minute later', () => {
  const now = new Date('2026-08-11T23:00:00.000Z');
  assert.equal(
    stickerTestSchedule(now).toISOString(),
    '2026-08-11T23:01:00.000Z'
  );
});

test('sticker test send fails instead of remaining in sending when WhatsApp does not respond', async () => {
  await assert.rejects(
    runStickerTestSend(() => new Promise(() => {}), { timeoutMs: 5 }),
    /timed out/i
  );
});
