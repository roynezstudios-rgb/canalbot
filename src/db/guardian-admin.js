import { getPool } from './pool.js';

export async function upsertGroupProtectionState({
  groupJid,
  subject,
  description,
  announce,
  restrict,
  inviteCode,
  authorizedAdmins = [],
  baseline = {}
}) {
  await getPool().execute(
    `INSERT INTO wa_group_protection_state
      (group_jid, subject, description_text, announce, restrict_settings, invite_code, authorized_admins_json, baseline_json, captured_at)
     VALUES
      (:groupJid, :subject, :description, :announce, :restrict, :inviteCode, :authorizedAdminsJson, :baselineJson, NOW())
     ON DUPLICATE KEY UPDATE
       subject = COALESCE(VALUES(subject), subject),
       description_text = COALESCE(VALUES(description_text), description_text),
       announce = COALESCE(VALUES(announce), announce),
       restrict_settings = COALESCE(VALUES(restrict_settings), restrict_settings),
       invite_code = COALESCE(VALUES(invite_code), invite_code),
       authorized_admins_json = COALESCE(VALUES(authorized_admins_json), authorized_admins_json),
       baseline_json = JSON_MERGE_PATCH(COALESCE(baseline_json, JSON_OBJECT()), VALUES(baseline_json)),
       captured_at = NOW(),
       updated_at = CURRENT_TIMESTAMP`,
    {
      groupJid,
      subject: subject || null,
      description: description || null,
      announce: announce == null ? null : Number(Boolean(announce)),
      restrict: restrict == null ? null : Number(Boolean(restrict)),
      inviteCode: inviteCode || null,
      authorizedAdminsJson: JSON.stringify(authorizedAdmins),
      baselineJson: JSON.stringify(baseline)
    }
  );
}

export async function getGroupProtectionState(groupJid) {
  const [rows] = await getPool().execute(
    `SELECT group_jid, subject, description_text, announce, restrict_settings, invite_code,
            authorized_admins_json, baseline_json, captured_at
       FROM wa_group_protection_state
      WHERE group_jid = :groupJid
      LIMIT 1`,
    { groupJid }
  );
  const row = rows[0];
  if (!row) return null;
  return {
    groupJid: row.group_jid,
    subject: row.subject,
    description: row.description_text,
    announce: row.announce,
    restrict: row.restrict_settings,
    inviteCode: row.invite_code,
    authorizedAdmins: typeof row.authorized_admins_json === 'string' ? JSON.parse(row.authorized_admins_json) : row.authorized_admins_json,
    baseline: typeof row.baseline_json === 'string' ? JSON.parse(row.baseline_json) : row.baseline_json,
    capturedAt: row.captured_at
  };
}

export async function upsertGroupSchedule({
  groupJid,
  enabled,
  openTime,
  closeTime,
  timezone,
  activeDays,
  openMessage,
  closeMessage
}) {
  await getPool().execute(
    `INSERT INTO wa_group_schedules
      (group_jid, enabled, open_time, close_time, timezone, active_days, open_message, close_message)
     VALUES
      (:groupJid, :enabled, :openTime, :closeTime, :timezone, :activeDays, :openMessage, :closeMessage)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       open_time = VALUES(open_time),
       close_time = VALUES(close_time),
       timezone = VALUES(timezone),
       active_days = VALUES(active_days),
       open_message = COALESCE(VALUES(open_message), open_message),
       close_message = COALESCE(VALUES(close_message), close_message),
       updated_at = CURRENT_TIMESTAMP`,
    {
      groupJid,
      enabled: enabled ? 1 : 0,
      openTime,
      closeTime,
      timezone,
      activeDays,
      openMessage: openMessage || null,
      closeMessage: closeMessage || null
    }
  );
}

export async function getGroupSchedule(groupJid) {
  const [rows] = await getPool().execute(
    `SELECT group_jid, enabled, open_time, close_time, timezone, active_days,
            open_message, close_message, expected_state, last_checked_at, last_transition_at,
            last_close_warning_key
       FROM wa_group_schedules
      WHERE group_jid = :groupJid
      LIMIT 1`,
    { groupJid }
  );
  return rows[0] || null;
}

export async function listEnabledGroupSchedules() {
  const [rows] = await getPool().query(
    `SELECT group_jid, enabled, open_time, close_time, timezone, active_days,
            open_message, close_message, expected_state, last_checked_at, last_transition_at,
            last_close_warning_key
       FROM wa_group_schedules
      WHERE enabled = 1`
  );
  return rows;
}

export async function markGroupScheduleChecked({ groupJid, expectedState, transitioned = false }) {
  await getPool().execute(
    `UPDATE wa_group_schedules
        SET expected_state = :expectedState,
            last_checked_at = NOW(),
            last_transition_at = IF(:transitioned = 1, NOW(), last_transition_at),
            updated_at = CURRENT_TIMESTAMP
      WHERE group_jid = :groupJid`,
    { groupJid, expectedState, transitioned: transitioned ? 1 : 0 }
  );
}

export async function markGroupScheduleCloseWarningSent({ groupJid, warningKey }) {
  await getPool().execute(
    `UPDATE wa_group_schedules
        SET last_close_warning_key = :warningKey,
            updated_at = CURRENT_TIMESTAMP
      WHERE group_jid = :groupJid`,
    { groupJid, warningKey }
  );
}

export async function logGroupAdminAudit({ groupJid, actorJid, commandName, eventType, status = 'observed', details = {} }) {
  await getPool().execute(
    `INSERT INTO wa_group_admin_audit
      (group_jid, actor_jid, command_name, event_type, status, details_json)
     VALUES
      (:groupJid, :actorJid, :commandName, :eventType, :status, :detailsJson)`,
    {
      groupJid,
      actorJid: actorJid || null,
      commandName: commandName || null,
      eventType,
      status,
      detailsJson: JSON.stringify(details)
    }
  );
}

export async function guardianHealthSummary(groupJid) {
  const pool = getPool();
  const [[cases]] = await pool.execute(
    `SELECT COUNT(*) AS open_cases
       FROM wa_moderation_cases
      WHERE group_jid = :groupJid AND status = 'open'`,
    { groupJid }
  );
  const [[reports]] = await pool.execute(
    `SELECT COUNT(*) AS reports_24h
       FROM wa_message_reports
      WHERE group_jid = :groupJid AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    { groupJid }
  );
  const [[spam]] = await pool.execute(
    `SELECT COUNT(*) AS spam_24h
       FROM wa_spam_events
      WHERE group_jid = :groupJid AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    { groupJid }
  );
  const [[badWords]] = await pool.execute(
    `SELECT COUNT(*) AS bad_words_24h
       FROM wa_bad_words_events
      WHERE group_jid = :groupJid AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    { groupJid }
  );
  return {
    openCases: Number(cases?.open_cases || 0),
    reports24h: Number(reports?.reports_24h || 0),
    spam24h: Number(spam?.spam_24h || 0),
    badWords24h: Number(badWords?.bad_words_24h || 0)
  };
}
