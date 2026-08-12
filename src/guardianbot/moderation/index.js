import { config } from '../../config.js';
import { reply } from '../../core/outboundQueue.js';
import { mediaKind } from '../../core/messageUtils.js';
import { senderGroupAdminStatus } from '../../core/permissions.js';
import {
  createUserMute,
  getActiveUserMute,
  incrementUserMuteAttempts,
  logAction,
  recordBadWordEvent,
  recordSpamEvent
} from '../../db.js';
import { evaluateBadWords, guardianBadWordWarningText } from './badWords.js';
import { evaluateGuardianLinkGuard } from './linkGuard.js';
import { evaluateMediaSpam, evaluateStickerSpam } from './spamGuard.js';
import { guardianCanExecuteActions, recordInfraction } from './infractions.js';

function severityToCaseSeverity(severity) {
  if (['grave', 'discriminatoria', 'sexual_explicita', 'amenaza', 'high'].includes(severity)) return 'high';
  if (['moderada', 'medium'].includes(severity)) return 'medium';
  return 'low';
}

async function deleteMessage(sock, groupJid, msg, { groupMode } = {}) {
  if (!guardianCanExecuteActions({ groupMode })) return false;
  await sock.sendMessage(groupJid, { delete: msg.key });
  return true;
}

function shortJid(jid = '') {
  return jid.split('@')[0] || jid;
}

export function muteAttemptDecision(attemptsDuringMute) {
  const attempts = Number(attemptsDuringMute || 0);
  if (attempts === 10) return { action: 'warn', threshold: 10 };
  if (attempts === 15) return { action: 'kick', threshold: 15 };
  return { action: 'none', threshold: null };
}

async function applyMuteAttemptThreshold({
  sock,
  msg,
  groupJid,
  userJid,
  senderAdminUnknown = false,
  attemptsDuringMute,
  groupMode
}) {
  const decision = muteAttemptDecision(attemptsDuringMute);
  if (decision.action === 'none') return decision;

  if (decision.action === 'warn') {
    await reply(sock, msg, `⚠️ Advertencia: ${shortJid(userJid)} sigue intentando escribir durante el silencio. Intentos durante mute: ${attemptsDuringMute}/15.`, { priority: 'moderation' });
    await logAction({
      actionKey: 'guardian_active_mute_attempt_warning',
      mode: 'executed',
      groupJid,
      targetUserJid: userJid,
      messageId: msg.key.id,
      reason: 'active_mute_attempt_warning_threshold',
      details: { attemptsDuringMute, threshold: decision.threshold }
    });
    return decision;
  }

  if (!guardianCanExecuteActions({ groupMode })) {
    await reply(sock, msg, `⚠️ ${shortJid(userJid)} llegó a ${attemptsDuringMute} intentos durante el silencio. Ban no ejecutado porque GuardianBot no tiene acciones reales activas.`, { priority: 'moderation' });
    await logAction({
      actionKey: 'guardian_active_mute_attempt_kick',
      mode: 'blocked',
      groupJid,
      targetUserJid: userJid,
      messageId: msg.key.id,
      reason: 'actions_not_enabled',
      details: { attemptsDuringMute, threshold: decision.threshold, groupMode }
    });
    return { ...decision, executed: false, reason: 'actions_not_enabled' };
  }

  if (senderAdminUnknown) {
    await reply(sock, msg, `⚠️ ${shortJid(userJid)} llegó a ${attemptsDuringMute} intentos durante el silencio, pero no expulso porque no pude confirmar si es admin.`, { priority: 'moderation' });
    await logAction({
      actionKey: 'guardian_active_mute_attempt_kick',
      mode: 'blocked',
      groupJid,
      targetUserJid: userJid,
      messageId: msg.key.id,
      reason: 'admin_status_unknown',
      details: { attemptsDuringMute, threshold: decision.threshold }
    });
    return { ...decision, executed: false, reason: 'admin_status_unknown' };
  }

  try {
    const result = await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
    const participantResult = (result || []).find(item => item.jid === userJid);
    if (!participantResult || participantResult.status !== '200') {
      await reply(sock, msg, `⚠️ ${shortJid(userJid)} llegó a ${attemptsDuringMute} intentos durante el silencio. Se intentó expulsar, pero WhatsApp no confirmó la acción.`, { priority: 'moderation' });
      await logAction({
        actionKey: 'guardian_active_mute_attempt_kick',
        mode: 'failed',
        groupJid,
        targetUserJid: userJid,
        messageId: msg.key.id,
        reason: 'remove_not_confirmed',
        details: { attemptsDuringMute, threshold: decision.threshold, result }
      });
      return { ...decision, executed: false, reason: 'remove_not_confirmed', result };
    }
    await reply(sock, msg, `🚫 ${shortJid(userJid)} fue expulsado por insistir ${attemptsDuringMute} veces durante el silencio.`, { priority: 'moderation' });
    await logAction({
      actionKey: 'guardian_active_mute_attempt_kick',
      mode: 'executed',
      groupJid,
      targetUserJid: userJid,
      messageId: msg.key.id,
      reason: 'active_mute_attempt_kick_threshold',
      details: { attemptsDuringMute, threshold: decision.threshold, result }
    });
    return { ...decision, executed: true, reason: 'kicked', result };
  } catch (error) {
    await reply(sock, msg, `⚠️ ${shortJid(userJid)} llegó a ${attemptsDuringMute} intentos durante el silencio. Intenté expulsar, pero falló. Revisa permisos.`, { priority: 'moderation' });
    await logAction({
      actionKey: 'guardian_active_mute_attempt_kick',
      mode: 'failed',
      groupJid,
      targetUserJid: userJid,
      messageId: msg.key.id,
      reason: 'remove_failed',
      details: { attemptsDuringMute, threshold: decision.threshold, error: error.message || String(error) }
    });
    return { ...decision, executed: false, reason: 'remove_failed', error: error.message || String(error) };
  }
}

