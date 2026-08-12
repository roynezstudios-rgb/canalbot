import { getPool } from './pool.js';
import { markCreatorMentionFailed, markCreatorMentionPublished } from './creatorMentions.js';

export async function upsertControlChat({ chatJid, name, activeChannelJid, intervalMinutes = 90 }) {
  await getPool().execute(
    `INSERT INTO wa_control_chats
      (chat_jid, name, active_channel_jid, interval_minutes, enabled)
     VALUES
      (:chatJid, :name, :activeChannelJid, :intervalMinutes, 1)
     ON DUPLICATE KEY UPDATE
       name = COALESCE(VALUES(name), name),
       active_channel_jid = COALESCE(VALUES(active_channel_jid), active_channel_jid),
       interval_minutes = VALUES(interval_minutes),
       enabled = 1,
       updated_at = CURRENT_TIMESTAMP`,
    { chatJid, name: name || null, activeChannelJid: activeChannelJid || null, intervalMinutes }
  );
}

export async function getControlChat(chatJid) {
  const [rows] = await getPool().execute(
    `SELECT chat_jid, name, enabled, active_channel_jid, interval_minutes
       FROM wa_control_chats
      WHERE chat_jid = :chatJid
      LIMIT 1`,
    { chatJid }
  );
  return rows[0] || null;
}

export async function getActiveControlChat() {
  const [rows] = await getPool().query(
    `SELECT chat_jid, name, enabled, active_channel_jid, interval_minutes
       FROM wa_control_chats
      WHERE enabled = 1
      ORDER BY id ASC
      LIMIT 1`
  );
  return rows[0] || null;
}

export async function activateControlChat({ chatJid, name }) {
  const active = await getActiveControlChat();
  if (active && active.chat_jid !== chatJid) {
    return { activated: false, reason: 'active_control_exists', activeControl: active };
  }

  await getPool().execute(
    `INSERT INTO wa_control_chats
      (chat_jid, name, enabled)
     VALUES
      (:chatJid, :name, 1)
     ON DUPLICATE KEY UPDATE
       name = COALESCE(VALUES(name), name),
       enabled = 1,
       updated_at = CURRENT_TIMESTAMP`,
    { chatJid, name: name || null }
  );
  return { activated: true, reason: null, activeControl: await getControlChat(chatJid) };
}

export async function deactivateControlChat(chatJid) {
  const [result] = await getPool().execute(
    `UPDATE wa_control_chats
        SET enabled = 0,
            updated_at = CURRENT_TIMESTAMP
      WHERE chat_jid = :chatJid`,
    { chatJid }
  );
  return result;
}

export async function setControlChatChannel({ chatJid, name, channelJid }) {
  await getPool().execute(
    `INSERT INTO wa_control_chats
      (chat_jid, name, active_channel_jid, interval_minutes, enabled)
     VALUES
      (:chatJid, :name, :channelJid, 90, 1)
     ON DUPLICATE KEY UPDATE
       name = COALESCE(VALUES(name), name),
       active_channel_jid = VALUES(active_channel_jid),
       enabled = 1,
       updated_at = CURRENT_TIMESTAMP`,
    { chatJid, name: name || null, channelJid }
  );
}

export async function setControlChatInterval({ chatJid, name, intervalMinutes }) {
  await getPool().execute(
    `INSERT INTO wa_control_chats
      (chat_jid, name, interval_minutes, enabled)
     VALUES
      (:chatJid, :name, :intervalMinutes, 1)
     ON DUPLICATE KEY UPDATE
       name = COALESCE(VALUES(name), name),
       interval_minutes = VALUES(interval_minutes),
       enabled = 1,
       updated_at = CURRENT_TIMESTAMP`,
    { chatJid, name: name || null, intervalMinutes }
  );
}

export async function upsertChannel({ channelJid, name, enabled = true, publishMode = 'active', contentProfile }) {
  await getPool().execute(
    `INSERT INTO wa_channels (channel_jid, name, enabled, publish_mode, content_profile)
     VALUES (:channelJid, :name, :enabled, :publishMode, :contentProfile)
     ON DUPLICATE KEY UPDATE
       name = COALESCE(VALUES(name), name),
       enabled = VALUES(enabled),
       publish_mode = VALUES(publish_mode),
       content_profile = COALESCE(VALUES(content_profile), content_profile),
       updated_at = CURRENT_TIMESTAMP`,
    {
      channelJid,
      name: name || null,
      enabled: enabled ? 1 : 0,
      publishMode,
      contentProfile: contentProfile || null
    }
  );
}

