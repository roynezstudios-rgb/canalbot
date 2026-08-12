import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimGlobalPublishGate,
  closePool,
  getPool,
  recoverInterruptedPublishes,
  releaseGlobalPublishGate
} from '../src/db.js';

const runId = `db-safety-${Date.now()}-${process.pid}`;
const chatJid = `${runId}@g.us`;
const channelJid = `120363${Date.now()}@newsletter`;

after(async () => {
  const pool = getPool();
  await pool.execute('DELETE FROM wa_channel_queue WHERE source_chat_jid=:chatJid', { chatJid });
  await pool.execute('DELETE FROM wa_publication_schedule_settings WHERE chat_jid=:chatJid', { chatJid });
  await closePool();
});

test('global publication gate permits exactly one concurrent owner', async () => {
  const first = await claimGlobalPublishGate({ leaseSeconds: 60 });
  assert.ok(first);
  assert.equal(await claimGlobalPublishGate({ leaseSeconds: 60 }), null);
  assert.equal(await releaseGlobalPublishGate(first), true);
  const second = await claimGlobalPublishGate({ leaseSeconds: 60 });
  assert.ok(second);
  await releaseGlobalPublishGate(second);
});

test('recovery pauses an interrupted normal publication rather than retrying it', async () => {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO wa_publication_schedule_settings
       (chat_jid, channel_jid, interval_seconds, enabled, status)
     VALUES (:chatJid, :channelJid, 3600, 1, 'running')`,
    { chatJid, channelJid }
  );
  const [queued] = await pool.execute(
    `INSERT INTO wa_channel_queue
       (channel_jid, source_chat_jid, source_message_id, content_type, text_content, status, scheduled_at)
     VALUES (:channelJid, :chatJid, :sourceMessageId, 'text', 'No duplicar', 'publishing', UTC_TIMESTAMP())`,
    { channelJid, chatJid, sourceMessageId: `${runId}:interrupted` }
  );
  const recovered = await recoverInterruptedPublishes();
  assert.ok(recovered.channelQueue >= 1);
  const [items] = await pool.execute('SELECT status, error_text FROM wa_channel_queue WHERE id=:id', { id: queued.insertId });
  assert.equal(items[0].status, 'failed');
  assert.match(items[0].error_text, /^RECOVERY_REQUIRED:/);
  const [settings] = await pool.execute(
    'SELECT enabled, status FROM wa_publication_schedule_settings WHERE chat_jid=:chatJid AND channel_jid=:channelJid',
    { chatJid, channelJid }
  );
  assert.equal(Number(settings[0].enabled), 0);
  assert.equal(settings[0].status, 'paused');
});
