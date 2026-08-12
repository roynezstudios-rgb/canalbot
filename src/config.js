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
    maxCaptureItems: int('CANALBOT_MAX_CAPTURE_ITEMS', 200),
    maxMediaBytes: int('CANALBOT_MAX_MEDIA_BYTES', 64 * 1024 * 1024),
    creatorMentionsEnabled: bool('CANALBOT_CREATOR_MENTIONS_ENABLED', true),
    creatorMentionChannelUrl: process.env.CANALBOT_CREATOR_MENTION_CHANNEL_URL || 'https://whatsapp.com/channel/0029Vak94drFcow5j1OfZ31F'
  },
  personalAutoReply: {
    enabled: bool('BOT_PERSONAL_AUTOREPLY', false),
    cooldownHours: int('BOT_PERSONAL_AUTOREPLY_COOLDOWN_HOURS', 12)
  },
  guardian: {
    enabled: bool('GUARDIAN_ENABLE', false),
    dryRun: bool('GUARDIAN_DRY_RUN', true),
    observeOnly: bool('GUARDIAN_OBSERVE_ONLY', true),
    destructiveActions: bool('GUARDIAN_DESTRUCTIVE_ACTIONS', false),
    commandPrefix: process.env.GUARDIAN_COMMAND_PREFIX || '!',
    defaultTimezone: process.env.GUARDIAN_DEFAULT_TIMEZONE || 'America/Mexico_City',
    reportWindowMinutes: int('GUARDIAN_REPORT_WINDOW_MINUTES', 120),
    reportMuteThreshold: int('GUARDIAN_REPORT_MUTE_THRESHOLD', 3),
    reportActionThreshold: int('GUARDIAN_REPORT_ACTION_THRESHOLD', 5),
    userCommandLimitWindow: int('GUARDIAN_COMMAND_LIMIT_WINDOW', 10),
    userCommandLimitCount: int('GUARDIAN_COMMAND_LIMIT_COUNT', 5),
    groupAutoReplyPerMinute: int('GUARDIAN_GROUP_AUTOREPLY_PER_MINUTE', 6),
    outboundMinDelayMs: int('GUARDIAN_OUTBOUND_MIN_DELAY_MS', 2500),
    stickerShortWindowSeconds: int('GUARDIAN_STICKER_SHORT_WINDOW_SECONDS', 30),
    stickerShortWindowLimit: int('GUARDIAN_STICKER_SHORT_WINDOW_LIMIT', 5),
    stickerLongWindowSeconds: int('GUARDIAN_STICKER_LONG_WINDOW_SECONDS', 60),
    stickerLongWindowLimit: int('GUARDIAN_STICKER_LONG_WINDOW_LIMIT', 15),
    multimediaWindowSeconds: int('GUARDIAN_MULTIMEDIA_WINDOW_SECONDS', 60),
    multimediaDefaultLimit: int('GUARDIAN_MULTIMEDIA_DEFAULT_LIMIT', 12),
    infractionWindowHours: int('GUARDIAN_INFRACTION_WINDOW_HOURS', 24),
    infractionWarnThreshold: int('GUARDIAN_INFRACTION_WARN_THRESHOLD', 3),
    infractionMuteThreshold: int('GUARDIAN_INFRACTION_MUTE_THRESHOLD', 5),
    infractionKickThreshold: int('GUARDIAN_INFRACTION_KICK_THRESHOLD', 7),
    infractionMuteHours: int('GUARDIAN_INFRACTION_MUTE_HOURS', 12),
    scheduleCheckSeconds: int('GUARDIAN_SCHEDULE_CHECK_SECONDS', 60),
    xpDailyCap: int('GUARDIAN_XP_DAILY_CAP', 80),
    xpMessageMinLength: int('GUARDIAN_XP_MESSAGE_MIN_LENGTH', 8),
    xpValidMessage: int('GUARDIAN_XP_VALID_MESSAGE', 1),
    xpReplyBonus: int('GUARDIAN_XP_REPLY_BONUS', 2),
    xpQuestionAnswer: int('GUARDIAN_XP_QUESTION_ANSWER', 3),
    dailyQuestionCheckSeconds: int('GUARDIAN_DAILY_QUESTION_CHECK_SECONDS', 300),
    dailyQuestionAfterOpenMinutes: int('GUARDIAN_DAILY_QUESTION_AFTER_OPEN_MINUTES', 60),
    dailyQuestionPinSeconds: int('GUARDIAN_DAILY_QUESTION_PIN_SECONDS', 86400),
    magazineCheckSeconds: int('GUARDIAN_MAGAZINE_CHECK_SECONDS', 300),
    magazineBeforeOpenMinutes: int('GUARDIAN_MAGAZINE_BEFORE_OPEN_MINUTES', 30)
  },
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: int('MYSQL_PORT', 3306),
    database: process.env.MYSQL_DATABASE || 'whatsapp_guardian',
    user: process.env.MYSQL_USER || 'wa_guardian',
    password: process.env.MYSQL_PASSWORD || ''
  }
};
