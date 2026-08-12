import { isJidGroup } from '@whiskeysockets/baileys';
import { logger } from '../logger.js';

export async function senderGroupAdminStatus(sock, chatJid, senderJid) {
  if (!isJidGroup(chatJid)) return { known: true, isAdmin: false, reason: 'not_group' };
  try {
    const metadata = await sock.groupMetadata(chatJid);
    const senderBare = senderJid.split(':')[0];
    const participant = metadata.participants?.find(item => {
      const participantBare = item.id?.split(':')[0];
      return participantBare === senderBare || item.id === senderJid;
    });
    return {
      known: Boolean(participant),
      isAdmin: Boolean(participant?.admin),
      reason: participant ? 'matched' : 'participant_not_found'
    };
  } catch (error) {
    logger.warn({ error, chatJid, senderJid }, 'could not determine sender admin status');
    return { known: false, isAdmin: false, reason: 'metadata_error', error: error.message || String(error) };
  }
}

export async function senderIsGroupAdmin(sock, chatJid, senderJid) {
  const status = await senderGroupAdminStatus(sock, chatJid, senderJid);
  return Boolean(status.known && status.isAdmin);
}
