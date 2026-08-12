import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCampaignItem,
  closePool,
  createCampaign,
  enqueueDueCampaignItem,
  getCampaign,
  getPool,
  markCampaignDue,
  setCampaignStatus,
  startCampaignCapture
} from '../src/db.js';

const runId = `db-campaign-${Date.now()}-${process.pid}`;
const chatJid = `${runId}@g.us`;
const channelJid = `120363${Date.now()}@newsletter`;

after(async () => {
  const pool = getPool();
  await pool.execute('DELETE FROM wa_channel_queue WHERE source_chat_jid=:chatJid', { chatJid });
  await pool.execute('DELETE FROM wa_campaigns WHERE chat_jid=:chatJid', { chatJid });
  await closePool();
});

test('daily campaign keeps its sequence and queues only one due item', async () => {
  const campaign = await createCampaign({ chatJid, channelJid, name: 'Daily', scheduleTime: '09:00', timezone: 'UTC' });
  await startCampaignCapture({ campaignId: campaign.id, creatorJid: `${runId}@s.whatsapp.net` });
  await addCampaignItem({ campaignId: campaign.id, sourceMessageId: `${runId}:1`, contentType: 'text', textContent: 'Primera' });
  await addCampaignItem({ campaignId: campaign.id, sourceMessageId: `${runId}:2`, contentType: 'text', textContent: 'Segunda' });
  await setCampaignStatus({ campaignId: campaign.id, status: 'running' });
  const due = await enqueueDueCampaignItem({ campaign: { ...campaign, channel_jid: channelJid, chat_jid: chatJid }, localDate: '2030-01-01', scheduledAt: new Date('2030-01-01T09:00:00Z') });
  assert.ok(due?.queueId);
  await markCampaignDue({ campaignId: campaign.id, localDate: '2030-01-01', status: 'running' });
  const current = await getCampaign({ chatJid, channelJid, name: 'Daily' });
  assert.equal(current.pending_count, 1);
  const [queue] = await getPool().execute('SELECT campaign_item_id FROM wa_channel_queue WHERE id=:id', { id: due.queueId });
  assert.equal(Number(queue[0].campaign_item_id), due.itemId);
});
