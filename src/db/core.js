import { getPool } from './pool.js';

export async function logAction({ actionKey, mode, groupJid, targetUserJid, messageId, reason, details }) {
  await getPool().execute(
    `INSERT INTO wa_actions_log (action_key, mode, group_jid, target_user_jid, message_id, reason, details_json)
     VALUES (:actionKey, :mode, :groupJid, :targetUserJid, :messageId, :reason, :detailsJson)`,
    { actionKey, mode, groupJid: groupJid || null, targetUserJid: targetUserJid || null, messageId: messageId || null, reason: reason || null, detailsJson: details ? JSON.stringify(details) : null }
  );
}

export async function upsertSession({ sessionName, status, phoneJid, lastError }) {
  await getPool().execute(
    `INSERT INTO wa_sessions (session_name, phone_jid, status, last_error, last_seen_at)
     VALUES (:sessionName, :phoneJid, :status, :lastError, IF(:status='connected', NOW(), NULL))
     ON DUPLICATE KEY UPDATE phone_jid=COALESCE(VALUES(phone_jid), phone_jid), status=VALUES(status), last_error=VALUES(last_error), last_seen_at=IF(VALUES(status)='connected', NOW(), last_seen_at)`,
    { sessionName, phoneJid: phoneJid || null, status: status === 'logged_out' ? 'disconnected' : status, lastError: lastError ? String(lastError).slice(0, 1000) : null }
  );
}

export async function upsertUser({ jid, displayName }) {
  await getPool().execute(
    `INSERT INTO wa_users (user_jid, display_name, first_seen_at, last_seen_at) VALUES (:jid, :displayName, NOW(), NOW())
     ON DUPLICATE KEY UPDATE display_name=COALESCE(VALUES(display_name), display_name), last_seen_at=NOW()`,
    { jid, displayName: displayName || null }
  );
}

export async function insertMessageEvent({ messageId, chatJid, senderJid, messageType, text, hasMedia, hasLink }) {
  const [result] = await getPool().execute(
    `INSERT IGNORE INTO wa_messages (message_id, chat_jid, sender_jid, message_type, text_preview, contains_link, media_kind)
     VALUES (:messageId, :chatJid, :senderJid, :messageType, :textPreview, :hasLink, :mediaKind)`,
    { messageId, chatJid, senderJid: senderJid || null, messageType: messageType || null, textPreview: text ? text.slice(0, 500) : null, hasLink: hasLink ? 1 : 0, mediaKind: hasMedia ? messageType : null }
  );
  return result.affectedRows > 0;
}
