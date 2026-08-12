import { proto } from '@whiskeysockets/baileys';
import { config } from '../../config.js';
import { sendOutboundMessage } from '../../core/outboundQueue.js';
import { sameJidIdentity, unwrapMessage } from '../../core/messageUtils.js';
import { senderGroupAdminStatus } from '../../core/permissions.js';
import { getGuardianGroupSettings, logAction, logGroupAdminAudit } from '../../db.js';
import { logger } from '../../logger.js';
import { guardianModeFromSettings } from '../mode.js';
import { guardianCanExecuteActions, recordInfraction } from './infractions.js';

const handledCallOffers = new Map();
const recentGroupCalls = [];
const RECENT_GROUP_CALL_LIMIT = 20;
const CALL_LINK_RE = /^https:\/\/call\.whatsapp\.com\/(voice|video)\/([^/?#]+)/i;

function isGroupJid(jid = '') {
  return jid.endsWith('@g.us');
}

function rememberCallOffer(callId, now = Date.now()) {
  if (!callId) return false;
  for (const [id, timestamp] of handledCallOffers.entries()) {
    if (now - timestamp > 30 * 60 * 1000) handledCallOffers.delete(id);
  }
  if (handledCallOffers.has(callId)) return false;
  handledCallOffers.set(callId, now);
  return true;
}

function numberFromLong(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.toNumber === 'function') return value.toNumber();
  return null;
}

function dateFromSeconds(value) {
  const seconds = numberFromLong(value);
  return seconds ? new Date(seconds * 1000) : null;
}

function dateFromMillis(value) {
  const millis = numberFromLong(value);
  return millis ? new Date(millis) : null;
}

function callLinkIdentity(joinLink = '') {
  const match = String(joinLink || '').match(CALL_LINK_RE);
  if (!match) return null;
  return {
    isVideo: match[1].toLowerCase() === 'video',
    token: match[2]
  };
}

function callIdFromMessage({ msg, fallbackId = null }) {
  return fallbackId || msg?.key?.id || null;
}

function callIdentityFromEvent(call) {
  if (!call?.id) return null;

  const groupJid = call.groupJid || (isGroupJid(call.chatId) ? call.chatId : null);
  if (!groupJid && !call.isGroup) return null;

  return {
    callId: call.id,
    groupJid,
    callerJid: call.from || call.callerPn || null,
    isVideo: Boolean(call.isVideo),
    offline: Boolean(call.offline),
    date: call.date || null,
    status: call.status || null,
    source: 'call_event'
  };
}

export function rememberRecentGroupCallEvent(call, now = Date.now()) {
  const identity = callIdentityFromEvent(call);
  return rememberRecentGroupCallIdentity(identity, now);
}

export function rememberRecentGroupCallIdentity(identity, now = Date.now()) {
  if (!identity?.callId) return null;

  const previousIndex = recentGroupCalls.findIndex(item => item.callId === identity.callId);
  const previous = previousIndex >= 0 ? recentGroupCalls[previousIndex] : null;
  if (previousIndex >= 0) recentGroupCalls.splice(previousIndex, 1);

  const merged = {
    ...previous,
    ...identity,
    groupJid: identity.groupJid || previous?.groupJid || null,
    callerJid: identity.callerJid || previous?.callerJid || null,
    seenAt: now
  };
  recentGroupCalls.unshift(merged);
  recentGroupCalls.splice(RECENT_GROUP_CALL_LIMIT);
  return merged;
}

export function rememberRecentGroupCallEvents(calls = [], now = Date.now()) {
  return (calls || [])
    .map(call => rememberRecentGroupCallEvent(call, now))
    .filter(Boolean);
}

export function recentGroupCallSnapshot() {
  return recentGroupCalls.map(item => ({ ...item }));
}

export function resolveGroupCallForManualEnd({ callId, callerJid, groupJid }) {
  const wantedCallId = callId && callId !== 'latest' ? callId : null;
  const recent = wantedCallId
    ? recentGroupCalls.find(item => item.callId === wantedCallId && (!groupJid || !item.groupJid || item.groupJid === groupJid))
    : recentGroupCalls.find(item => !groupJid || !item.groupJid || item.groupJid === groupJid);

  return {
    callId: wantedCallId || recent?.callId || null,
    groupJid: groupJid || recent?.groupJid || null,
    callerJid: callerJid || recent?.callerJid || null,
    isVideo: recent?.isVideo ?? null,
    offline: recent?.offline ?? false,
    date: recent?.date || null,
    source: 'manual_control'
  };
}

export function groupCallViolationFromEvent(call) {
  if (!call || call.status !== 'offer' || !call.isGroup) return null;

  const groupJid = call.groupJid || (isGroupJid(call.chatId) ? call.chatId : null);
  const callerJid = call.from || call.callerPn || null;
  if (!groupJid || !callerJid) return null;

  return {
    callId: call.id || null,
    groupJid,
    callerJid,
    isVideo: Boolean(call.isVideo),
    offline: Boolean(call.offline),
    date: call.date || null,
    source: 'call_event'
  };
}

export function groupCallViolationFromMessage(msg) {
  const groupJid = msg?.key?.remoteJid;
  const callMessage = msg?.message?.call;
  if (!isGroupJid(groupJid) || !callMessage) return null;

  const callKey = callMessage.callKey;
  const callId = Buffer.isBuffer(callKey)
    ? callKey.toString('hex')
    : msg.key.id;
  const callerJid = msg.key.participant || null;

  return {
    callId,
    groupJid,
    callerJid,
    isVideo: null,
    offline: false,
    date: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : null,
    source: 'message_call'
  };
}

export function groupVoiceChatViolationFromMessage(msg) {
  const groupJid = msg?.key?.remoteJid;
  if (!isGroupJid(groupJid)) return null;

  const m = unwrapMessage(msg?.message);
  const callerJid = msg?.key?.participant || null;
  const messageId = msg?.key?.id || null;

  if (m?.callLogMessage?.callType === proto.Message.CallLogMessage.CallType.VOICE_CHAT) {
    return {
      callId: callIdFromMessage({ msg }),
      groupJid,
      callerJid,
      isVideo: Boolean(m.callLogMessage.isVideo),
      offline: false,
      date: dateFromSeconds(msg.messageTimestamp),
      source: 'voice_chat_call_log'
    };
  }

  if (m?.scheduledCallCreationMessage) {
    const scheduledCall = m.scheduledCallCreationMessage;
    return {
      callId: callIdFromMessage({ msg }),
      groupJid,
      callerJid,
      isVideo: scheduledCall.callType === proto.Message.ScheduledCallCreationMessage.CallType.VIDEO,
      offline: false,
      date: dateFromMillis(scheduledCall.scheduledTimestampMs) || dateFromSeconds(msg.messageTimestamp),
      source: 'scheduled_call_creation_message'
    };
  }

  if (m?.eventMessage) {
    const callLink = callLinkIdentity(m.eventMessage.joinLink);
    if (m.eventMessage.isScheduleCall || callLink) {
      return {
        callId: callIdFromMessage({ msg, fallbackId: callLink?.token || messageId }),
        groupJid,
        callerJid,
        isVideo: callLink?.isVideo ?? null,
        offline: false,
        date: dateFromSeconds(m.eventMessage.startTime) || dateFromSeconds(msg.messageTimestamp),
        source: 'event_message_voice_chat'
      };
    }
  }

  if (
    msg?.messageStubType === proto.WebMessageInfo.StubType.SCHEDULED_CALL_START_MESSAGE ||
    msg?.messageStubType === proto.WebMessageInfo.StubType.LINKED_GROUP_CALL_START
  ) {
    return {
      callId: callIdFromMessage({ msg }),
      groupJid,
      callerJid,
      isVideo: null,
      offline: false,
      date: dateFromSeconds(msg.messageTimestamp),
      source: 'voice_chat_stub'
    };
  }

  return null;
}

async function terminateCallIfPossible(sock, violation, targetJid = violation.callerJid) {
  if (!sock?.query || !violation.callId || !violation.callerJid || !targetJid) {
    return { attempted: false, ok: false, reason: 'missing_query_or_call_identity' };
  }
  try {
    await sock.query({
      tag: 'call',
      attrs: {
        from: sock.user?.id,
        to: targetJid
      },
      content: [
        {
          tag: 'terminate',
          attrs: {
            'call-id': violation.callId,
            'call-creator': violation.callerJid,
            count: '0'
          }
        }
      ]
    });
    return { attempted: true, ok: true, targetJid };
  } catch (error) {
    logger.warn({ error, groupJid: violation.groupJid, callerJid: violation.callerJid, targetJid }, 'failed terminating group call');
    return { attempted: true, ok: false, targetJid, error: error.message || String(error) };
  }
}

async function closeCallIfPossible(sock, violation, { forceTerminate = false } = {}) {
  if (!violation.callId || !violation.callerJid) return { attempted: false, ok: false, reason: 'missing_call_identity' };
  const attempts = [];

  if (sock?.rejectCall) {
    attempts.push({ method: 'rejectCall', result: null });
    const attempt = attempts[attempts.length - 1];
    try {
      await sock.rejectCall(violation.callId, violation.callerJid);
      attempt.result = { attempted: true, ok: true };
      if (!forceTerminate) {
        return { attempted: true, ok: true, method: 'rejectCall', attempts };
      }
    } catch (error) {
      logger.warn({ error, groupJid: violation.groupJid, callerJid: violation.callerJid }, 'failed rejecting group call');
      attempt.result = { attempted: true, ok: false, error: error.message || String(error) };
    }
  }

  attempts.push({ method: 'terminate:caller', result: null });
  const terminateAttempt = attempts[attempts.length - 1];
  terminateAttempt.result = await terminateCallIfPossible(sock, violation);
  if (violation.groupJid && violation.groupJid !== violation.callerJid) {
    attempts.push({ method: 'terminate:group', result: null });
    const groupTerminateAttempt = attempts[attempts.length - 1];
    groupTerminateAttempt.result = await terminateCallIfPossible(sock, violation, violation.groupJid);
  }

  const okAttempt = attempts.find(attempt => attempt.result?.ok);
  return {
    attempted: attempts.some(attempt => attempt.result?.attempted),
    ok: Boolean(okAttempt),
    method: okAttempt?.method || null,
    attempts
  };
}

export async function endGroupCallByCode({ sock, callId = 'latest', callerJid = null, groupJid = null, requestedBy = 'local_control' }) {
  const violation = resolveGroupCallForManualEnd({ callId, callerJid, groupJid });
  if (!violation.callId || !violation.callerJid) {
    const result = {
      ok: false,
      attempted: false,
      reason: 'missing_call_id_or_caller_jid',
      violation
    };
    await logAction({
      actionKey: 'manual_group_call_end_failed',
      mode: 'blocked',
      groupJid: violation.groupJid,
      targetUserJid: violation.callerJid,
      messageId: violation.callId,
      reason: result.reason,
      details: { requestedBy, result, recentGroupCalls: recentGroupCallSnapshot() }
    });
    return result;
  }

  if (config.dryRun) {
    const result = {
      ok: false,
      attempted: false,
      reason: 'global_dry_run_enabled',
      violation
    };
    await logAction({
      actionKey: 'manual_group_call_end_blocked',
      mode: 'dry_run',
      groupJid: violation.groupJid,
      targetUserJid: violation.callerJid,
      messageId: violation.callId,
      reason: result.reason,
      details: { requestedBy, result }
    });
    return result;
  }

  const closeResult = await closeCallIfPossible(sock, violation, { forceTerminate: true });
  const result = {
    ok: closeResult.ok,
    attempted: closeResult.attempted,
    reason: closeResult.ok ? 'call_end_signal_sent' : 'call_end_signal_failed',
    violation,
    closeResult
  };

  await logAction({
    actionKey: closeResult.ok ? 'manual_group_call_end_sent' : 'manual_group_call_end_failed',
    mode: closeResult.ok ? 'executed' : 'failed',
    groupJid: violation.groupJid,
    targetUserJid: violation.callerJid,
    messageId: violation.callId,
    reason: result.reason,
    details: { requestedBy, result }
  });

  return result;
}

async function announceGroupCallBlocked(sock, violation, text) {
  try {
    await sendOutboundMessage(sock, violation.groupJid, { text }, { priority: 'moderation' });
  } catch (error) {
    logger.warn({ error, groupJid: violation.groupJid }, 'failed announcing group call guard action');
  }
}

export async function handleGuardianCallEvents({ sock, calls = [] }) {
  let handled = 0;

  rememberRecentGroupCallEvents(calls);

  for (const call of calls || []) {
    const violation = groupCallViolationFromEvent(call);
    if (!violation || !rememberCallOffer(violation.callId)) continue;

    const result = await handleGroupCallViolation({ sock, violation });
    if (result.handled) handled += 1;
  }

  return { handled };
}

export async function handleGuardianCallMessage({ sock, msg }) {
  const violation = groupCallViolationFromMessage(msg) || groupVoiceChatViolationFromMessage(msg);
  if (!violation || !rememberCallOffer(`msg:${violation.callId}`)) return false;
  rememberRecentGroupCallIdentity({
    ...violation,
    status: 'message_detected'
  });
  const result = await handleGroupCallViolation({ sock, violation });
  return result.handled;
}

async function handleGroupCallViolation({ sock, violation }) {
  const settings = await getGuardianGroupSettings(violation.groupJid);
  if (!config.guardian.enabled || !settings?.enabled) return { handled: false };

  if (!violation.callerJid) {
    await logAction({
      actionKey: 'group_call_guard_caller_unknown',
      mode: 'blocked',
      groupJid: violation.groupJid,
      messageId: violation.callId,
      reason: 'group_call_guard',
      details: { violation }
    });
    await announceGroupCallBlocked(sock, violation, '📵 Chats de voz prohibidos. WhatsApp avisó un chat de voz, pero no entregó quién lo inició; quedó registro auditable.');
    return { handled: true };
  }

  const groupMode = guardianModeFromSettings(settings);
  const adminStatus = await senderGroupAdminStatus(sock, violation.groupJid, violation.callerJid);
  const callerIsAdmin = adminStatus.isAdmin;
  const callerAdminUnknown = !adminStatus.known;
  const botJid = sock?.user?.id || null;
  const callerIsBot = botJid ? sameJidIdentity(violation.callerJid, botJid) : false;
  const canExecuteActions = guardianCanExecuteActions({ groupMode });
  const closeResult = canExecuteActions
    ? await closeCallIfPossible(sock, violation)
    : { attempted: false, ok: false, reason: 'destructive_actions_disabled' };

  const infraction = await recordInfraction({
    groupJid: violation.groupJid,
    userJid: violation.callerJid,
    reporterJid: botJid,
    messageId: violation.callId,
    ruleKey: 'group_call_guard',
    severity: 'high',
    groupMode,
    evidence: {
      callId: violation.callId,
      isVideo: violation.isVideo,
      offline: violation.offline,
      date: violation.date,
      source: violation.source,
      closeResult,
      callerIsAdmin,
      callerAdminUnknown,
      adminStatus,
      callerIsBot
    }
  });

  if (!canExecuteActions) {
    await logGroupAdminAudit({
      groupJid: violation.groupJid,
      actorJid: violation.callerJid,
      commandName: 'group_call_guard',
      eventType: 'group_call_blocked_destructive_disabled',
      status: 'blocked',
      details: { violation, closeResult, infraction }
    });
    await announceGroupCallBlocked(sock, violation, '📵 Los chats de voz no están permitidos. Quedó reporte auditable; las acciones reales están bloqueadas por configuración.');
    return { handled: true };
  }

  await logGroupAdminAudit({
    groupJid: violation.groupJid,
    actorJid: violation.callerJid,
    commandName: 'group_call_guard',
    eventType: 'group_call_infraction_recorded',
    status: closeResult.ok ? 'executed' : 'observed',
      details: { violation, closeResult, infraction, adminStatus, callerIsAdmin, callerAdminUnknown, callerIsBot }
  });
  await announceGroupCallBlocked(
    sock,
    violation,
    closeResult.ok
      ? '📵 Chat de voz cerrado/rechazado por GuardianBot. La persona que lo inició recibió una infracción auditable.'
      : '📵 Chat de voz reportado. Intenté cerrarlo desde WhatsApp, pero la infracción quedó registrada.'
  );
  return { handled: true };
}