async function applyInfractionAction({
  sock,
  msg,
  groupJid,
  userJid,
  senderIsAdmin,
  senderAdminUnknown = false,
  infraction,
  groupMode,
  deleteOffending = false
}) {
  const canAct = guardianCanExecuteActions({ groupMode });
  const mustDelete = deleteOffending || infraction.action === 'delete';

  if (mustDelete) {
    try {
      const deleted = await deleteMessage(sock, groupJid, msg, { groupMode });
      if (!deleted) {
        await reply(sock, msg, guardianBadWordWarningText(), { priority: 'moderation' });
      }
    } catch (error) {
      await reply(sock, msg, '⚠️ Infracción registrada, pero no pude borrar el mensaje. Revisa permisos del bot.', { priority: 'moderation' });
    }
  }

  if (!canAct) return;

  if (['mute', 'kick'].includes(infraction.action) && (senderIsAdmin || senderAdminUnknown)) {
    await reply(sock, msg, senderAdminUnknown
      ? `⚠️ ${infraction.totalInfractions} infracciones registradas, pero no ejecuto mute/kick porque no pude verificar si la persona es admin.`
      : `⚠️ ${infraction.totalInfractions} infracciones registradas, pero no ejecuto mute/kick automático sobre admins.`,
    { priority: 'moderation' });
    return;
  }

  if (infraction.action === 'kick') {
    try {
      const result = await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
      const participantResult = (result || []).find(item => item.jid === userJid);
      if (!participantResult || participantResult.status !== '200') {
        await reply(sock, msg, `⚠️ ${infraction.totalInfractions} infracciones. Se intentó expulsar, pero WhatsApp no confirmó la acción.`, { priority: 'moderation' });
        return;
      }
      await reply(sock, msg, `🚫 ${shortJid(userJid)} fue expulsado por acumular ${infraction.totalInfractions} infracciones recientes.`, { priority: 'moderation' });
    } catch {
      await reply(sock, msg, `⚠️ ${infraction.totalInfractions} infracciones. Se intentó expulsar, pero falló. Revisa permisos.`, { priority: 'moderation' });
    }
    return;
  }

  if (infraction.action === 'mute') {
    const activeMute = await getActiveUserMute({ groupJid, userJid });
    if (!activeMute) {
      await createUserMute({
        groupJid,
        userJid,
        caseId: infraction.caseId,
        reason: `${infraction.totalInfractions} infracciones en ${config.guardian.infractionWindowHours}h`,
        durationHours: config.guardian.infractionMuteHours
      });
    }
    await reply(sock, msg, `🔇 ${shortJid(userJid)} queda en mute lógico por ${config.guardian.infractionMuteHours}h (${infraction.totalInfractions} infracciones).`, { priority: 'moderation' });
    return;
  }

  if (infraction.escalation?.escalated && infraction.action === 'warn') {
    await reply(sock, msg, `⚠️ Advertencia: ${infraction.totalInfractions} infracciones recientes.`, { priority: 'moderation' });
  }
}

