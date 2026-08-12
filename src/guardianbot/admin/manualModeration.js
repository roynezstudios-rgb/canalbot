import { logGroupAdminAudit } from '../../db.js';
import { reply, sendOutboundMessage } from '../../core/outboundQueue.js';
import { getQuotedMessageKey, quotedMessageDeleteKey, quotedMessageTargetsBot, sameJidIdentity } from '../../core/messageUtils.js';
import { senderIsGroupAdmin } from '../../core/permissions.js';
import { logger } from '../../logger.js';
import { guardianModeFromSettings } from '../mode.js';
import { recordInfraction } from '../moderation/infractions.js';

function shortJid(jid = '') {
  return jid.split('@')[0].split(':')[0] || jid;
}

export function adminBadNoticeText({ targetJid, totalInfractions, deleted }) {
  return [
    `⚠️ @${shortJid(targetJid)}, un admin marcó tu mensaje como inadecuado.`,
    `Infracción registrada: ${totalInfractions}.`,
    deleted
      ? 'El mensaje fue eliminado.'
      : 'No pude eliminar el mensaje; revisa permisos del bot.'
  ].join('\n');
}

export function adminRespectNoticeText({ targetJid, totalInfractions, deleted }) {
  return [
    `⚠️ @${shortJid(targetJid)}, un admin marcó tu mensaje por falta de respeto o conflicto.`,
    `Infracción registrada: ${totalInfractions}.`,
    deleted
      ? 'El mensaje fue eliminado para bajar la tensión de la conversación.'
      : 'No pude eliminar el mensaje; revisa permisos del bot.'
  ].join('\n');
}

const MANUAL_MODERATION_COMMANDS = {
  mal: {
    commandName: 'mal',
    ruleKey: 'admin_marked_bad',
    eventPrefix: 'admin_bad_message',
    missingQuoteText: 'Para usar !mal, responde directamente al mensaje problemático.',
    selfText: 'No puedes marcarte una infracción a ti mismo con !mal.',
    noticeText: adminBadNoticeText,
    logMessage: 'failed deleting message marked with admin bad command'
  },
  respeto: {
    commandName: 'respeto',
    ruleKey: 'admin_marked_disrespect',
    eventPrefix: 'admin_respect_message',
    missingQuoteText: 'Para usar !respeto, responde directamente al mensaje conflictivo o con falta de respeto.',
    selfText: 'No puedes marcarte una infracción a ti mismo con !respeto.',
    noticeText: adminRespectNoticeText,
    logMessage: 'failed deleting message marked with admin respect command'
  }
};

export async function handleAdminManualModeration({ sock, msg, chatJid, senderJid, settings, kind = 'mal' }) {
  const profile = MANUAL_MODERATION_COMMANDS[kind] || MANUAL_MODERATION_COMMANDS.mal;
  const quoted = getQuotedMessageKey(msg);
  if (!quoted) {
    await reply(sock, msg, profile.missingQuoteText, { priority: 'admin' });
    return true;
  }
  if (!quoted.participant) {
    await reply(sock, msg, 'No pude identificar a quién pertenece el mensaje citado.', { priority: 'admin' });
    return true;
  }
  if (quotedMessageTargetsBot({ sock, quoted })) {
    await reply(sock, msg, 'No marco mensajes de GuardianBot como infracción. Si el bot se equivoca, ajustamos la regla.', { priority: 'admin' });
    return true;
  }
  if (sameJidIdentity(quoted.participant, senderJid)) {
    await reply(sock, msg, profile.selfText, { priority: 'admin' });
    return true;
  }

  const targetIsAdmin = await senderIsGroupAdmin(sock, chatJid, quoted.participant);
  if (targetIsAdmin) {
    await reply(sock, msg, 'No marco infracciones automáticas contra otros admins del grupo.', { priority: 'admin' });
    return true;
  }

  let deleted = false;
  try {
    await sock.sendMessage(chatJid, { delete: quotedMessageDeleteKey({ chatJid, quoted }) });
    deleted = true;
  } catch (error) {
    logger.warn({ error, chatJid, quoted }, profile.logMessage);
  }

  const infraction = await recordInfraction({
    groupJid: chatJid,
    userJid: quoted.participant,
    reporterJid: senderJid,
    messageId: quoted.messageId,
    ruleKey: profile.ruleKey,
    severity: 'medium',
    groupMode: guardianModeFromSettings(settings),
    evidence: {
      command: profile.commandName,
      adminMarked: true,
      deleted,
      quoted
    }
  });

  await logGroupAdminAudit({
    groupJid: chatJid,
    actorJid: senderJid,
    commandName: profile.commandName,
    eventType: deleted ? `${profile.eventPrefix}_deleted` : `${profile.eventPrefix}_delete_failed`,
    status: deleted ? 'executed' : 'failed',
    details: {
      targetJid: quoted.participant,
      quotedMessageId: quoted.messageId,
      caseId: infraction.caseId,
      totalInfractions: infraction.totalInfractions
    }
  });

  await sendOutboundMessage(
    sock,
    chatJid,
    {
      text: profile.noticeText({
        targetJid: quoted.participant,
        totalInfractions: infraction.totalInfractions,
        deleted
      }),
      mentions: [quoted.participant]
    },
    { priority: 'moderation' }
  );

  return true;
}

export function handleAdminBadMessage(args) {
  return handleAdminManualModeration({ ...args, kind: 'mal' });
}

export function handleAdminRespectMessage(args) {
  return handleAdminManualModeration({ ...args, kind: 'respeto' });
}
