import { getPool } from './pool.js';

export async function startStickerLearning({ chatJid, channelJid, creatorJid }) {
  await getPool().execute(
    `UPDATE wa_sticker_learning
        SET status = 'closed', closed_at = CURRENT_TIMESTAMP
      WHERE chat_jid = :chatJid AND status = 'collecting'`,
    { chatJid }
  );
  const [result] = await getPool().execute(
    `INSERT INTO wa_sticker_learning (chat_jid, channel_jid, creator_jid, status)
     VALUES (:chatJid, :channelJid, :creatorJid, 'collecting')`,
    { chatJid, channelJid: channelJid || null, creatorJid: creatorJid || null }
  );
  return result.insertId;
}

export async function getOpenStickerLearning(chatJid) {
  const [rows] = await getPool().execute(
    `SELECT id, chat_jid, creator_jid, status
       FROM wa_sticker_learning
      WHERE chat_jid = :chatJid AND status = 'collecting'
      ORDER BY id DESC LIMIT 1`,
    { chatJid }
  );
  return rows[0] || null;
}

export async function closeStickerLearning(chatJid) {
  const learning = await getOpenStickerLearning(chatJid);
  if (!learning) return { learning: null, count: 0 };
  await getPool().execute(
    `UPDATE wa_sticker_learning
        SET status = 'closed', closed_at = CURRENT_TIMESTAMP
      WHERE id = :id`,
    { id: learning.id }
  );
  const [rows] = await getPool().execute(
    'SELECT COUNT(*) AS count FROM wa_sticker_assets WHERE learning_id = :learningId',
    { learningId: learning.id }
  );
  return { learning, count: Number(rows[0]?.count || 0) };
}

export async function addStickerAsset({ learningId, sourceMessageId, filePath, mimeType }) {
  const [result] = await getPool().execute(
    `INSERT IGNORE INTO wa_sticker_assets (learning_id, source_message_id, file_path, mime_type)
     VALUES (:learningId, :sourceMessageId, :filePath, :mimeType)`,
    { learningId, sourceMessageId, filePath, mimeType: mimeType || 'image/webp' }
  );
  return result.affectedRows === 1;
}

export async function latestClosedStickerAsset(chatJid) {
  const [rows] = await getPool().execute(
    `SELECT asset.id, asset.learning_id, asset.file_path, asset.mime_type
       FROM wa_sticker_assets AS asset
       JOIN wa_sticker_learning AS learning ON learning.id = asset.learning_id
      WHERE learning.chat_jid = :chatJid AND learning.status = 'closed'
      ORDER BY asset.id ASC LIMIT 1`,
    { chatJid }
  );
  return rows[0] || null;
}

export async function createStickerTestJob({ learningId, stickerAssetId, channelJid, sourceChatJid, sourceMessageId, creatorJid, scheduledAt }) {
  const [result] = await getPool().execute(
    `INSERT INTO wa_sticker_test_jobs
      (learning_id, sticker_asset_id, channel_jid, source_chat_jid, source_message_id, creator_jid, scheduled_at)
     VALUES
      (:learningId, :stickerAssetId, :channelJid, :sourceChatJid, :sourceMessageId, :creatorJid, :scheduledAt)`,
    { learningId, stickerAssetId, channelJid, sourceChatJid, sourceMessageId: sourceMessageId || null, creatorJid: creatorJid || null, scheduledAt }
  );
  return result.insertId;
}

export async function getDueStickerTestJobs(limit = 3) {
  const [rows] = await getPool().execute(
    `SELECT job.*, asset.file_path, asset.mime_type
       FROM wa_sticker_test_jobs AS job
       JOIN wa_sticker_assets AS asset ON asset.id = job.sticker_asset_id
      WHERE job.status = 'queued' AND job.scheduled_at <= UTC_TIMESTAMP()
      ORDER BY job.scheduled_at ASC, job.id ASC LIMIT :limit`,
    { limit }
  );
  return rows;
}

