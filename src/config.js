import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function bool(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  dryRun: bool('WA_DRY_RUN', true),
  enableConnect: bool('WA_ENABLE_CONNECT', false),
  sessionName: process.env.WA_SESSION_NAME || 'main',
  authDir: process.env.WA_AUTH_DIR || path.resolve('auth/main'),
  pairingPhone: process.env.WA_PAIRING_PHONE || '',
  qrImagePath: process.env.WA_QR_IMAGE_PATH || path.resolve('data/latest-qr.png'),
  logLevel: process.env.WA_LOG_LEVEL || 'info',
  mediaCacheDir: process.env.WA_MEDIA_CACHE_DIR || path.resolve('data/media-cache'),
  mediaRetentionHours: int('WA_MEDIA_RETENTION_HOURS', 48),
  canalbot: {
    enabled: bool('CANALBOT_ENABLE', true),
    publishEnabled: bool('CANALBOT_PUBLISH_ENABLED', true),
    globalSendDelaySeconds: int('CANALBOT_GLOBAL_SEND_DELAY_SECONDS', 15),
    globalSendLeaseSeconds: int('CANALBOT_GLOBAL_SEND_LEASE_SECONDS', 300),
    outboundMinDelayMs: int('CANALBOT_OUTBOUND_MIN_DELAY_MS', 2500),
    maxCaptureItems: int('CANALBOT_MAX_CAPTURE_ITEMS', 200),
    maxMediaBytes: int('CANALBOT_MAX_MEDIA_BYTES', 64 * 1024 * 1024),
    creatorMentionsEnabled: bool('CANALBOT_CREATOR_MENTIONS_ENABLED', true),
    creatorMentionChannelUrl: process.env.CANALBOT_CREATOR_MENTION_CHANNEL_URL || 'https://whatsapp.com/channel/0029Vak94drFcow5j1OfZ31F'
  },
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: int('MYSQL_PORT', 3306),
    database: process.env.MYSQL_DATABASE || 'canalbot',
    user: process.env.MYSQL_USER || 'canalbot',
    password: process.env.MYSQL_PASSWORD || ''
  }
};
