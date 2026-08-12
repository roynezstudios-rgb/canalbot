import { config } from '../../config.js';
import {
  listEnabledGroupSchedules,
  logAction,
  logGroupAdminAudit,
  markGroupScheduleChecked,
  markGroupScheduleCloseWarningSent
} from '../../db.js';
import { sendOutboundMessage } from '../../core/outboundQueue.js';
import { logger } from '../../logger.js';

const MINUTES_PER_DAY = 24 * 60;
export const SCHEDULE_CLOSE_WARNING_MINUTES = 20;
export const SCHEDULE_CLOSE_WARNING_THRESHOLDS = [20, 5];

function timeToMinutes(value) {
  if (value instanceof Date) return value.getUTCHours() * 60 + value.getUTCMinutes();
  const [hours = '0', minutes = '0'] = String(value || '00:00').split(':');
  return Number(hours) * 60 + Number(minutes);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function addLocalDays({ year, month, date }, days) {
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    date: next.getUTCDate()
  };
}

function localDateKey(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.date)}`;
}

function partsInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    day: dayMap[map.weekday] || 1,
    year: Number(map.year),
    month: Number(map.month),
    date: Number(map.day),
    minutes: (Number(map.hour) % 24) * 60 + Number(map.minute)
  };
}

function activeScheduleDays(schedule) {
  return String(schedule.active_days || '1,2,3,4,5,6,7')
    .split(',')
    .map(day => Number(day.trim()))
    .filter(Boolean);
}

export function expectedScheduleState(schedule) {
  const activeDays = activeScheduleDays(schedule);
  const now = partsInTimezone(schedule.timezone || config.guardian.defaultTimezone);
  if (!activeDays.includes(now.day)) return 'closed';

  const open = timeToMinutes(schedule.open_time);
  const close = timeToMinutes(schedule.close_time);
  if (open === close) return 'open';
  if (open < close) return now.minutes >= open && now.minutes < close ? 'open' : 'closed';
  return now.minutes >= open || now.minutes < close ? 'open' : 'closed';
}

function closeWarningKey(schedule, nowParts) {
  const open = timeToMinutes(schedule.open_time);
  const close = timeToMinutes(schedule.close_time);
  const closeDate = open > close && nowParts.minutes >= open
    ? addLocalDays(nowParts, 1)
    : nowParts;
  return `${localDateKey(closeDate)}T${pad2(Math.floor(close / 60))}:${pad2(close % 60)}:00`;
}

function minutesUntilScheduleClose(schedule, nowParts) {
  const activeDays = activeScheduleDays(schedule);
  if (!activeDays.includes(nowParts.day)) return null;

  const open = timeToMinutes(schedule.open_time);
  const close = timeToMinutes(schedule.close_time);
  if (open === close) return null;

  if (open < close) {
    if (nowParts.minutes < open || nowParts.minutes >= close) return null;
    return close - nowParts.minutes;
  }

  if (nowParts.minutes >= open) return MINUTES_PER_DAY - nowParts.minutes + close;
  if (nowParts.minutes < close) return close - nowParts.minutes;
  return null;
}

export function shouldSendScheduleCloseWarning(schedule, {
  warningMinutes = SCHEDULE_CLOSE_WARNING_THRESHOLDS,
  nowParts = partsInTimezone(schedule.timezone || config.guardian.defaultTimezone)
} = {}) {
  const thresholds = (Array.isArray(warningMinutes) ? warningMinutes : [warningMinutes])
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const minutesUntilClose = minutesUntilScheduleClose(schedule, nowParts);
  if (minutesUntilClose == null || minutesUntilClose < 1) {
    return { due: false, reason: 'outside_open_window', minutesUntilClose: null, warningKey: null };
  }
  const threshold = thresholds.find(value => minutesUntilClose <= value);
  const closeKey = closeWarningKey(schedule, nowParts);
  if (!threshold) {
    return {
      due: false,
      reason: 'outside_warning_window',
      minutesUntilClose,
      warningKey: closeKey
    };
  }

  const warningKey = `${closeKey}#${threshold}`;
  const alreadyWarned = schedule.last_close_warning_key === warningKey ||
    (threshold === SCHEDULE_CLOSE_WARNING_MINUTES && schedule.last_close_warning_key === closeKey);
  if (alreadyWarned) {
    return { due: false, reason: 'already_warned', minutesUntilClose, warningKey, warningMinutes: threshold };
  }

  return { due: true, reason: 'warning_due', minutesUntilClose, warningKey, warningMinutes: threshold };
}

export function scheduleTransitionText(schedule, expectedState) {
  const fallback = expectedState === 'open'
    ? '🟢 El grupo está en horario abierto.'
    : '🔒 El grupo está en horario cerrado.';
  const configured = expectedState === 'open' ? schedule.open_message : schedule.close_message;
  return configured || fallback;
}

