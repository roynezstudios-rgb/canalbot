import { getPool } from './pool.js';

export async function latestActivationRun(groupJid) {
  const [rows] = await getPool().execute(
    `SELECT id, group_jid, stage, status, requested_by_jid, approved_by_jid, notes, checklist_json, created_at, updated_at
       FROM wa_guardian_activation_runs
      WHERE group_jid = :groupJid
      ORDER BY id DESC
      LIMIT 1`,
    { groupJid }
  );
  return rows[0] || null;
}

export async function createActivationRun({ groupJid, stage = 'observe', status = 'planned', requestedByJid, approvedByJid, notes, checklist = {} }) {
  const [result] = await getPool().execute(
    `INSERT INTO wa_guardian_activation_runs
      (group_jid, stage, status, requested_by_jid, approved_by_jid, notes, checklist_json)
     VALUES
      (:groupJid, :stage, :status, :requestedByJid, :approvedByJid, :notes, :checklistJson)`,
    {
      groupJid,
      stage,
      status,
      requestedByJid: requestedByJid || null,
      approvedByJid: approvedByJid || null,
      notes: notes || null,
      checklistJson: JSON.stringify(checklist)
    }
  );
  return result.insertId;
}

export async function recordActivationCheck({ groupJid, checkKey, status, details = {} }) {
  await getPool().execute(
    `INSERT INTO wa_guardian_activation_checks
      (group_jid, check_key, status, details_json)
     VALUES
      (:groupJid, :checkKey, :status, :detailsJson)`,
    {
      groupJid,
      checkKey,
      status,
      detailsJson: JSON.stringify(details)
    }
  );
}

export async function registerGuardianCommandUse({
  groupJid,
  userJid,
  commandName,
  limitCount,
  windowMinutes
}) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO wa_command_cooldowns
      (group_jid, user_jid, command_name, window_started_at, count_used)
     VALUES
      (:groupJid, :userJid, :commandName, NOW(), 1)
     ON DUPLICATE KEY UPDATE
       count_used = IF(window_started_at < DATE_SUB(NOW(), INTERVAL :windowMinutes MINUTE), 1, count_used + 1),
       window_started_at = IF(window_started_at < DATE_SUB(NOW(), INTERVAL :windowMinutes MINUTE), NOW(), window_started_at),
       updated_at = CURRENT_TIMESTAMP`,
    { groupJid, userJid, commandName, windowMinutes }
  );

  const [rows] = await pool.execute(
    `SELECT count_used, window_started_at
       FROM wa_command_cooldowns
      WHERE group_jid = :groupJid
        AND user_jid = :userJid
        AND command_name = :commandName
      LIMIT 1`,
    { groupJid, userJid, commandName }
  );
  const count = Number(rows[0]?.count_used || 0);
  return count <= limitCount;
}
