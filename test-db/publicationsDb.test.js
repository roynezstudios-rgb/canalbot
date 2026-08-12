import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPublicationCaptureItem,
  closePool,
  closePublicationCapture,
  getPool,
  savePublicationSchedule,
  schedulePendingPublicationCapture,
  rescheduleQueuedChannelPosts,
  startPublicationCapture,
  upsertChannel
} from '../src/db.js';

const runId = `db-publication-${Date.now()}-${process.pid}`;
const channelJid = `120363${Date.now()}@newsletter`;
const chatJid = `${runId}@g.us`;

after(async () => {
  const pool = getPool();
  await pool.execute('DELETE FROM wa_channel_queue WHERE channel_jid=:channelJid', { channelJid });
  await pool.execute('DELETE FROM wa_publication_capture_sessions WHERE chat_jid=:chatJid', { chatJid });
  await pool.execute('DELETE FROM wa_publication_schedule_settings WHERE chat_jid=:chatJid', { chatJid });
  await pool.execute('DELETE FROM wa_channels WHERE channel_jid=:channelJid', { channelJid });
  await closePool();
});

test('mixed publication capture preserves order and schedules each item for its channel', async () => {
  await upsertChannel({ channelJid, name: 'Publication capture test', publishMode: 'off' });
  const captureId = await startPublicationCapture({ chatJid, channelJid, creatorJid: `${runId}@s.whatsapp.net` });
  await addPublicationCaptureItem({ sessionId: captureId, sourceMessageId: `${runId}:1`, contentType: 'text', textContent: 'Uno' });
  await addPublicationCaptureItem({ sessionId: captureId, sourceMessageId: `${runId}:2`, contentType: 'image', textContent: '', mediaPath: '/tmp/two.png', mimeType: 'image/png' });
  await addPublicationCaptureItem({ sessionId: captureId, sourceMessageId: `${runId}:3`, contentType: 'video', textContent: 'Tres', mediaPath: '/tmp/three.mp4', mimeType: 'video/mp4' });
  const closed = await closePublicationCapture(chatJid);
  assert.equal(closed.count, 3);

  await savePublicationSchedule({ chatJid, channelJid, intervalSeconds: 7200 });
  const scheduled = await schedulePendingPublicationCapture({ chatJid, channelJid, intervalSeconds: 7200 });
  assert.equal(scheduled.length, 3);

  const [rows] = await getPool().execute(
    `SELECT content_type, text_content FROM wa_channel_queue WHERE channel_jid=:channelJid ORDER BY scheduled_at, id`,
    { channelJid }
  );
  assert.deepEqual(rows.map(row => row.content_type), ['text', 'image', 'video']);
  assert.deepEqual(rows.map(row => row.text_content), ['Uno', null, 'Tres']);

  const { count } = await rescheduleQueuedChannelPosts({
    channelJid,
    intervalSeconds: 300,
    now: new Date('2030-01-01T00:00:00.000Z')
  });
  assert.equal(count, 3);
  const [rescheduled] = await getPool().execute(
    `SELECT scheduled_at FROM wa_channel_queue WHERE channel_jid=:channelJid ORDER BY scheduled_at, id`,
    { channelJid }
  );
  assert.equal(new Date(rescheduled[1].scheduled_at).getTime() - new Date(rescheduled[0].scheduled_at).getTime(), 5 * 60 * 1000);
});
