import { getPool } from './pool.js';
import { enqueueChannelPost, nextQueueSchedule, rescheduleQueuedChannelPosts } from './channels.js';

export async function startPublicationCapture({ chatJid, channelJid, creatorJid }) {
  await getPool().execute(
    `UPDATE wa_publication_capture_sessions
        SET status='closed', closed_at=CURRENT_TIMESTAMP
      WHERE chat_jid=:chatJid AND status='collecting'`,
    { chatJid }
  );
  const [result] = await getPool().execute(
    `INSERT INTO wa_publication_capture_sessions (chat_jid, channel_jid, creator_jid, status)
     VALUES (:chatJid, :channelJid, :creatorJid, 'collecting')`,
    { chatJid, channelJid, creatorJid: creatorJid || null }
  );
  return result.insertId;
}

export async function getOpenPublicationCapture(chatJid) {
  const [rows] = await getPool().execute(
    `SELECT id, chat_jid, channel_jid, creator_jid, status
       FROM wa_publication_capture_sessions
      WHERE chat_jid=:chatJid AND status='collecting'
      ORDER BY id DESC LIMIT 1`,
    { chatJid }
  );
  return rows[0] || null;
}

export async function addPublicationCaptureItem({ sessionId, sourceMessageId, contentType, textContent, mediaPath, mimeType, maxItems = 200 }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS item_count, COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
       FROM wa_publication_capture_items WHERE session_id=:sessionId`,
    { sessionId }
  );
  if (Number(rows[0]?.item_count || 0) >= maxItems) return false;
  const [result] = await pool.execute(
    `INSERT IGNORE INTO wa_publication_capture_items
      (session_id, source_message_id, sort_order, content_type, text_content, media_path, mime_type)
     VALUES (:sessionId, :sourceMessageId, :sortOrder, :contentType, :textContent, :mediaPath, :mimeType)`,
    {
      sessionId,
      sourceMessageId,
      sortOrder: Number(rows[0]?.next_sort_order || 1),
      contentType,
      textContent: textContent || null,
      mediaPath: mediaPath || null,
      mimeType: mimeType || null
    }
  );
  return result.affectedRows === 1;
}

export async function closePublicationCapture(chatJid) {
  const capture = await getOpenPublicationCapture(chatJid);
  if (!capture) return { capture: null, count: 0 };
  await getPool().execute(
    `UPDATE wa_publication_capture_sessions
        SET status='closed', closed_at=CURRENT_TIMESTAMP WHERE id=:id`,
    { id: capture.id }
  );
  const [rows] = await getPool().execute(
    `SELECT COUNT(*) AS count FROM wa_publication_capture_items WHERE session_id=:sessionId`,
    { sessionId: capture.id }
  );
  return { capture, count: Number(rows[0]?.count || 0) };
}

export async function savePublicationSchedule({ chatJid, channelJid, intervalSeconds }) {
  await getPool().execute(
    `INSERT INTO wa_publication_schedule_settings (chat_jid, channel_jid, interval_seconds, enabled, status)
     VALUES (:chatJid, :channelJid, :intervalSeconds, 0, 'paused')
     ON DUPLICATE KEY UPDATE interval_seconds=VALUES(interval_seconds), enabled=0, status='paused'`,
    { chatJid, channelJid, intervalSeconds }
  );
  await rescheduleQueuedChannelPosts({ channelJid, intervalSeconds });
  return getPublicationSchedule(chatJid, channelJid);
}

export async function getPublicationSchedule(chatJid, channelJid) {
  const [rows] = await getPool().execute(
    `SELECT setting.*, (
       SELECT COUNT(*) FROM wa_publication_capture_items item
       JOIN wa_publication_capture_sessions session ON session.id=item.session_id
       WHERE session.chat_jid=setting.chat_jid AND session.channel_jid=setting.channel_jid AND item.status='pending'
     ) AS pending_count
     FROM wa_publication_schedule_settings setting
     WHERE setting.chat_jid=:chatJid AND setting.channel_jid=:channelJid LIMIT 1`,
    { chatJid, channelJid }
  );
  return rows[0] || null;
}

export async function setPublicationScheduleEnabled({ chatJid, channelJid, enabled }) {
  const [result] = await getPool().execute(
    `UPDATE wa_publication_schedule_settings
        SET enabled=:enabled, status=IF(:enabled=1,'running','paused')
      WHERE chat_jid=:chatJid AND channel_jid=:channelJid`,
    { chatJid, channelJid, enabled: enabled ? 1 : 0 }
  );
  return result.affectedRows === 1;
}

export async function schedulePendingPublicationCapture({ chatJid, channelJid, intervalSeconds }) {
  const pool = getPool();
  const [items] = await pool.execute(
    `SELECT item.*, session.creator_jid
       FROM wa_publication_capture_items item
       JOIN wa_publication_capture_sessions session ON session.id=item.session_id
      WHERE session.chat_jid=:chatJid AND session.channel_jid=:channelJid
        AND session.status='closed' AND item.status='pending'
      ORDER BY session.id ASC, item.sort_order ASC`,
    { chatJid, channelJid }
  );
  const scheduled = [];
  for (const item of items) {
    const scheduledAt = await nextQueueSchedule({
      channelJid,
      intervalMinutes: Math.ceil(Number(intervalSeconds) / 60)
    });
    const queueId = await enqueueChannelPost({
      channelJid,
      sourceChatJid: chatJid,
      sourceMessageId: `publication-capture:${item.id}`,
      creatorJid: item.creator_jid,
      contentType: item.content_type,
      textContent: item.text_content,
      mediaPath: item.media_path,
      mimeType: item.mime_type,
      scheduledAt
    });
    await pool.execute(
      `UPDATE wa_publication_capture_items SET status='scheduled' WHERE id=:id AND status='pending'`,
      { id: item.id }
    );
    scheduled.push({ queueId, scheduledAt });
  }
  return scheduled;
}
