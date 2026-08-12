import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimDueCreatorMentionSchedules,
  closePool,
  enqueueChannelPost,
  ensureCreatorMentionSchedules,
  getPool,
  markQueuePublished,
  setCreatorMentionQueued,
  upsertChannel
} from '../src/db.js';

const channelJid = `120363${Date.now()}@newsletter`;

after(async () => {
  const pool = getPool();
  await pool.execute('DELETE FROM wa_channel_queue WHERE channel_jid=:channelJid', { channelJid });
  await pool.execute('DELETE FROM wa_creator_mention_schedules WHERE channel_jid=:channelJid', { channelJid });
  await pool.execute('DELETE FROM wa_channels WHERE channel_jid=:channelJid', { channelJid });
  await closePool();
});

test('creator mention schedules begin after activation and advance after publishing', async () => {
  const pool = getPool();
  await upsertChannel({ channelJid, name: 'Creator mention test', publishMode: 'active' });
  await ensureCreatorMentionSchedules();

  const [created] = await pool.execute(
    'SELECT id, mention_count, next_publish_at FROM wa_creator_mention_schedules WHERE channel_jid=:channelJid',
    { channelJid }
  );
  assert.equal(created.length, 1);
  assert.equal(Number(created[0].mention_count), 0);

  await pool.execute(
    'UPDATE wa_creator_mention_schedules SET next_publish_at=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE id=:id',
    { id: created[0].id }
  );
  const due = await claimDueCreatorMentionSchedules();
  const schedule = due.find(item => Number(item.id) === Number(created[0].id));
  assert.ok(schedule);

  const queueId = await enqueueChannelPost({
    channelJid,
    sourceChatJid: 'canalbot:creator-mention',
    sourceMessageId: `creator-mention-test:${created[0].id}`,
    contentType: 'text',
    textContent: 'Prueba',
    scheduledAt: new Date(),
    creatorMentionScheduleId: created[0].id
  });
  await setCreatorMentionQueued({ scheduleId: created[0].id, queueId });
  await markQueuePublished({ id: queueId, whatsappMessageId: 'test-message' });

  const [published] = await pool.execute(
    'SELECT mention_count, queued_at, next_publish_at, last_published_at FROM wa_creator_mention_schedules WHERE id=:id',
    { id: created[0].id }
  );
  assert.equal(Number(published[0].mention_count), 1);
  assert.equal(published[0].queued_at, null);
  assert.ok(published[0].last_published_at);
  const elapsed = new Date(published[0].next_publish_at).getTime() - new Date(published[0].last_published_at).getTime();
  assert.ok(elapsed >= (2 * 24 * 60 * 60 * 1000) - 2000);
});
