import { isJidGroup, isJidNewsletter } from '@whiskeysockets/baileys';

export function unwrapMessage(message) {
  return message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.documentWithCaptionMessage?.message ||
    message;
}

export function messageText(message) {
  const m = unwrapMessage(message);
  return m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    '';
}

export function messageType(message) {
  const m = unwrapMessage(message);
  return Object.keys(m || {})[0] || 'unknown';
}

export function hasMedia(message) {
  const m = unwrapMessage(message);
  return Boolean(m?.imageMessage || m?.videoMessage || m?.audioMessage || m?.documentMessage || m?.stickerMessage);
}

export function mediaKind(message) {
  const m = unwrapMessage(message);
  if (m?.imageMessage) return 'image';
  if (m?.videoMessage) return 'video';
  if (m?.audioMessage) return 'audio';
  if (m?.documentMessage) return 'document';
  if (m?.stickerMessage) return 'sticker';
  return null;
}

export function commandFromText(text = '', aliases = new Map(), prefix = '!') {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.trim().match(new RegExp(`^${escapedPrefix}\\s*(\\S+)(?:\\s+([\\s\\S]*))?$`));
  if (!match) return null;
  const rawName = match[1].toLowerCase();
  return {
    name: aliases.get(rawName) || rawName,
    rawName,
    args: (match[2] || '').trim()
  };
}

export function classifyChat(chatJid = '') {
  if (isJidGroup(chatJid)) return 'group';
  if (isJidNewsletter(chatJid)) return 'newsletter';
  return 'private';
}

export function canalBotAccessForChat({ chatJid = '', activeControlChatJid = null, requireActiveControl = false } = {}) {
  if (!isJidGroup(chatJid)) {
    return requireActiveControl
      ? { allowed: false, reason: 'not_group_control_chat' }
      : { allowed: true, reason: null };
  }
  if (!activeControlChatJid && requireActiveControl) return { allowed: false, reason: 'no_active_control_group' };
  if (!activeControlChatJid) return { allowed: true, reason: null };
  if (activeControlChatJid === chatJid) return { allowed: true, reason: null };
  return { allowed: false, reason: 'different_control_group' };
}

export function getQuotedMessageKey(msg) {
  const contextInfo = unwrapMessage(msg.message)?.extendedTextMessage?.contextInfo ||
    unwrapMessage(msg.message)?.imageMessage?.contextInfo ||
    unwrapMessage(msg.message)?.videoMessage?.contextInfo ||
    unwrapMessage(msg.message)?.documentMessage?.contextInfo;
  if (!contextInfo?.stanzaId) return null;
  return {
    messageId: contextInfo.stanzaId,
    participant: contextInfo.participant || null,
    remoteJid: msg.key.remoteJid
  };
}

export function quotedMessageDeleteKey({ chatJid, quoted }) {
  return {
    remoteJid: chatJid,
    fromMe: false,
    id: quoted.messageId,
    participant: quoted.participant
  };
}

export function normalizedJidIdentity(jid = '') {
  const value = String(jid || '').trim();
  if (!value) return null;
  const [local, server = ''] = value.split('@');
  const bareLocal = local.split(':')[0];
  return server ? `${bareLocal}@${server}` : bareLocal;
}

export function sameJidIdentity(left, right) {
  const leftIdentity = normalizedJidIdentity(left);
  const rightIdentity = normalizedJidIdentity(right);
  return Boolean(leftIdentity && rightIdentity && leftIdentity === rightIdentity);
}

export function botJidCandidates(sock) {
  return [
    sock?.user?.id,
    sock?.user?.jid,
    sock?.user?.lid,
    sock?.authState?.creds?.me?.id,
    sock?.authState?.creds?.me?.jid,
    sock?.authState?.creds?.me?.lid
  ].filter(Boolean);
}

export function quotedMessageTargetsBot({ sock, quoted }) {
  if (!quoted?.participant) return false;
  return botJidCandidates(sock).some(candidate => sameJidIdentity(candidate, quoted.participant));
}
