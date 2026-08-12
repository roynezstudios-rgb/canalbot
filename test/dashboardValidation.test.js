import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../src/config.js';
import {
  logDashboardActionBestEffort,
  requireControlChat,
  requireRegisteredChannel,
  validateCampaignSchedule,
  validatePublicationDraft,
  validateUploadedMedia
} from '../src/dashboard/server.js';

const channel = { channel_jid: '120363400000000001@newsletter', name: 'Canal de prueba' };

function fakeFile({ type = 'image/png', size = 12 } = {}) {
  return { type, size, async arrayBuffer() { return new ArrayBuffer(size); } };
}

test('publication draft accepts text now or a valid future schedule', () => {
  const now = new Date('2026-08-12T15:00:00.000Z');
  const immediate = validatePublicationDraft({
    channelJid: channel.channel_jid,
    channel,
    textContent: 'Hola canal',
    file: null,
    scheduledRaw: '',
    now: () => now
  });
  assert.equal(immediate.scheduledAt, now);
  assert.equal(immediate.mediaFile, null);

  const scheduled = validatePublicationDraft({
    channelJid: channel.channel_jid,
    channel,
    textContent: 'Programada',
    file: null,
    scheduledRaw: '2026-08-13T09:30:00.000Z'
  });
  assert.equal(scheduled.scheduledAt.toISOString(), '2026-08-13T09:30:00.000Z');
});

test('publication draft rejects unknown channels, empty content, and invalid dates', () => {
  assert.throws(
    () => validatePublicationDraft({ channelJid: 'missing@newsletter', channel, textContent: 'x', file: null, scheduledRaw: '' }),
    error => error.statusCode === 400 && /canal registrado/i.test(error.message)
  );
  assert.throws(
    () => validatePublicationDraft({ channelJid: channel.channel_jid, channel, textContent: '', file: null, scheduledRaw: '' }),
    error => error.statusCode === 400 && /Agrega texto/i.test(error.message)
  );
  assert.throws(
    () => validatePublicationDraft({ channelJid: channel.channel_jid, channel, textContent: 'x', file: null, scheduledRaw: 'fecha rota' }),
    error => error.statusCode === 400 && /fecha de publicación/i.test(error.message)
  );
});

test('media validation accepts image/video and rejects type and size violations', () => {
  const image = fakeFile();
  const video = fakeFile({ type: 'video/mp4' });
  assert.equal(validateUploadedMedia(image), image);
  assert.equal(validateUploadedMedia(video), video);
  assert.equal(validateUploadedMedia(null), null);
  assert.throws(
    () => validateUploadedMedia(fakeFile({ type: 'application/pdf' })),
    error => error.statusCode === 400 && /imágenes o videos/i.test(error.message)
  );
  assert.throws(
    () => validateUploadedMedia(fakeFile({ size: config.canalbot.maxMediaBytes + 1 })),
    error => error.statusCode === 413 && /límite/i.test(error.message)
  );
});

test('campaign validation requires a control chat and a valid daily time', () => {
  const control = { chat_jid: '120363400000000099@g.us' };
  assert.equal(requireControlChat(control), control);
  assert.throws(
    () => requireControlChat(null),
    error => error.statusCode === 409 && /grupo de control/i.test(error.message)
  );
  assert.deepEqual(validateCampaignSchedule('Tip diario', '23:59'), {
    name: 'Tip diario',
    scheduleTime: '23:59',
    timezone: 'America/Mexico_City'
  });
  assert.throws(
    () => validateCampaignSchedule('', '09:00'),
    error => error.statusCode === 400 && /hora válida/i.test(error.message)
  );
  assert.throws(
    () => validateCampaignSchedule('Tip diario', '24:00'),
    error => error.statusCode === 400 && /hora válida/i.test(error.message)
  );
  assert.throws(
    () => validateCampaignSchedule('Tip diario', '09:00', 'Planeta/Inventado'),
    error => error.statusCode === 400 && /zona horaria IANA/i.test(error.message)
  );
});

test('registered channel validation returns only the exact requested channel', () => {
  assert.equal(requireRegisteredChannel(channel.channel_jid, channel), channel);
  assert.throws(
    () => requireRegisteredChannel('another@newsletter', channel),
    error => error.statusCode === 400 && /canal registrado/i.test(error.message)
  );
});

test('a failed audit log stays best-effort after a publication is committed', async () => {
  const warnings = [];
  const result = await logDashboardActionBestEffort(
    { actionKey: 'publication_queued_from_dashboard' },
    {
      async log() { throw new Error('audit unavailable'); },
      warn(details) { warnings.push(details); }
    }
  );
  assert.equal(result, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].error.message, /audit unavailable/);
});
