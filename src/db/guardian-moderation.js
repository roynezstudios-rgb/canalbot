import { getPool } from './pool.js';

export async function createModerationCase({
  groupJid,
  userJid,
  reporterJid,
  sourceMessageId,
  ruleKey,
  severity = 'low',
  status = 'open',
  actionTaken = 'observe',
  evidence = {}
}) {
  const [result] = await getPool().execute(
    `INSERT INTO wa_moderation_cases
      (group_jid, user_jid, reporter_jid, source_message_id, rule_key, severity, status, action_taken, evidence_json)
     VALUES
      (:groupJid, :userJid, :reporterJid, :sourceMessageId, :ruleKey, :severity, :status, :actionTaken, :evidenceJson)`,
    {
      groupJid,
      userJid: userJid || null,
      reporterJid: reporterJid || null,
      sourceMessageId: sourceMessageId || null,
      ruleKey,
      severity,
      status,
      actionTaken,
      evidenceJson: JSON.stringify(evidence)
    }
  );
  return result.insertId;
}

export async function createMessageReport({
  groupJid,
  reportedMessageId,
  reportedUserJid,
  reporterJid,
  caseId,
  evidence = {}
}) {
  const [result] = await getPool().execute(
    `INSERT IGNORE INTO wa_message_reports
      (group_jid, reported_message_id, reported_user_jid, reporter_jid, case_id, status, evidence_json)
     VALUES
      (:groupJid, :reportedMessageId, :reportedUserJid, :reporterJid, :caseId, 'counted', :evidenceJson)`,
    {
      groupJid,
      reportedMessageId,
      reportedUserJid: reportedUserJid || null,
      reporterJid,
      caseId: caseId || null,
      evidenceJson: JSON.stringify(evidence)
    }
  );
  return result.affectedRows === 1;
}

export async function countMessageReports({ groupJid, reportedMessageId, windowMinutes }) {
  const [rows] = await getPool().execute(
    `SELECT COUNT(*) AS count
       FROM wa_message_reports
      WHERE group_jid = :groupJid
        AND reported_message_id = :reportedMessageId
        AND status = 'counted'
        AND created_at >= DATE_SUB(NOW(), INTERVAL :windowMinutes MINUTE)`,
    { groupJid, reportedMessageId, windowMinutes }
  );
  return Number(rows[0]?.count || 0);
}

export async function listEnabledBadWords(groupJid) {
  const [rows] = await getPool().execute(
    `SELECT id, group_jid, pattern, normalized_pattern, match_type, severity, exceptions_json
       FROM wa_bad_words
      WHERE enabled = 1
        AND (group_jid IS NULL OR group_jid = :groupJid)
      ORDER BY group_jid IS NULL DESC, severity DESC, id ASC`,
    { groupJid }
  );
  return rows.map(row => ({
    id: row.id,
    groupJid: row.group_jid,
    pattern: row.pattern,
    normalizedPattern: row.normalized_pattern,
    matchType: row.match_type,
    severity: row.severity,
    exceptions: typeof row.exceptions_json === 'string' ? JSON.parse(row.exceptions_json) : row.exceptions_json
  }));
}

export async function listBadWordsForGroup(groupJid) {
  const [rows] = await getPool().execute(
    `SELECT id, group_jid, pattern, normalized_pattern, match_type, severity, enabled, updated_at
       FROM wa_bad_words
      WHERE group_jid IS NULL OR group_jid = :groupJid
      ORDER BY group_jid IS NULL DESC, enabled DESC, severity DESC, id ASC
      LIMIT 50`,
    { groupJid }
  );
  return rows.map(row => ({
    id: row.id,
    groupJid: row.group_jid,
    scope: row.group_jid ? 'grupo' : 'global',
    pattern: row.pattern,
    normalizedPattern: row.normalized_pattern,
    matchType: row.match_type,
    severity: row.severity,
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at
  }));
}

export async function addBadWordRule({
  groupJid,
  pattern,
  normalizedPattern,
  matchType = 'phrase',
  severity = 'moderada',
  enabled = true,
  exceptions = []
}) {
  const [result] = await getPool().execute(
    `INSERT INTO wa_bad_words
      (group_jid, pattern, normalized_pattern, match_type, severity, enabled, exceptions_json)
     VALUES
      (:groupJid, :pattern, :normalizedPattern, :matchType, :severity, :enabled, :exceptionsJson)`,
    {
      groupJid: groupJid || null,
      pattern,
      normalizedPattern: normalizedPattern || null,
      matchType,
      severity,
      enabled: enabled ? 1 : 0,
      exceptionsJson: JSON.stringify(exceptions)
    }
  );
  return result.insertId;
}

export async function setBadWordEnabled({ id, groupJid, enabled }) {
  const [result] = await getPool().execute(
    `UPDATE wa_bad_words
        SET enabled = :enabled,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = :id
        AND (group_jid IS NULL OR group_jid = :groupJid)`,
    { id, groupJid, enabled: enabled ? 1 : 0 }
  );
  return result.affectedRows;
}