export async function markStickerTestSending(id) {
  const [result] = await getPool().execute(
    `UPDATE wa_sticker_test_jobs SET status = 'sending'
      WHERE id = :id AND status = 'queued'`,
    { id }
  );
  return result.affectedRows === 1;
}

export async function markStickerTestSent({ id, whatsappMessageId }) {
  await getPool().execute(
    `UPDATE wa_sticker_test_jobs
        SET status = 'sent', sent_at = CURRENT_TIMESTAMP, whatsapp_message_id = :whatsappMessageId, error_text = NULL
      WHERE id = :id`,
    { id, whatsappMessageId: whatsappMessageId || null }
  );
}

export async function markStickerTestFailed({ id, errorText }) {
  await getPool().execute(
    `UPDATE wa_sticker_test_jobs
        SET status = 'failed', error_text = :errorText
      WHERE id = :id`,
    { id, errorText: String(errorText).slice(0, 1000) }
  );
}

export async function latestClosedStickerLearning(chatJid, channelJid) {
  const [rows] = await getPool().execute(
    `SELECT learning.id, COUNT(asset.id) AS stock_count
       FROM wa_sticker_learning AS learning
       LEFT JOIN wa_sticker_assets AS asset ON asset.learning_id = learning.id
      WHERE learning.chat_jid = :chatJid AND learning.channel_jid = :channelJid AND learning.status = 'closed'
      GROUP BY learning.id
      HAVING stock_count > 0
      ORDER BY learning.id DESC LIMIT 1`,
    { chatJid, channelJid }
  );
  return rows[0] || null;
}

export async function saveStickerStockSettings({ chatJid, learningId, channelJid, mode, individualIntervalSeconds, blockSize, inBlockDelaySeconds, blockIntervalSeconds }) {
  await getPool().execute(
    `INSERT INTO wa_sticker_stock_settings
      (chat_jid, learning_id, channel_jid, mode, individual_interval_seconds, block_size, in_block_delay_seconds, block_interval_seconds, enabled, status, next_run_at)
     VALUES (:chatJid, :learningId, :channelJid, :mode, :individualIntervalSeconds, :blockSize, :inBlockDelaySeconds, :blockIntervalSeconds, 0, 'paused', NULL)
     ON DUPLICATE KEY UPDATE learning_id=VALUES(learning_id), channel_jid=VALUES(channel_jid), mode=VALUES(mode), individual_interval_seconds=VALUES(individual_interval_seconds), block_size=VALUES(block_size), in_block_delay_seconds=VALUES(in_block_delay_seconds), block_interval_seconds=VALUES(block_interval_seconds), enabled=0, status='paused', next_run_at=NULL, last_error=NULL`,
    { chatJid, learningId, channelJid, mode, individualIntervalSeconds, blockSize, inBlockDelaySeconds, blockIntervalSeconds }
  );
  return getStickerStockSettings(chatJid);
}

export async function getStickerStockSettings(chatJid, channelJid) {
  const [rows] = await getPool().execute(
    `SELECT setting.*, (SELECT COUNT(*) FROM wa_sticker_assets WHERE learning_id=setting.learning_id) AS stock_count,
            (SELECT COUNT(*) FROM wa_sticker_stock_jobs job WHERE job.setting_id=setting.id AND job.status='sent') AS sent_count
       FROM wa_sticker_stock_settings AS setting WHERE setting.chat_jid=:chatJid AND setting.channel_jid=:channelJid LIMIT 1`,
    { chatJid, channelJid }
  );
  return rows[0] || null;
}

export async function setStickerStockEnabled({ chatJid, channelJid, enabled }) {
  const [result] = await getPool().execute(
    `UPDATE wa_sticker_stock_settings SET enabled=:enabled, status=IF(:enabled=1,'running','paused'), next_run_at=IF(:enabled=1, UTC_TIMESTAMP(), NULL), last_error=NULL WHERE chat_jid=:chatJid AND channel_jid=:channelJid`,
    { chatJid, channelJid, enabled: enabled ? 1 : 0 }
  );
  return result.affectedRows === 1;
}