export async function setChannelPublishMode({ channelJid, publishMode }) {
  const [result] = await getPool().execute(
    `UPDATE wa_channels
        SET publish_mode = :publishMode,
            updated_at = CURRENT_TIMESTAMP
      WHERE channel_jid = :channelJid`,
    { channelJid, publishMode }
  );
  return result.affectedRows === 1;
}

export async function findChannel(identifier) {
  const like = `%${identifier}%`;
  const [rows] = await getPool().execute(
    `SELECT channel_jid, name, enabled, publish_mode, content_profile
       FROM wa_channels
      WHERE channel_jid = :identifier
         OR name LIKE :like
         OR content_profile = :identifier
      ORDER BY enabled DESC, updated_at DESC
      LIMIT 1`,
    { identifier, like }
  );
  return rows[0] || null;
}

export async function listChannels() {
  const [rows] = await getPool().query(
    `SELECT channel_jid, name, enabled, publish_mode, content_profile, updated_at
       FROM wa_channels
      ORDER BY enabled DESC, name ASC, updated_at DESC`
  );
  return rows;
}

export async function nextQueueSchedule({ channelJid, intervalMinutes = 90 }) {
  const [rows] = await getPool().execute(
    `SELECT MAX(scheduled_at) AS last_scheduled_at
       FROM wa_channel_queue
      WHERE channel_jid = :channelJid
        AND status IN ('queued','publishing','published')`,
    { channelJid }
  );
  const last = rows[0]?.last_scheduled_at;
  if (!last) return new Date();
  const next = new Date(last);
  next.setMinutes(next.getMinutes() + intervalMinutes);
  return next > new Date() ? next : new Date();
}

export async function rescheduleQueuedChannelPosts({ channelJid, intervalSeconds, now = new Date() }) {
  const pool = getPool();
  const seconds = Math.max(60, Number(intervalSeconds) || 60);
  const [publishedRows] = await pool.execute(
    `SELECT MAX(COALESCE(published_at, scheduled_at)) AS last_published_at
       FROM wa_channel_queue
      WHERE channel_jid=:channelJid AND status='published'`,
    { channelJid }
  );
  const lastPublished = publishedRows[0]?.last_published_at ? new Date(publishedRows[0].last_published_at) : null;
  let next = lastPublished
    ? new Date(Math.max(now.getTime(), lastPublished.getTime() + seconds * 1000))
    : new Date(now);
  const [queued] = await pool.execute(
    `SELECT id FROM wa_channel_queue
      WHERE channel_jid=:channelJid AND status='queued'
      ORDER BY scheduled_at ASC, id ASC`,
    { channelJid }
  );
  for (const item of queued) {
    await pool.execute(
      `UPDATE wa_channel_queue SET scheduled_at=:scheduledAt, updated_at=CURRENT_TIMESTAMP WHERE id=:id AND status='queued'`,
      { id: item.id, scheduledAt: next }
    );
    next = new Date(next.getTime() + seconds * 1000);
  }
  return { count: queued.length, firstScheduledAt: queued.length ? new Date(now) : null };
}

export async function channelQueueStatus(channelJid) {
  const [rows] = await getPool().execute(
    `SELECT
       MIN(CASE WHEN status='queued' THEN scheduled_at END) AS next_scheduled_at,
       MAX(CASE WHEN status='published' THEN published_at END) AS last_published_at,
       SUM(status='queued' AND content_type='text') AS queued_text,
       SUM(status='queued' AND content_type='image') AS queued_image,
       SUM(status='queued' AND content_type='video') AS queued_video,
       SUM(status='failed') AS failed_count
     FROM wa_channel_queue WHERE channel_jid=:channelJid`,
    { channelJid }
  );
  return rows[0] || null;
}

export async function enqueueChannelPost({
  channelJid,
  sourceChatJid,
  sourceMessageId,
  creatorJid,
  contentType,
  textContent,
  mediaPath,
  mimeType,
  scheduledAt,
  campaignItemId = null,
  creatorMentionScheduleId = null
}) {
  const [result] = await getPool().execute(
    `INSERT INTO wa_channel_queue
      (channel_jid, source_chat_jid, source_message_id, creator_jid, content_type,
       text_content, media_path, mime_type, scheduled_at, campaign_item_id, creator_mention_schedule_id)
     VALUES
      (:channelJid, :sourceChatJid, :sourceMessageId, :creatorJid, :contentType,
       :textContent, :mediaPath, :mimeType, :scheduledAt, :campaignItemId, :creatorMentionScheduleId)`,
    {
      channelJid,
      sourceChatJid,
      sourceMessageId: sourceMessageId || null,
      creatorJid: creatorJid || null,
      contentType,
      textContent: textContent || null,
      mediaPath: mediaPath || null,
      mimeType: mimeType || null,
      scheduledAt,
      campaignItemId,
      creatorMentionScheduleId
    }
  );
  return result.insertId;
}

