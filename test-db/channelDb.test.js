import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  closePool,
  enqueueChannelPost,
  getControlChat,
  getDueQueueItems,
  getPool,
  listQueue,
  markQueuePublished,
  markQueuePublishing,
  queueCounts,
  setControlChatInterval,
  upsertChannel,
  upsertControlChat
} from '../src/db.js';

const runId = `db-channel-${Date.now()}-${process.pid}`;
const channelJid = `120363${Date.now()}@newsletter`;
const controlChatJid = `${runId}@g.us`;
const creatorJid = `${runId}@s.whatsapp.net`;

async function cleanupChannelDbRows() {
  const pool = getPool();
  await pool.execute('DELETE FROM wa_channel_queue WHERE channel_jid = :channelJid OR source_chat_jid = :controlChatJid', {
    channelJid,
    controlChatJid
  });
  await pool.execute('DELETE FROM wa_control_chats WHERE chat_jid = :controlChatJid', { controlChatJid });
  await pool.execute('DELETE FROM wa_channels WHERE channel_jid = :channelJid', { channelJid });
}

after(async () => {
  await cleanupChannelDbRows().catch(() => {});
  await closePool();
});

test('channel DB flow claims queued posts once and records publication state', async () => {
  await cleanupChannelDbRows();

  await upsertChannel({
    channelJid,
    name: 'Integration Test Channel',
    enabled: true,
    publishMode: 'active',
    contentProfile: runId
  });
  await upsertControlChat({
    chatJid: controlChatJid,
    name: 'Integration Control',
    activeChannelJid: channelJid,
    intervalMinutes: 15
  });
  await setControlChatInterval({ chatJid: controlChatJid, name: 'Integration Control', intervalMinutes: 30 });

  const control = await getControlChat(controlChatJid);
  assert.equal(control.active_channel_jid, channelJid);
  assert.equal(Number(control.interval_minutes), 30);

  const queueId = await enqueueChannelPost({
    channelJid,
    sourceChatJid: controlChatJid,
    sourceMessageId: `${runId}:message-1`,
    creatorJid,
    contentType: 'text',
    textContent: 'Integration DB test post',
    mediaPath: null,
    mimeType: null,
    scheduledAt: new Date(Date.now() - 1000)
  });

  const countsBeforeClaim = await queueCounts(channelJid);
  assert.equal(countsBeforeClaim.queued, 1);

  const dueItems = await getDueQueueItems(10);
  assert.equal(dueItems.some(item => item.id === queueId), true);

  assert.equal(await markQueuePublishing(queueId), true);
  assert.equal(await markQueuePublishing(queueId), false);

  await markQueuePublished({ id: queueId, whatsappMessageId: `${runId}-wa-message` });
  const published = await listQueue({ status: 'published', limit: 50 });
  const item = published.find(row => row.id === queueId);
  assert.equal(item?.whatsapp_message_id, `${runId}-wa-message`);

  const countsAfterPublish = await queueCounts(channelJid);
  assert.equal(countsAfterPublish.published, 1);
});