export async function bulkAddBadWordRules({ groupJid, patterns }) {
  const summary = { insertedIds: [], skipped: 0 };
  if (!patterns || !patterns.length) return summary;
  const pool = getPool();
  for (const p of patterns) {
    const pattern = String(p.pattern || p).trim();
    const normalizedPattern = String(p.normalizedPattern || '').trim();
    if (!pattern || !normalizedPattern) {
      summary.skipped += 1;
      continue;
    }
    const [existing] = await pool.execute(
      `SELECT id
         FROM wa_bad_words
        WHERE group_jid <=> :groupJid
          AND normalized_pattern = :normalizedPattern
        LIMIT 1`,
      { groupJid: groupJid || null, normalizedPattern }
    );
    if (existing.length) {
      summary.skipped += 1;
      continue;
    }
    const [result] = await pool.execute(
      `INSERT INTO wa_bad_words
        (group_jid, pattern, normalized_pattern, match_type, severity, enabled, exceptions_json)
       VALUES
        (:groupJid, :pattern, :normalizedPattern, :matchType, :severity, :enabled, :exceptionsJson)`,
      {
        groupJid: groupJid || null,
        pattern,
        normalizedPattern,
        matchType: p.matchType || 'phrase',
        severity: p.severity || 'moderada',
        enabled: p.enabled !== false ? 1 : 0,
        exceptionsJson: JSON.stringify(p.exceptions || [])
      }
    );
    if (result.affectedRows) summary.insertedIds.push(result.insertId);
  }
  return summary;
}

export async function removeBadWordRule({ id, groupJid }) {
  const [result] = await getPool().execute(
    `DELETE FROM wa_bad_words
      WHERE id = :id
        AND (group_jid IS NULL OR group_jid = :groupJid)`,
    { id, groupJid }
  );
  return result.affectedRows;
}

export async function listAllowedDomains(groupJid) {
  const [rows] = await getPool().execute(
    `SELECT domain, include_subdomains
       FROM wa_allowed_domains
      WHERE enabled = 1
        AND (group_jid IS NULL OR group_jid = :groupJid)`,
    { groupJid }
  );
  return rows.map(row => ({
    domain: row.domain,
    includeSubdomains: Boolean(row.include_subdomains)
  }));
}

export async function countRecentInfractions({ groupJid, userJid, ruleKey = null, windowHours = 24 }) {
  const [rows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM wa_moderation_cases
      WHERE group_jid = :groupJid
        AND user_jid = :userJid
        AND status <> 'dismissed'
        AND created_at >= DATE_SUB(NOW(), INTERVAL :windowHours HOUR)
        ${ruleKey ? 'AND rule_key = :ruleKey' : ''}`,
    { groupJid, userJid, windowHours, ruleKey: ruleKey || null }
  );
  return rows[0]?.total || 0;
}

export async function recordBadWordEvent({ groupJid, userJid, messageId, badWordId, caseId, severity, evidence = {} }) {
  await getPool().execute(
    `INSERT IGNORE INTO wa_bad_words_events
      (group_jid, user_jid, message_id, bad_word_id, case_id, severity, evidence_json)
     VALUES
      (:groupJid, :userJid, :messageId, :badWordId, :caseId, :severity, :evidenceJson)`,
    {
      groupJid,
      userJid,
      messageId,
      badWordId: badWordId || null,
      caseId: caseId || null,
      severity,
      evidenceJson: JSON.stringify(evidence)
    }
  );
}

export async function recordSpamEvent({
  groupJid,
  userJid,
  messageId,
  spamType,
  caseId,
  windowSeconds,
  observedCount,
  thresholdCount,
  evidence = {}
}) {
  await getPool().execute(
    `INSERT IGNORE INTO wa_spam_events
      (group_jid, user_jid, message_id, spam_type, case_id, window_seconds, observed_count, threshold_count, evidence_json)
     VALUES
      (:groupJid, :userJid, :messageId, :spamType, :caseId, :windowSeconds, :observedCount, :thresholdCount, :evidenceJson)`,
    {
      groupJid,
      userJid,
      messageId,
      spamType,
      caseId: caseId || null,
      windowSeconds,
      observedCount,
      thresholdCount,
      evidenceJson: JSON.stringify(evidence)
    }
  );
}

export async function addUserSanction({
  groupJid,
  userJid,
  caseId,
  ruleKey,
  sanctionLevel = 1,
  action = 'observe',
  status = 'blocked',
  reason
}) {
  const [result] = await getPool().execute(
    `INSERT INTO wa_user_sanctions
      (group_jid, user_jid, case_id, rule_key, sanction_level, action, status, reason)
     VALUES
      (:groupJid, :userJid, :caseId, :ruleKey, :sanctionLevel, :action, :status, :reason)`,
    {
      groupJid,
      userJid,
      caseId: caseId || null,
      ruleKey,
      sanctionLevel,
      action,
      status,
      reason: reason || null
    }
  );
  return result.insertId;
}

export async function createUserMute({ groupJid, userJid, caseId, reason, durationHours }) {
  const hours = Number.isFinite(Number(durationHours)) ? Number(durationHours) : 12;
  const expiresAt = new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
  const [result] = await getPool().execute(
    `INSERT INTO wa_user_mutes
      (group_jid, user_jid, case_id, reason, expires_at, status)
     VALUES
      (:groupJid, :userJid, :caseId, :reason, :expiresAt, 'active')`,
    {
      groupJid,
      userJid,
      caseId: caseId || null,
      reason: reason || null,
      expiresAt
    }
  );
  return result.insertId;
}

export async function getActiveUserMute({ groupJid, userJid }) {
  const [rows] = await getPool().execute(
    `SELECT id, case_id, reason, starts_at, expires_at, attempts_during_mute
       FROM wa_user_mutes
      WHERE group_jid = :groupJid
        AND user_jid = :userJid
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1`,
    { groupJid, userJid }
  );
  return rows[0] || null;
}

export async function incrementUserMuteAttempts({ muteId }) {
  await getPool().execute(
    `UPDATE wa_user_mutes
        SET attempts_during_mute = attempts_during_mute + 1,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = :muteId`,
    { muteId }
  );
}
