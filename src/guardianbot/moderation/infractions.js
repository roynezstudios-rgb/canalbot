import { config } from '../../config.js';
import { addUserSanction, countRecentInfractions, createModerationCase, logAction } from '../../db.js';

export function guardianCanExecuteActions({ groupMode } = {}) {
  return Boolean(
    !config.dryRun &&
    !config.guardian.observeOnly &&
    !config.guardian.dryRun &&
    config.guardian.destructiveActions &&
    groupMode === 'active'
  );
}

function baseActionForRule(ruleKey) {
  if (ruleKey === 'community_report') return 'warn';
  if (ruleKey === 'group_call_guard') return 'warn';
  if (ruleKey === 'bad_words_guard') return 'warn';
  if (ruleKey === 'link_guard') return 'delete';
  if (ruleKey.endsWith('_spam')) return 'warn';
  return 'warn';
}

export function actionForInfractionCount(totalInfractions, ruleKey, { groupMode } = {}) {
  if (!guardianCanExecuteActions({ groupMode })) {
    return { action: 'observe', sanctionLevel: 0, escalated: false };
  }
  if (ruleKey === 'group_call_guard') {
    return { action: 'warn', sanctionLevel: 1, escalated: false };
  }
  if (ruleKey === 'active_mute_attempt') {
    return { action: 'delete', sanctionLevel: 1, escalated: false };
  }
  if (totalInfractions >= config.guardian.infractionKickThreshold) {
    return { action: 'kick', sanctionLevel: 3, escalated: true };
  }
  if (totalInfractions >= config.guardian.infractionWarnThreshold) {
    return { action: 'warn', sanctionLevel: 1, escalated: true };
  }
  return { action: baseActionForRule(ruleKey), sanctionLevel: 1, escalated: false };
}

export async function recordInfraction({
  groupJid,
  userJid,
  reporterJid,
  messageId,
  ruleKey,
  severity = 'low',
  groupMode = 'observe',
  evidence = {}
}) {
  const previousInfractions = await countRecentInfractions({
    groupJid,
    userJid,
    windowHours: config.guardian.infractionWindowHours
  });
  const totalInfractions = previousInfractions + 1;
  const escalation = actionForInfractionCount(totalInfractions, ruleKey, { groupMode });
  const action = escalation.action;
  const caseId = await createModerationCase({
    groupJid,
    userJid,
    reporterJid,
    sourceMessageId: messageId,
    ruleKey,
    severity,
    status: 'open',
    actionTaken: action,
    evidence: {
      ...evidence,
      dryRun: config.guardian.dryRun,
      observeOnly: config.guardian.observeOnly,
      destructiveActions: config.guardian.destructiveActions,
      groupMode,
      canExecuteActions: guardianCanExecuteActions({ groupMode }),
      infractionWindowHours: config.guardian.infractionWindowHours,
      previousInfractions,
      totalInfractions,
      escalation
    }
  });
  await addUserSanction({
    groupJid,
    userJid,
    caseId,
    ruleKey,
    sanctionLevel: escalation.sanctionLevel,
    action,
    status: action === 'observe' ? 'blocked' : 'pending',
    reason: severity
  });
  await logAction({
    actionKey: `guardian_${ruleKey}`,
    mode: action === 'observe' ? 'blocked' : 'dry_run',
    groupJid,
    targetUserJid: userJid,
    messageId,
    reason: ruleKey,
    details: { caseId, action, severity, totalInfractions, escalation, evidence }
  });
  return { caseId, action, totalInfractions, escalation };
}