export async function observeModeration({ sock, msg, groupJid, senderJid, text, groupMode = 'observe' }) {
  if (!config.guardian.enabled) return [];

  const results = [];
  const messageId = msg.key.id;
  const adminStatus = await senderGroupAdminStatus(sock, groupJid, senderJid);
  const senderIsAdmin = adminStatus.isAdmin;
  const senderAdminUnknown = !adminStatus.known;
  const activeMute = senderIsAdmin ? null : await getActiveUserMute({ groupJid, userJid: senderJid });
  if (activeMute) {
    const attemptsDuringMute = Number(activeMute.attempts_during_mute || 0) + 1;
    await incrementUserMuteAttempts({ muteId: activeMute.id });
    const infraction = await recordInfraction({
      groupJid,
      userJid: senderJid,
      messageId,
      ruleKey: 'active_mute_attempt',
      severity: 'medium',
      groupMode,
      evidence: {
        muteId: activeMute.id,
        expiresAt: activeMute.expires_at,
        attemptsDuringMute
      }
    });
    await applyInfractionAction({
      sock,
      msg,
      groupJid,
      userJid: senderJid,
      senderIsAdmin,
      senderAdminUnknown,
      infraction,
      groupMode,
      deleteOffending: true
    });
    const muteAttemptThreshold = await applyMuteAttemptThreshold({
      sock,
      msg,
      groupJid,
      userJid: senderJid,
      senderAdminUnknown,
      attemptsDuringMute,
      groupMode
    });
    infraction.muteAttemptThreshold = muteAttemptThreshold;
    results.push(infraction);
    return results;
  }

  const linkResult = await evaluateGuardianLinkGuard({ groupJid, text, senderIsAdmin });
  if (linkResult?.matched && !linkResult.allowed) {
    const infraction = await recordInfraction({
      groupJid,
      userJid: senderJid,
      messageId,
      ruleKey: 'link_guard',
      severity: severityToCaseSeverity(linkResult.severity),
      groupMode,
      evidence: linkResult.evidence
    });
    await applyInfractionAction({
      sock,
      msg,
      groupJid,
      userJid: senderJid,
      senderIsAdmin,
      senderAdminUnknown,
      infraction,
      groupMode,
      deleteOffending: false
    });
    results.push(infraction);
  }

  const badWordResult = await evaluateBadWords({ groupJid, text });
  if (badWordResult?.matched) {
    const infraction = await recordInfraction({
      groupJid,
      userJid: senderJid,
      messageId,
      ruleKey: 'bad_words_guard',
      severity: severityToCaseSeverity(badWordResult.severity),
      groupMode,
      evidence: badWordResult.evidence
    });
    await recordBadWordEvent({
      groupJid,
      userJid: senderJid,
      messageId,
      badWordId: badWordResult.ruleId,
      caseId: infraction.caseId,
      severity: badWordResult.severity,
      evidence: badWordResult.evidence
    });
    await applyInfractionAction({
      sock,
      msg,
      groupJid,
      userJid: senderJid,
      senderIsAdmin,
      senderAdminUnknown,
      infraction,
      groupMode,
      deleteOffending: false
    });
    results.push(infraction);
  }

  const kind = mediaKind(msg.message);
  const spamResult = kind === 'sticker'
    ? evaluateStickerSpam({ groupJid, userJid: senderJid, messageId })
    : evaluateMediaSpam({ groupJid, userJid: senderJid, messageId, mediaKind: kind });
  if (spamResult?.matched) {
    const infraction = await recordInfraction({
      groupJid,
      userJid: senderJid,
      messageId,
      ruleKey: spamResult.spamType,
      severity: 'medium',
      groupMode,
      evidence: spamResult
    });
    await recordSpamEvent({
      groupJid,
      userJid: senderJid,
      messageId,
      spamType: spamResult.spamType,
      caseId: infraction.caseId,
      windowSeconds: spamResult.windowSeconds,
      observedCount: spamResult.observedCount,
      thresholdCount: spamResult.thresholdCount,
      evidence: spamResult
    });
    await applyInfractionAction({ sock, msg, groupJid, userJid: senderJid, senderIsAdmin, senderAdminUnknown, infraction, groupMode });
    results.push(infraction);
  }

  return results;
}
