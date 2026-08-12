import { config } from '../config.js';
import { logger } from '../logger.js';

const nextSendAtByChat = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sendOutboundMessage(sock, chatJid, content, options = {}) {
  if (config.dryRun) {
    logger.info({ chatJid, priority: options.priority || 'normal' }, 'dry-run: outbound WhatsApp message blocked');
    return { key: { id: null, remoteJid: chatJid }, dryRun: true };
  }

  const now = Date.now();
  const nextSendAt = nextSendAtByChat.get(chatJid) || 0;
  const waitMs = Math.max(0, nextSendAt - now);
  if (waitMs) await sleep(waitMs);

  const minDelay = Math.max(0, config.canalbot.outboundMinDelayMs);
  nextSendAtByChat.set(chatJid, Date.now() + minDelay);

  logger.debug({ chatJid, priority: options.priority || 'normal' }, 'sending outbound WhatsApp message');
  return sock.sendMessage(chatJid, content, options.baileysOptions || {});
}

export async function reply(sock, msg, text, { priority = 'normal' } = {}) {
  return sendOutboundMessage(
    sock,
    msg.key.remoteJid,
    { text },
    { priority, baileysOptions: { quoted: msg } }
  );
}
