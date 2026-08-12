import { createModerationCase, logGroupAdminAudit, upsertGroupProtectionState } from '../../db.js';

export async function captureProtectionBaseline(sock, groupJid) {
  const metadata = await sock.groupMetadata(groupJid);
  const admins = metadata.participants
    ?.filter(participant => participant.admin)
    .map(participant => participant.id) || [];
  await upsertGroupProtectionState({
    groupJid,
    subject: metadata.subject,
    description: metadata.desc,
    announce: metadata.announce,
    restrict: metadata.restrict,
    authorizedAdmins: admins,
    baseline: {
      subjectOwner: metadata.subjectOwner || null,
      descOwner: metadata.descOwner || null,
      size: metadata.size || metadata.participants?.length || null
    }
  });
  return { subject: metadata.subject, admins: admins.length, size: metadata.participants?.length || 0 };
}

export async function observeGroupUpdate(event) {
  const groupJid = event?.id;
  if (!groupJid) return;
  await logGroupAdminAudit({
    groupJid,
    actorJid: event?.author || null,
    eventType: 'group_update_observed',
    status: 'observed',
    details: event
  });
  await createModerationCase({
    groupJid,
    userJid: event?.author || null,
    ruleKey: 'group_protection',
    severity: 'info',
    status: 'open',
    actionTaken: 'observe',
    evidence: {
      event,
      note: 'Group protection is observe-only in phase 3.'
    }
  });
}

export async function observeParticipantsUpdate(event) {
  const groupJid = event?.id;
  if (!groupJid) return;
  await logGroupAdminAudit({
    groupJid,
    actorJid: event?.author || null,
    eventType: 'participants_update_observed',
    status: 'observed',
    details: event
  });
}