export async function queueCounts(channelJid) {
  const params = channelJid ? { channelJid } : {};
  const [rows] = await getPool().execute(
    `SELECT status, COUNT(*) AS count
       FROM wa_channel_queue
      WHERE (:channelJid IS NULL OR channel_jid = :channelJid)
      GROUP BY status`,
    { channelJid: params.channelJid || null }
  );
  return rows.reduce((acc, row) => {
    acc[row.status] = Number(row.count);
    return acc;
  }, {});
}

export async function listQueue({ status, limit = 20 } = {}) {
  const [rows] = await getPool().execute(
    `SELECT id, channel_jid, content_type, status, scheduled_at, published_at,
            whatsapp_message_id, error_text, created_at
       FROM wa_channel_queue
      WHERE (:status IS NULL OR status = :status)
      ORDER BY scheduled_at ASC, id ASC
      LIMIT :limit`,
    { status: status || null, limit }
  );
  return rows;
}

export async function getDueQueueItems(limit = 3) {
  const [rows] = await getPool().execute(
    `SELECT q.*, c.publish_mode
       FROM wa_channel_queue q
       JOIN wa_channels c ON c.channel_jid = q.channel_jid
      WHERE q.status = 'queued'
        AND q.scheduled_at <= NOW()
        AND c.enabled = 1
        AND c.publish_mode = 'active'
      ORDER BY q.scheduled_at ASC, q.id ASC
      LIMIT ?`,
    [limit]
  );
  return rows;
}

export async function markQueuePublishing(id) {
  const [result] = await getPool().execute(
    `UPDATE wa_channel_queue
        SET status = 'publishing', updated_at = CURRENT_TIMESTAMP
      WHERE id = :id AND status = 'queued'`,
    { id }
  );
  return result.affectedRows === 1;
}

export async function markQueuePublished({ id, whatsappMessageId }) {
  await getPool().execute(
    `UPDATE wa_channel_queue
        SET status = 'published',
            published_at = NOW(),
            whatsapp_message_id = :whatsappMessageId,
            error_text = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = :id`,
    { id, whatsappMessageId: whatsappMessageId || null }
  );
  await getPool().execute(
    `UPDATE wa_campaign_items item
     JOIN wa_channel_queue queue_item ON queue_item.campaign_item_id=item.id
       SET item.status='published', item.published_at=UTC_TIMESTAMP()
     WHERE queue_item.id=:id`,
    { id }
  );
  const [creatorMentions] = await getPool().execute(
    `SELECT creator_mention_schedule_id FROM wa_channel_queue WHERE id=:id LIMIT 1`,
    { id }
  );
  if (creatorMentions[0]?.creator_mention_schedule_id) {
    await markCreatorMentionPublished(creatorMentions[0].creator_mention_schedule_id);
  }
}

export async function markQueueFailed({ id, errorText }) {
  await getPool().execute(
    `UPDATE wa_channel_queue
        SET status = 'failed',
            error_text = :errorText,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = :id`,
    { id, errorText: String(errorText || '').slice(0, 1000) }
  );
  await getPool().execute(
    `UPDATE wa_campaign_items item
     JOIN wa_channel_queue queue_item ON queue_item.campaign_item_id=item.id
     JOIN wa_campaigns campaign ON campaign.id=item.campaign_id
       SET item.status='failed', campaign.status='failed', campaign.last_error=:errorText
     WHERE queue_item.id=:id`,
    { id, errorText: String(errorText || '').slice(0, 1000) }
  );
  const [creatorMentions] = await getPool().execute(
    `SELECT creator_mention_schedule_id FROM wa_channel_queue WHERE id=:id LIMIT 1`,
    { id }
  );
  if (creatorMentions[0]?.creator_mention_schedule_id) {
    await markCreatorMentionFailed({ scheduleId: creatorMentions[0].creator_mention_schedule_id, errorText });
  }
}
