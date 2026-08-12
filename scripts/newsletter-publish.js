import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import dotenv from 'dotenv';
import path from 'node:path';
import pino from 'pino';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const authDir = process.env.WA_AUTH_DIR || 'auth/main';
const live = ['1', 'true', 'yes', 'on'].includes((process.env.WA_PUBLISH_LIVE || '').toLowerCase());
const targetInput = process.env.WA_NEWSLETTER_JID || process.env.WA_NEWSLETTER_INVITE || process.argv[2] || '';
const text = process.env.WA_PUBLISH_TEXT || process.argv.slice(3).join(' ') || '';
const imagePath = process.env.WA_PUBLISH_IMAGE || '';
const captionText = text.trim();

function imageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function normalizeNewsletterInput(input) {
  const value = input.trim();
  if (!value) return null;
  if (value.endsWith('@newsletter')) return { type: 'jid', key: value, jid: value };

  const channelMatch = value.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([^/?#\s]+)/i);
  if (channelMatch?.[1]) return { type: 'invite', key: channelMatch[1] };

  return { type: 'invite', key: value };
}

async function waitForOpen(sock, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for WhatsApp connection'));
    }, timeoutMs);

    sock.ev.on('connection.update', update => {
      if (update.qr) {
        clearTimeout(timer);
        reject(new Error('Session is not linked; QR pairing is required'));
      }

      if (update.connection === 'open') {
        clearTimeout(timer);
        resolve();
      }

      if (update.connection === 'close') {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode || update.lastDisconnect?.error?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          clearTimeout(timer);
          reject(new Error('Session is logged out; relink WhatsApp first'));
        }
      }
    });
  });
}

async function main() {
  const target = normalizeNewsletterInput(targetInput);
  if (!target) {
    throw new Error('Set WA_NEWSLETTER_JID or WA_NEWSLETTER_INVITE, or pass a channel link/JID as the first argument');
  }

  if (!text && !imagePath) {
    throw new Error('Set WA_PUBLISH_TEXT and/or WA_PUBLISH_IMAGE');
  }

  if (imagePath && !captionText) {
    throw new Error('BLOCK_CAPTION_REQUIRED: WhatsApp Channel image posts must include a non-empty caption/description');
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.ubuntu('Desktop'),
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false
  });
  sock.ev.on('creds.update', saveCreds);

  await waitForOpen(sock);

  let jid = target.jid;
  let metadata = null;
  if (!jid) {
    metadata = await sock.newsletterMetadata(target.type, target.key);
    jid = metadata?.id || metadata?.jid;
  } else {
    metadata = await sock.newsletterMetadata('jid', jid).catch(() => null);
  }

  if (!jid) {
    throw new Error(`Could not resolve newsletter target from ${target.type}:${target.key}`);
  }

  const content = imagePath
    ? { image: { url: imagePath }, caption: text, mimetype: imageMimeType(imagePath) }
    : { text };

  const summary = {
    live,
    jid,
    name: metadata?.name || metadata?.thread_metadata?.name?.text || null,
    subscribers: metadata?.subscribers || metadata?.thread_metadata?.subscribers_count || null,
    visibility: jid.endsWith('@newsletter')
      ? 'newsletter send accepted by WhatsApp/Baileys; visual confirmation is still required for media posts'
      : 'standard chat send',
    content: imagePath ? { imagePath, caption: text } : { text }
  };

  if (!live) {
    console.log(JSON.stringify({ ok: true, dryRun: true, ...summary }, null, 2));
    sock.end?.();
    process.exit(0);
    return;
  }

  const result = await sock.sendMessage(jid, content);
  console.log(JSON.stringify({
    ok: true,
    dryRun: false,
    ...summary,
    messageKey: result?.key || null
  }, null, 2));
  sock.end?.();
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
