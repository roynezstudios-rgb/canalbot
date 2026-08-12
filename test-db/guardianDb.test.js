import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBadWordRule,
  addUserSanction,
  closePool,
  countMessageReports,
  createMessageReport,
  createModerationCase,
  createUserMute,
  countRecentInfractions,
  getActiveUserMute,
  getGuardianGroupSettings,
  getPool,
  guardianHealthSummary,
  incrementUserMuteAttempts,
  listAllowedDomains,
  listEnabledBadWords,
  recordBadWordEvent,
  recordSpamEvent,
  registerGuardianCommandUse,
  upsertGuardianGroupSettings
} from '../src/db.js';

const runId = `db-guardian-${Date.now()}-${process.pid}`;
const groupJid = `${runId}@g.us`;
const userJid = `${runId}@s.whatsapp.net`;
const reporterJid = `${runId}-reporter@s.whatsapp.net`;
const messageId = `${runId}-message`;

async function cleanupGuardianDbRows() {
  const pool = getPool();
  await pool.execute('DELETE FROM wa_command_cooldowns WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_spam_events WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_bad_words_events WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_user_mutes WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_user_sanctions WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_message_reports WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_moderation_cases WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_allowed_domains WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_bad_words WHERE group_jid = :groupJid', { groupJid });
  await pool.execute('DELETE FROM wa_guardian_settings WHERE group_jid = :groupJid', { groupJid });
}

after(async () => {
  await cleanupGuardianDbRows().catch(() => {});
  await closePool();
});

test('guardian DB flow stores settings, moderation evidence and cooldowns', async () => {
  await cleanupGuardianDbRows();

  await upsertGuardianGroupSettings({
    groupJid,
    enabled: true,
    mode: 'observe',
    timezone: 'America/Mexico_City',
    settings: { source: runId }
  });
  const settings = await getGuardianGroupSettings(groupJid);
  assert.equal(settings.enabled, true);
  assert.equal(settings.mode, 'observe');
  assert.equal(settings.settings.source, runId);

  const caseId = await createModerationCase({
    groupJid,
    userJid,
    reporterJid,
    sourceMessageId: messageId,
    ruleKey: 'integration_test_rule',
    severity: 'medium',
    status: 'open',
    actionTaken: 'observe',
    evidence: { runId }
  });
  assert.equal(Number.isInteger(caseId), true);

  const dismissedCaseId = await createModerationCase({
    groupJid,
    userJid,
    reporterJid,
    sourceMessageId: `${messageId}-dismissed`,
    ruleKey: 'integration_test_rule',
    severity: 'medium',
    status: 'dismissed',
    actionTaken: 'observe',
    evidence: { runId, falsePositive: true }
  });
  assert.equal(Number.isInteger(dismissedCaseId), true);
  assert.equal(await countRecentInfractions({ groupJid, userJid, windowHours: 24 }), 1);

  assert.equal(await createMessageReport({
    groupJid,
    reportedMessageId: messageId,
    reportedUserJid: userJid,
    reporterJid,
    caseId,
    evidence: { runId }
  }), true);
  assert.equal(await createMessageReport({
    groupJid,
    reportedMessageId: messageId,
    reportedUserJid: userJid,
    reporterJid,
    caseId,
    evidence: { runId }
  }), false);
  assert.equal(await countMessageReports({ groupJid, reportedMessageId: messageId, windowMinutes: 60 }), 1);

  const badWordId = await addBadWordRule({
    groupJid,
    pattern: `bad-${runId}`,
    normalizedPattern: `bad-${runId}`,
    matchType: 'phrase',
    severity: 'moderada',
    enabled: true
  });
  const enabledBadWords = await listEnabledBadWords(groupJid);
  assert.equal(enabledBadWords.some(rule => rule.id === badWordId), true);

  await getPool().execute(
    `INSERT INTO wa_allowed_domains (group_jid, domain, include_subdomains, enabled)
     VALUES (:groupJid, :domain, 1, 1)`,
    { groupJid, domain: `${runId}.example` }
  );
  const allowedDomains = await listAllowedDomains(groupJid);
  assert.equal(allowedDomains.some(item => item.domain === `${runId}.example` && item.includeSubdomains), true);

  await recordBadWordEvent({
    groupJid,
    userJid,
    messageId,
    badWordId,
    caseId,
    severity: 'moderada',
    evidence: { runId }
  });
  await recordSpamEvent({
    groupJid,
    userJid,
    messageId: `${messageId}-spam`,
    spamType: 'image_spam',
    caseId,
    windowSeconds: 60,
    observedCount: 13,
    thresholdCount: 12,
    evidence: { runId }
  });
  await addUserSanction({
    groupJid,
    userJid,
    caseId,
    ruleKey: 'integration_test_rule',
    sanctionLevel: 1,
    action: 'observe',
    status: 'blocked',
    reason: 'integration'
  });

  const muteId = await createUserMute({
    groupJid,
    userJid,
    caseId,
    reason: 'integration',
    durationHours: 1
  });
  assert.equal(Number.isInteger(muteId), true);
  const muteBeforeIncrement = await getActiveUserMute({ groupJid, userJid });
  assert.equal(muteBeforeIncrement.id, muteId);
  await incrementUserMuteAttempts({ muteId });
  const muteAfterIncrement = await getActiveUserMute({ groupJid, userJid });
  assert.equal(Number(muteAfterIncrement.attempts_during_mute), Number(muteBeforeIncrement.attempts_during_mute) + 1);

  const health = await guardianHealthSummary(groupJid);
  assert.equal(health.openCases, 1);
  assert.equal(health.reports24h, 1);
  assert.equal(health.spam24h, 1);
  assert.equal(health.badWords24h, 1);

  assert.equal(await registerGuardianCommandUse({
    groupJid,
    userJid,
    commandName: 'integration',
    limitCount: 1,
    windowMinutes: 10
  }), true);
  assert.equal(await registerGuardianCommandUse({
    groupJid,
    userJid,
    commandName: 'integration',
    limitCount: 1,
    windowMinutes: 10
  }), false);
});
