import { getPool } from './pool.js';
import { enqueueChannelPost } from './channels.js';

export async function createCampaign({ chatJid, channelJid, name, scheduleTime, timezone }) {
  await getPool().execute(
    `INSERT INTO wa_campaigns (chat_jid, channel_jid, name, schedule_time, timezone, status)
     VALUES (:chatJid, :channelJid, :name, :scheduleTime, :timezone, 'paused')
     ON DUPLICATE KEY UPDATE schedule_time=VALUES(schedule_time), timezone=VALUES(timezone), updated_at=CURRENT_TIMESTAMP`,
    { chatJid, channelJid, name, scheduleTime, timezone }
  );
  return getCampaign({ chatJid, channelJid, name });
}

export async function getCampaign({ chatJid, channelJid, name }) {
  const [rows] = await getPool().execute(
    `SELECT campaign.*, (
      SELECT COUNT(*) FROM wa_campaign_items item WHERE item.campaign_id=campaign.id AND item.status='pending'
    ) AS pending_count
     FROM wa_campaigns campaign
     WHERE campaign.chat_jid=:chatJid AND campaign.channel_jid=:channelJid AND campaign.name=:name LIMIT 1`,
    { chatJid, channelJid, name }
  );
  return rows[0] || null;
}

export async function listCampaigns({ chatJid, channelJid }) {
  const [rows] = await getPool().execute(
    `SELECT campaign.*, (
      SELECT COUNT(*) FROM wa_campaign_items item WHERE item.campaign_id=campaign.id AND item.status='pending'
    ) AS pending_count
     FROM wa_campaigns campaign
     WHERE campaign.chat_jid=:chatJid AND campaign.channel_jid=:channelJid
     ORDER BY campaign.name ASC`,
    { chatJid, channelJid }
  );
  return rows;
}

export async function setCampaignStatus({ campaignId, status, error = null }, pool = getPool()) {
  const [result] = await pool.execute(
    `UPDATE wa_campaigns SET status=:status, last_error=:error WHERE id=:campaignId`,
    { campaignId, status, error }
  );
  return result.affectedRows === 1;
}

export async function startCampaignCapture({ campaignId, creatorJid }) {
  await getPool().execute(
    `UPDATE wa_campaign_capture_sessions SET status='closed', closed_at=CURRENT_TIMESTAMP
      WHERE campaign_id=:campaignId AND status='collecting'`,
    { campaignId }
  );
  const [result] = await getPool().execute(
    `INSERT INTO wa_campaign_capture_sessions (campaign_id, creator_jid, status)
     VALUES (:campaignId, :creatorJid, 'collecting')`,
    { campaignId, creatorJid: creatorJid || null }
  );
  return result.insertId;
}

export async function getOpenCampaignCapture(chatJid) {
  const [rows] = await getPool().execute(
    `SELECT capture.id, capture.campaign_id, capture.creator_jid, campaign.chat_jid, campaign.channel_jid, campaign.name
       FROM wa_campaign_capture_sessions capture
       JOIN wa_campaigns campaign ON campaign.id=capture.campaign_id
      WHERE campaign.chat_jid=:chatJid AND capture.status='collecting'
      ORDER BY capture.id DESC LIMIT 1`,
    { chatJid }
  );
  return rows[0] || null;
}

export async function addCampaignItem({ campaignId, sourceMessageId, contentType, textContent, mediaPath, mimeType, maxItems = 200 }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS item_count, COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM wa_campaign_items WHERE campaign_id=:campaignId`,
    { campaignId }
  );
  if (Number(rows[0]?.item_count || 0) >= maxItems) return false;
  const [result] = await pool.execute(
    `INSERT IGNORE INTO wa_campaign_items
      (campaign_id, source_message_id, sort_order, content_type, text_content, media_path, mime_type)
     VALUES (:campaignId, :sourceMessageId, :sortOrder, :contentType, :textContent, :mediaPath, :mimeType)`,
    { campaignId, sourceMessageId, sortOrder: Number(rows[0]?.next_sort_order || 1), contentType, textContent: textContent || null, mediaPath: mediaPath || null, mimeType: mimeType || null }
  );
  return result.affectedRows === 1;
}

export async function closeCampaignCapture(chatJid) {
  const capture = await getOpenCampaignCapture(chatJid);
  if (!capture) return { capture: null, count: 0 };
  await getPool().execute(`UPDATE wa_campaign_capture_sessions SET status='closed', closed_at=CURRENT_TIMESTAMP WHERE id=:id`, { id: capture.id });
  const [rows] = await getPool().execute(`SELECT COUNT(*) AS count FROM wa_campaign_items WHERE campaign_id=:campaignId`, { campaignId: capture.campaign_id });
  return { capture, count: Number(rows[0]?.count || 0) };
}

export async function markCampaignDue({ campaignId, localDate, status }) {
  await getPool().execute(
    `UPDATE wa_campaigns SET last_due_date=:localDate, status=:status WHERE id=:campaignId`,
    { campaignId, localDate, status }
  );
}

export async function enqueueDueCampaignItem({ campaign, localDate, scheduledAt }) {
  const pool = getPool();
  const [items] = await pool.execute(
    `SELECT * FROM wa_campaign_items WHERE campaign_id=:campaignId AND status='pending' ORDER BY sort_order ASC LIMIT 1`,
    { campaignId: campaign.id }
  );
  const item = items[0];
  if (!item) {
    await markCampaignDue({ campaignId: campaign.id, localDate, status: 'waiting' });
    return null;
  }
  const [claim] = await pool.execute(
    `UPDATE wa_campaign_items SET status='queued' WHERE id=:id AND status='pending'`, { id: item.id }
  );
  if (!claim.affectedRows) return null;
  try {
    const queueId = await enqueueChannelPost({
      channelJid: campaign.channel_jid, sourceChatJid: campaign.chat_jid,
      sourceMessageId: `campaign:${campaign.id}:item:${item.id}`, creatorJid: null,
      contentType: item.content_type, textContent: item.text_content, mediaPath: item.media_path,
      mimeType: item.mime_type, scheduledAt, campaignItemId: item.id
    });
    await markCampaignDue({ campaignId: campaign.id, localDate, status: 'running' });
    return { queueId, itemId: item.id };
  } catch (error) {
    await pool.execute(`UPDATE wa_campaign_items SET status='pending' WHERE id=:id`, { id: item.id });
    throw error;
  }
}

export async function activeCampaigns() {
  const [rows] = await getPool().query(`SELECT * FROM wa_campaigns WHERE status IN ('running','waiting')`);
  return rows;
}