export function scheduleGroupSettingForState(expectedState) {
  return expectedState === 'open' ? 'not_announcement' : 'announcement';
}

export function closeWarningText(schedule, minutesUntilClose) {
  const minutes = Math.max(1, Math.ceil(minutesUntilClose || SCHEDULE_CLOSE_WARNING_MINUTES));
  return `⏰ Aviso: en ${minutes} minutos se cerrará el grupo. A partir de ese momento solo admins podrán escribir.`;
}

export async function applyScheduleState({ sock, schedule, expectedState }) {
  const setting = scheduleGroupSettingForState(expectedState);
  if (!sock?.groupSettingUpdate) {
    return { ok: false, setting, reason: 'missing_group_setting_update' };
  }

  try {
    await sock.groupSettingUpdate(schedule.group_jid, setting);
    return { ok: true, setting, reason: 'schedule_group_setting_applied' };
  } catch (error) {
    logger.warn({ error, groupJid: schedule.group_jid, expectedState, setting }, 'failed applying guardian schedule group setting');
    return {
      ok: false,
      setting,
      reason: 'group_setting_update_failed',
      error: error.message || String(error)
    };
  }
}

export async function executeScheduleTransition({
  sock,
  schedule,
  expectedState,
  sendNotice = true,
  requestedBy = 'scheduler'
}) {
  const result = await applyScheduleState({ sock, schedule, expectedState });
  await markGroupScheduleChecked({
    groupJid: schedule.group_jid,
    expectedState,
    transitioned: result.ok
  });

  await logGroupAdminAudit({
    groupJid: schedule.group_jid,
    commandName: 'horario',
    eventType: `schedule_expected_${expectedState}`,
    status: result.ok ? 'executed' : 'failed',
    details: {
      observeOnly: false,
      requestedBy,
      setting: result.setting,
      result,
      openTime: schedule.open_time,
      closeTime: schedule.close_time,
      timezone: schedule.timezone
    }
  });

  await logAction({
    actionKey: `guardian_schedule_${expectedState}`,
    mode: result.ok ? 'executed' : 'failed',
    groupJid: schedule.group_jid,
    reason: result.reason,
    details: { schedule, result, requestedBy }
  });

  if (result.ok && sendNotice) {
    await sendOutboundMessage(
      sock,
      schedule.group_jid,
      { text: scheduleTransitionText(schedule, expectedState) },
      { priority: 'admin' }
    );
  }

  return result;
}

export async function sendScheduleCloseWarning({ sock, schedule, warning }) {
  try {
    await sendOutboundMessage(
      sock,
      schedule.group_jid,
      { text: closeWarningText(schedule, warning.minutesUntilClose) },
      { priority: 'admin' }
    );
    await markGroupScheduleCloseWarningSent({
      groupJid: schedule.group_jid,
      warningKey: warning.warningKey
    });
    await logGroupAdminAudit({
      groupJid: schedule.group_jid,
      commandName: 'horario',
      eventType: 'schedule_close_warning_sent',
      status: 'executed',
      details: {
        warningMinutes: warning.warningMinutes,
        minutesUntilClose: warning.minutesUntilClose,
        warningKey: warning.warningKey,
        closeTime: schedule.close_time,
        timezone: schedule.timezone
      }
    });
    await logAction({
      actionKey: 'guardian_schedule_close_warning',
      mode: 'executed',
      groupJid: schedule.group_jid,
      reason: 'schedule_close_warning_sent',
      details: { schedule, warning }
    });
    return { ok: true, reason: 'schedule_close_warning_sent' };
  } catch (error) {
    logger.warn({ error, groupJid: schedule.group_jid, warning }, 'failed sending guardian schedule close warning');
    await logGroupAdminAudit({
      groupJid: schedule.group_jid,
      commandName: 'horario',
      eventType: 'schedule_close_warning_sent',
      status: 'failed',
      details: {
        warning,
        error: error.message || String(error)
      }
    });
    return { ok: false, reason: 'schedule_close_warning_failed', error: error.message || String(error) };
  }
}

export async function processGuardianSchedules(sock) {
  const schedules = await listEnabledGroupSchedules();
  for (const schedule of schedules) {
    const expectedState = expectedScheduleState(schedule);
    const transitioned = schedule.expected_state !== expectedState;
    if (!transitioned) {
      await markGroupScheduleChecked({ groupJid: schedule.group_jid, expectedState, transitioned: false });
      const warning = shouldSendScheduleCloseWarning(schedule);
      if (warning.due) {
        const warningResult = await sendScheduleCloseWarning({ sock, schedule, warning });
        logger.info({ groupJid: schedule.group_jid, warning, result: warningResult }, 'guardian schedule close warning processed');
      }
      continue;
    }

    const result = await executeScheduleTransition({ sock, schedule, expectedState });
    logger.info({ groupJid: schedule.group_jid, expectedState, result }, 'guardian schedule transition processed');
  }
}
