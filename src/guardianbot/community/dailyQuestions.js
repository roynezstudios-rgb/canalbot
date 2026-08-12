import {
  getDailyQuestionHistory,
  listEnabledGroupSchedules,
  logAction,
  recordDailyQuestionSent,
  selectNextDailyQuestion
} from '../../db.js';
import { sendOutboundMessage } from '../../core/outboundQueue.js';
import { logger } from '../../logger.js';
import { config } from '../../config.js';

const MINUTES_PER_DAY = 24 * 60;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function timeToMinutes(value) {
  const [hours = '0', minutes = '0'] = String(value || '00:00').split(':');
  return Number(hours) * 60 + Number(minutes);
}

function partsInTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    day: dayMap[map.weekday] || 1,
    minutes: (Number(map.hour) % 24) * 60 + Number(map.minute)
  };
}

function activeScheduleDays(schedule) {
  return String(schedule.active_days || '1,2,3,4,5,6,7')
    .split(',')
    .map(day => Number(day.trim()))
    .filter(Boolean);
}

export function localDateKeyForTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${pad2(map.month)}-${pad2(map.day)}`;
}

function parseOptions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function renderDailyQuestion(question) {
  const options = parseOptions(question.options_json);
  return [
    '💬 Pregunta diaria',
    '',
    question.question_text,
    options.length ? '' : null,
    ...options.map((option, index) => `${index + 1}. ${option}`),
    '',
    'Responde directamente a este mensaje para ganar XP extra.'
  ].filter(line => line !== null).join('\n');
}

export function shouldPublishDailyQuestionForSchedule(schedule, {
  now = new Date(),
  afterOpenMinutes = config.guardian.dailyQuestionAfterOpenMinutes
} = {}) {
  const nowParts = partsInTimezone(schedule.timezone, now);
  if (!activeScheduleDays(schedule).includes(nowParts.day)) return false;

  const open = timeToMinutes(schedule.open_time);
  const close = timeToMinutes(schedule.close_time);
  if (open === close) return true;

  const nowMinutes = nowParts.minutes;
  let minutesSinceOpen = null;
  if (open < close && nowMinutes >= open && nowMinutes < close) {
    minutesSinceOpen = nowMinutes - open;
  } else if (open > close && nowMinutes >= open) {
    minutesSinceOpen = nowMinutes - open;
  } else if (open > close && nowMinutes < close) {
    minutesSinceOpen = MINUTES_PER_DAY - open + nowMinutes;
  }

  return minutesSinceOpen != null && minutesSinceOpen <= afterOpenMinutes;
}

async function pinDailyQuestion(sock, groupJid, key) {
  const pinSeconds = Number(config.guardian.dailyQuestionPinSeconds || 0);
  if (!pinSeconds || !key) return { ok: false, reason: 'pin_disabled_or_missing_key' };

  try {
    await sock.sendMessage(groupJid, {
      pin: {
        type: 1,
        time: pinSeconds,
        key
      }
    });
    return { ok: true, pinSeconds };
  } catch (error) {
    logger.warn({ error, groupJid, messageId: key?.id }, 'failed pinning guardian daily question');
    return { ok: false, reason: 'pin_failed', error: error.message || String(error) };
  }
}

export async function processGuardianDailyQuestions(sock, { now = new Date() } = {}) {
  if (!config.guardian.enabled) return;
  const schedules = await listEnabledGroupSchedules();
  for (const schedule of schedules) {
    if (!shouldPublishDailyQuestionForSchedule(schedule, { now })) continue;

    const askedOn = localDateKeyForTimezone(schedule.timezone, now);
    const existing = await getDailyQuestionHistory({ groupJid: schedule.group_jid, askedOn });
    if (existing) continue;

    const question = await selectNextDailyQuestion();
    if (!question) {
      logger.warn({ groupJid: schedule.group_jid }, 'no active guardian daily questions available');
      continue;
    }

    try {
      const result = await sendOutboundMessage(
        sock,
        schedule.group_jid,
        { text: renderDailyQuestion(question) },
        { priority: 'community' }
      );
      const pinResult = await pinDailyQuestion(sock, schedule.group_jid, result?.key);
      const inserted = await recordDailyQuestionSent({
        groupJid: schedule.group_jid,
        questionId: question.id,
        askedOn,
        messageId: result?.key?.id || null
      });
      await logAction({
        actionKey: 'guardian_daily_question_sent',
        mode: inserted ? 'executed' : 'blocked',
        groupJid: schedule.group_jid,
        messageId: result?.key?.id || null,
        reason: inserted ? 'daily_question_sent' : 'daily_question_already_sent',
        details: { questionId: question.id, askedOn, pinResult }
      });
    } catch (error) {
      logger.error({ error, groupJid: schedule.group_jid, questionId: question.id }, 'failed sending guardian daily question');
      await logAction({
        actionKey: 'guardian_daily_question_sent',
        mode: 'failed',
        groupJid: schedule.group_jid,
        reason: 'daily_question_send_failed',
        details: { questionId: question.id, askedOn, error: error.message || String(error) }
      });
    }
  }
}
