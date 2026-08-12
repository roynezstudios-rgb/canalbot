import {
  getMagazineRun,
  listDueMagazineRuns,
  listEnabledGroupSchedules,
  magazineStats,
  markMagazineRunFailed,
  markMagazineRunSent,
  upsertMagazineRun
} from '../../db.js';
import { sendOutboundMessage } from '../../core/outboundQueue.js';
import { logger } from '../../logger.js';

function startOfWeek(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function periodKey(date, type) {
  if (type === 'monthly') return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const week = startOfWeek(date).toISOString().slice(0, 10);
  return week;
}

function topLines(topUsers = []) {
  if (!topUsers.length) return 'Top: aun sin datos suficientes.';
  return topUsers
    .map((user, index) => `${index + 1}. ${user.display_name || user.user_jid}: ${user.xp} XP`)
    .join('\n');
}

export function renderMagazine({ type, stats, period }) {
  const title = type === 'monthly'
    ? 'Revista mensual del grupo'
    : type === 'mesaniversario'
      ? 'Mesaniversario del grupo'
      : 'Revista semanal del grupo';
  return [
    title,
    `Periodo: ${period}`,
    `Mensajes: ${stats.messages}`,
    `Stickers: ${stats.stickers}`,
    `Reportes: ${stats.reports}`,
    `Eventos de spam: ${stats.spam}`,
    topLines(stats.topUsers),
    stats.spam === 0 && stats.reports === 0 ? 'Salud del grupo: tranquila.' : 'Salud del grupo: revisar actividad reciente.'
  ].join('\n');
}

export async function generateMagazineForGroup({ groupJid, type = 'weekly', now = new Date(), status = 'generated' }) {
  const period = periodKey(now, type);
  const existing = await getMagazineRun({ groupJid, magazineType: type, periodKey: period });
  if (existing && existing.status !== 'generated') return existing;

  const since = type === 'monthly'
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : startOfWeek(now);
  const until = type === 'monthly'
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    : addDays(since, 7);
  const stats = await magazineStats({ groupJid, since, until });
  const contentText = renderMagazine({ type, stats, period });
  await upsertMagazineRun({
    groupJid,
    magazineType: type,
    periodKey: period,
    status,
    contentText,
    stats
  });
  return { group_jid: groupJid, magazine_type: type, period_key: period, status, content_text: contentText };
}

export async function processGuardianMagazines(sock) {
  const schedules = await listEnabledGroupSchedules();
  const now = new Date();
  for (const schedule of schedules) {
    await generateMagazineForGroup({ groupJid: schedule.group_jid, type: 'weekly', now, status: 'generated' });
    if (now.getUTCDate() <= 7) {
      await generateMagazineForGroup({ groupJid: schedule.group_jid, type: 'monthly', now, status: 'generated' });
    }
  }

  const due = await listDueMagazineRuns();
  for (const item of due) {
    try {
      const result = await sendOutboundMessage(sock, item.group_jid, { text: item.content_text }, { priority: 'magazine' });
      await markMagazineRunSent({ id: item.id, whatsappMessageId: result?.key?.id || null });
    } catch (error) {
      await markMagazineRunFailed({ id: item.id, errorText: error.message || String(error) });
      logger.error({ error, magazineRunId: item.id }, 'failed sending guardian magazine');
    }
  }
}
