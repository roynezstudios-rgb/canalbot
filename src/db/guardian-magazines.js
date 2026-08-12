import { getPool } from './pool.js';

export async function magazineStats({ groupJid, since, until }) {
  const pool = getPool();
  const params = { groupJid, since, until };
  const [[messages]] = await pool.execute(
    `SELECT COUNT(*) AS count
       FROM wa_messages
      WHERE chat_jid = :groupJid AND received_at >= :since AND received_at < :until`,
    params
  );
  const [[stickers]] = await pool.execute(
    `SELECT COUNT(*) AS count
       FROM wa_messages
      WHERE chat_jid = :groupJid AND media_kind = 'sticker' AND received_at >= :since AND received_at < :until`,
    params
  );
  const [[reports]] = await pool.execute(
    `SELECT COUNT(*) AS count
       FROM wa_message_reports
      WHERE group_jid = :groupJid AND created_at >= :since AND created_at < :until`,
    params
  );
  const [[spam]] = await pool.execute(
    `SELECT COUNT(*) AS count
       FROM wa_spam_events
      WHERE group_jid = :groupJid AND created_at >= :since AND created_at < :until`,
    params
  );
  const [topUsers] = await pool.execute(
    `SELECT r.user_jid, u.display_name, r.xp, r.level_key
       FROM wa_user_reputation r
       LEFT JOIN wa_users u ON u.user_jid = r.user_jid
      WHERE r.group_jid = :groupJid
      ORDER BY r.xp DESC
      LIMIT 3`,
    { groupJid }
  );
  return {
    messages: Number(messages?.count || 0),
    stickers: Number(stickers?.count || 0),
    reports: Number(reports?.count || 0),
    spam: Number(spam?.count || 0),
    topUsers
  };
}

export async function upsertMagazineRun({
  groupJid,
  magazineType,
  periodKey,
  status = 'generated',
  contentText,
  scheduledAt,
  stats = {}
}) {
  const [result] = await getPool().execute(
    `INSERT INTO wa_group_magazine_runs
      (group_jid, magazine_type, period_key, status, content_text, scheduled_at, stats_json)
     VALUES
      (:groupJid, :magazineType, :periodKey, :status, :contentText, :scheduledAt, :statsJson)
     ON DUPLICATE KEY UPDATE
       content_text = VALUES(content_text),
       scheduled_at = COALESCE(VALUES(scheduled_at), scheduled_at),
       stats_json = VALUES(stats_json),
       updated_at = CURRENT_TIMESTAMP`,
    {
      groupJid,
      magazineType,
      periodKey,
      status,
      contentText,
      scheduledAt: scheduledAt || null,
      statsJson: JSON.stringify(stats)
    }
  );
  return result.insertId;
}

export async function getMagazineRun({ groupJid, magazineType, periodKey }) {
  const [rows] = await getPool().execute(
    `SELECT id, group_jid, magazine_type, period_key, status, content_text, scheduled_at, stats_json
       FROM wa_group_magazine_runs
      WHERE group_jid = :groupJid AND magazine_type = :magazineType AND period_key = :periodKey
      LIMIT 1`,
    { groupJid, magazineType, periodKey }
  );
  return rows[0] || null;
}

export async function listDueMagazineRuns(limit = 5) {
  const [rows] = await getPool().execute(
    `SELECT id, group_jid, magazine_type, period_key, content_text
       FROM wa_group_magazine_runs
      WHERE status = 'queued'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC, id ASC
      LIMIT ?`,
    [limit]
  );
  return rows;
}

export async function markMagazineRunSent({ id, whatsappMessageId }) {
  await getPool().execute(
    `UPDATE wa_group_magazine_runs
        SET status = 'sent', sent_at = NOW(), whatsapp_message_id = :whatsappMessageId, updated_at = CURRENT_TIMESTAMP
      WHERE id = :id`,
    { id, whatsappMessageId: whatsappMessageId || null }
  );
}

export async function markMagazineRunFailed({ id, status = 'failed', errorText }) {
  await getPool().execute(
    `UPDATE wa_group_magazine_runs
        SET status = :status, error_text = :errorText, updated_at = CURRENT_TIMESTAMP
      WHERE id = :id`,
    { id, status, errorText: String(errorText || '').slice(0, 1000) }
  );
}
