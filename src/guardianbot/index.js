import { config } from '../config.js';
import {
  countMessageReports,
  createModerationCase,
  createMessageReport,
  addBadWordRule,
  removeBadWordRule,
  bulkAddBadWordRules,
  getGroupProtectionState,
  getGroupSchedule,
  getGuardianGroupSettings,
  getUserReputation,
  guardianHealthSummary,
  listActiveAchievements,
  listActiveMissions,
  listBadWordsForGroup,
  listUserAchievements,
  logGroupAdminAudit,
  registerGuardianCommandUse,
  setBadWordEnabled,
  topReputation,
  upsertGroupSchedule,
  upsertGuardianGroupSettings,
  logAction
} from '../db.js';
import { reply } from '../core/outboundQueue.js';
import { senderIsGroupAdmin } from '../core/permissions.js';
import { commandFromText, getQuotedMessageKey, quotedMessageDeleteKey, quotedMessageTargetsBot, sameJidIdentity } from '../core/messageUtils.js';
import { logger } from '../logger.js';
import { observeModeration } from './moderation/index.js';
import { badWordMatchTypeForPattern } from './moderation/badWords.js';
import { guardianCanExecuteActions, recordInfraction } from './moderation/infractions.js';
import { endGroupCallByCode } from './moderation/groupCalls.js';
import { normalizeText } from './moderation/normalizer.js';
import { captureProtectionBaseline } from './admin/protection.js';
import { executeScheduleTransition, expectedScheduleState } from './admin/schedules.js';
import { handleAdminBadMessage, handleAdminRespectMessage } from './admin/manualModeration.js';
import { achievementHelpText, levelLabel, observeCommunityActivity, xpHelpText } from './community/reputation.js';
import { generateMagazineForGroup } from './magazines/generator.js';
import { guardianWelcomeText } from './welcome.js';
import { guardianRulesText } from './rules.js';
import { guardianModeFromSettings } from './mode.js';

const GUARDIAN_ALIASES = new Map(Object.entries({
  ayuda: 'ayuda',
  help: 'ayuda',
  comandos: 'ayuda',
  comando: 'ayuda',
  parametros: 'parametros',
  parámetros: 'parametros',
  criterios: 'parametros',
  sanciones: 'parametros',
  normas: 'reglas',
  reglamento: 'reglas',
  hola: 'hola',
  experiencia: 'xp',
  nivel: 'xp',
  niveles: 'xp',
  yo: 'perfil',
  ranking: 'top',
  rank: 'top',
  reportar: 'report',
  ejemplo: 'ejemplo',
  guardianbot: 'guardian',
  'guardiánbot': 'guardian',
  guardian: 'guardian',
  'guardián': 'guardian',
  palabras: 'palabra',
  cerrarvoz: 'cerrarvoz',
  'cerrar-voz': 'cerrarvoz',
  cerrarchatvoz: 'cerrarvoz',
  'cerrar-chat-voz': 'cerrarvoz',
  cerrarllamada: 'cerrarvoz',
  'cerrar-llamada': 'cerrarvoz',
  finalizarllamada: 'cerrarvoz',
  'finalizar-llamada': 'cerrarvoz'
}));

const GUARDIAN_COMMANDS = new Set([
  'ayuda',
  'reglas',
  'parametros',
  'hola',
  'report',
  'xp',
  'perfil',
  'insignias',
  'misiones',
  'top',
  'resumen',
  'riesgos',
  'salud',
  'estadisticas',
  'mod',
  'caso',
  'desmutear',
  'desban',
  'strikes',
  'guardian',
  'horario',
  'abrir',
  'cerrar',
  'link',
  'palabra',
  'antispam',
  'cerrarvoz',
  'mal',
  'respeto',
  'ejemplo',
  'revista',
  'ban'
]);

export function normalizeGuardianCommand(command) {
  if (!command) return null;

  if (command.name !== 'guardian') return command;

  const args = String(command.args || '').trim();
  const normalizedArgs = args.replace(/^(bot|guardianbot|guardi[aá]nbot)\b\s*/i, '').trim();

  return {
    ...command,
    args: normalizedArgs
  };
}

const ADMIN_COMMANDS = new Set([
  'resumen',
  'riesgos',
  'salud',
  'estadisticas',
  'mod',
  'caso',
  'desmutear',
  'desban',
  'strikes',
  'guardian',
  'horario',
  'abrir',
  'cerrar',
  'link',
  'palabra',
  'antispam',
  'cerrarvoz',
  'mal',
  'respeto',
  'ejemplo',
  'revista',
  'ban'
]);

function guardianHelpText(settings, isAdmin = false) {
  const userCommands = [
    'Comandos para usuarios:',
    '!hola',
    '!comandos',
    '!parametros',
    '!reglas',
    '!xp',
    '!perfil',
    '!yo',
    '!top',
    '!insignias',
    '!misiones',
    '!report (respondiendo a un mensaje)',
    '',
    `Estado: ${settings?.enabled ? 'encendido' : 'apagado'}.`,
    `Modo efectivo: ${guardianModeFromSettings(settings)}.`
  ];

  if (!isAdmin) return userCommands.join('\n');

  return [
    ...userCommands,
    '',
    'Comandos para admins:',
    '!guardian estado | on | off | observe',
    '!salud',
    '!resumen',
    '!riesgos',
    '!estadisticas',
    '!ejemplo',
    '!revista',
    '!horario / !horario ayuda',
    '!palabra lista | add texto | remove id | load p1, p2 | on id | off id',
    '!cerrarvoz / !cerrarchatvoz',
    '!mal (respondiendo a un mensaje)',
    '!respeto (respondiendo a un mensaje)',
    '!mod baseline'
  ].join('\n');
}

function guardianParametersText(settings) {
  return [
    'Parámetros GuardianBot',
    '',
    `Estado: ${settings?.enabled ? 'encendido' : 'apagado'}.`,
    `Modo efectivo: ${guardianModeFromSettings(settings)}.`,
    '',
    'Reportes comunitarios:',
    `- Ventana: ${config.guardian.reportWindowMinutes} minutos.`,
    `- ${config.guardian.reportActionThreshold} reportes distintos sobre el mismo mensaje: se elimina el mensaje y se registra infracción al autor.`,
    '- Cada persona solo puede contar una vez por mensaje reportado.',
    '',
    'Infracciones:',
    `- ${config.guardian.infractionWarnThreshold} infracciones recientes: advertencia.`,
    `- ${config.guardian.infractionKickThreshold} infracciones recientes: expulsión si el bot puede actuar y la persona no es admin.`,
    `- Ventana de conteo: ${config.guardian.infractionWindowHours} horas.`,
    '- No hay mute automático como escalón normal.',
    '- Spam, flood, multimedia excesiva y stickers repetidos cuentan como infracción.',
    '',
    'Malas palabras:',
    '- Se registran y avisan con criterio conservador.',
    '- No se borran automáticamente por defecto para evitar falsos positivos.',
    '- Admins pueden revisar con !palabra lista y ajustar reglas.'
  ].join('\n');
}

async function handleGuardianSwitch({ sock, msg, chatJid, senderJid, command, settings }) {
  const isAdmin = await senderIsGroupAdmin(sock, chatJid, senderJid);
  if (!isAdmin) {
    await reply(sock, msg, 'Solo admins del grupo pueden cambiar GuardianBot.', { priority: 'admin' });
    return true;
  }

  const requestedOption = command.args.toLowerCase();
  const option = new Map([
    ['encender', 'on'],
    ['activar', 'on'],
    ['apagar', 'off'],
    ['desactivar', 'off'],
    ['observacion', 'observe'],
    ['observación', 'observe'],
    ['estado', 'status']
  ]).get(requestedOption) || requestedOption;

  if (!option || option === 'status') {
    await reply(sock, msg, [
      `GuardianBot para este grupo: ${settings?.enabled ? 'encendido' : 'apagado'}.`,
      `Modo guardado: ${settings?.mode || 'sin configurar'}.`,
      `Modo efectivo actual: ${guardianModeFromSettings(settings)}.`,
      'Uso: !guardian on | off | observe'
    ].join('\n'), { priority: 'admin' });
    return true;
  }

  if (!['on', 'off', 'observe'].includes(option)) {
    await reply(sock, msg, 'Uso: !guardian on | off | observe  (también: encender | apagar | estado)', { priority: 'admin' });
    return true;
  }

  const mode = option === 'on' ? 'active' : option;
  await upsertGuardianGroupSettings({
    groupJid: chatJid,
    enabled: option !== 'off',
    mode,
    timezone: config.guardian.defaultTimezone
  });
  await createModerationCase({
    groupJid: chatJid,
    userJid: senderJid,
    ruleKey: 'guardian_admin_command',
    severity: 'info',
    status: 'closed',
    actionTaken: 'settings_update',
    evidence: { command: 'guardian', requestedMode: requestedOption, normalizedMode: option, effectiveMode: guardianModeFromSettings({ mode }) }
  });

  await reply(sock, msg, [
    `GuardianBot configurado en modo: ${mode}.`,
    `Modo efectivo actual: ${guardianModeFromSettings({ mode })}.`,
    'Las acciones destructivas siguen protegidas por variables de entorno.'
  ].join('\n'), { priority: 'admin' });
  return true;
}

export function communityReportThresholdDecision(reportCount, actionThreshold) {
  return Number(reportCount) === Number(actionThreshold)
    ? { action: 'delete_and_infraction', threshold: Number(actionThreshold) }
    : { action: 'count_only', threshold: Number(actionThreshold) };
}

async function deleteQuotedCommunityReportMessage({ sock, chatJid, quoted }) {
  try {
    await sock.sendMessage(chatJid, { delete: quotedMessageDeleteKey({ chatJid, quoted }) });
    return { ok: true, reason: 'reported_message_deleted' };
  } catch (error) {
    logger.warn({ error, chatJid, quoted }, 'failed deleting community reported message');
    return { ok: false, reason: 'reported_message_delete_failed', error: error.message || String(error) };
  }
}

async function handleReport({ sock, msg, chatJid, senderJid, settings }) {
  const quoted = getQuotedMessageKey(msg);
  if (!quoted) {
    await reply(sock, msg, 'Para reportar, responde directamente al mensaje y usa !report.', { priority: 'moderation' });
    return true;
  }
  if (!quoted.participant) {
    await reply(sock, msg, 'No pude identificar a quién pertenece el mensaje citado. Responde a un mensaje de una persona del grupo y usa !report.', { priority: 'moderation' });
    return true;
  }
  if (quotedMessageTargetsBot({ sock, quoted })) {
    await reply(sock, msg, 'No puedes reportar mensajes de GuardianBot. Si el bot se equivoca, avísale a un admin.', { priority: 'moderation' });
    return true;
  }
  if (sameJidIdentity(quoted.participant, senderJid)) {
    await reply(sock, msg, 'No puedes reportarte a ti mismo.', { priority: 'moderation' });
    return true;
  }

  const inserted = await createMessageReport({
    groupJid: chatJid,
    reportedMessageId: quoted.messageId,
    reportedUserJid: quoted.participant,
    reporterJid: senderJid,
    caseId: null,
    evidence: { quoted }
  });
  if (!inserted) {
    await reply(sock, msg, 'Ese reporte ya estaba contado para ti.', { priority: 'moderation' });
    return true;
  }

  const reportCount = await countMessageReports({
    groupJid: chatJid,
    reportedMessageId: quoted.messageId,
    windowMinutes: config.guardian.reportWindowMinutes
  });

  const groupMode = guardianModeFromSettings(settings);
  const thresholdDecision = communityReportThresholdDecision(reportCount, config.guardian.reportActionThreshold);
  let deleteResult = null;
  let infraction = null;
  if (thresholdDecision.action === 'delete_and_infraction') {
    if (guardianCanExecuteActions({ groupMode })) {
      deleteResult = await deleteQuotedCommunityReportMessage({ sock, chatJid, quoted });
    } else {
      deleteResult = { ok: false, reason: 'actions_not_enabled' };
    }

    infraction = await recordInfraction({
      groupJid: chatJid,
      userJid: quoted.participant,
      reporterJid: senderJid,
      messageId: quoted.messageId,
      ruleKey: 'community_report',
      severity: 'high',
      groupMode,
      evidence: {
        reportCount,
        actionThreshold: config.guardian.reportActionThreshold,
        thresholdDecision,
        deleteResult
      }
    });
    await logAction({
      actionKey: 'guardian_community_report_threshold',
      mode: deleteResult.ok ? 'executed' : 'blocked',
      groupJid: chatJid,
      targetUserJid: quoted.participant,
      messageId: quoted.messageId,
      reason: deleteResult.reason,
      details: { reportCount, actionThreshold: config.guardian.reportActionThreshold, deleteResult, infraction }
    });
  }

  if (thresholdDecision.action === 'delete_and_infraction') {
    await reply(sock, msg, [
      `Reporte registrado (${reportCount}/${config.guardian.reportActionThreshold}).`,
      deleteResult.ok
        ? 'Se alcanzó el umbral: mensaje eliminado e infracción registrada.'
        : `Se alcanzó el umbral: infracción registrada, pero no pude eliminar el mensaje (${deleteResult.reason}).`
    ].join('\n'), { priority: 'moderation' });
    return true;
  }

  await reply(sock, msg, `Reporte registrado (${reportCount}/${config.guardian.reportActionThreshold}).`, { priority: 'moderation' });
  return true;
}

async function handleInfoCommand({ sock, msg, command, settings, isAdmin = false }) {
  const mode = guardianModeFromSettings(settings);
  if (command.name === 'ayuda') {
    await reply(sock, msg, guardianHelpText(settings, isAdmin));
    return true;
  }
  if (command.name === 'hola') {
    await reply(sock, msg, [
      'GuardianBot está atento en este grupo.',
      'Usa !comandos para ver lo disponible.'
    ].join('\n'));
    return true;
  }
  if (command.name === 'reglas') {
    await reply(sock, msg, guardianRulesText({ settings }), { priority: 'moderation' });
    return true;
  }
  if (command.name === 'parametros') {
    await reply(sock, msg, guardianParametersText(settings), { priority: 'moderation' });
    return true;
  }
  if (command.name === 'xp') {
    await reply(sock, msg, xpHelpText(), { priority: 'community' });
    return true;
  }
  if (command.name === 'perfil') {
    const reputation = await getUserReputation({ groupJid: msg.key.remoteJid, userJid: msg.key.participant || msg.key.remoteJid });
    await reply(sock, msg, reputation
      ? [`Perfil GuardianBot`, `Nivel: ${levelLabel(reputation.level_key)}`, `XP: ${reputation.xp}`, `Modo: ${mode}`].join('\n')
      : `Perfil GuardianBot\nNivel: ${levelLabel()}\nXP: 0\nModo: ${mode}`);
    return true;
  }
  if (command.name === 'insignias') {
    const available = await listActiveAchievements();
    const achievements = await listUserAchievements({ groupJid: msg.key.remoteJid, userJid: msg.key.participant || msg.key.remoteJid });
    await reply(sock, msg, achievementHelpText({ available, earned: achievements }), { priority: 'community' });
    return true;
  }
  if (command.name === 'misiones') {
    const missions = await listActiveMissions();
    await reply(sock, msg, missions.length
      ? missions.map(item => `• ${item.name}: ${item.description}`).join('\n')
      : 'No hay misiones activas.');
    return true;
  }
  if (command.name === 'top') {
    const top = await topReputation({ groupJid: msg.key.remoteJid, limit: 10 });
    await reply(sock, msg, top.length
      ? top.map((item, index) => `${index + 1}. ${item.display_name || item.user_jid} - ${item.xp} XP (${levelLabel(item.level_key)})`).join('\n')
      : 'Aún no hay ranking en este grupo.');
    return true;
  }
  if (['resumen', 'riesgos', 'salud', 'estadisticas'].includes(command.name)) {
    await reply(sock, msg, [
      `GuardianBot: ${settings?.enabled ? 'habilitado' : 'apagado por grupo'}`,
      `Modo efectivo: ${mode}`,
      `Observe only: ${config.guardian.observeOnly ? 'sí' : 'no'}`,
      `Acciones destructivas: ${config.guardian.destructiveActions ? 'permitidas por env' : 'bloqueadas por env'}`
    ].join('\n'), { priority: 'admin' });
    return true;
  }
  return false;
}

function parseHorarioArgs(args = '') {
  const trimmed = args.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const action = parts[0].toLowerCase();
  if (['ayuda', 'help'].includes(action)) return { kind: 'help' };
  if (['off', 'apagar', 'desactivar'].includes(action)) return { kind: 'config', enabled: false };
  if (action === 'mensaje') {
    const target = (parts[1] || '').toLowerCase();
    const text = parts.slice(2).join(' ').trim();
    if (!['abrir', 'cerrar', 'open', 'close'].includes(target) || !text) return null;
    return {
      kind: 'message',
      target: ['abrir', 'open'].includes(target) ? 'open' : 'close',
      text
    };
  }
  if (['dias', 'días'].includes(action)) {
    const activeDays = normalizeScheduleDays(parts[1] || '');
    return activeDays ? { kind: 'days', activeDays } : null;
  }
  if (['on', 'activar', 'encender'].includes(action)) parts.shift();
  const openTime = parts[0] || '08:00';
  const closeTime = parts[1] || '22:00';
  const timezone = parts[2] || config.guardian.defaultTimezone;
  const activeDays = normalizeScheduleDays(parts[3] || 'todos');
  if (!/^\d{2}:\d{2}$/.test(openTime) || !/^\d{2}:\d{2}$/.test(closeTime)) return null;
  if (!activeDays) return null;
  return { kind: 'config', enabled: true, openTime: `${openTime}:00`, closeTime: `${closeTime}:00`, timezone, activeDays };
}

function normalizeScheduleDays(value = '') {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['todos', 'diario', 'all'].includes(normalized)) return '1,2,3,4,5,6,7';
  if (['laboral', 'laborales', 'lunes-viernes', 'lun-vie'].includes(normalized)) return '1,2,3,4,5';
  if (['fin', 'finde', 'fin-de-semana', 'sab-dom'].includes(normalized)) return '6,7';

  const days = new Set();
  for (const token of normalized.split(',')) {
    if (/^[1-7]$/.test(token)) {
      days.add(Number(token));
      continue;
    }
    const range = token.match(/^([1-7])-([1-7])$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) return null;
      for (let day = start; day <= end; day += 1) days.add(day);
      continue;
    }
    return null;
  }
  return [...days].sort((a, b) => a - b).join(',');
}

function formatScheduleTime(value) {
  return String(value || '').slice(0, 5);
}

function scheduleHelpText() {
  return [
    'Configurar horario de GuardianBot:',
    '!horario',
    '!horario 08:00 22:00 America/Mexico_City',
    '!horario on 08:00 22:00 America/Mexico_City laboral',
    '!horario dias todos | laboral | fin | 1,2,3,4,5',
    '!horario mensaje abrir 🟢 Ya estamos en horario activo.',
    '!horario mensaje cerrar 🔒 Cerramos por hoy. Nos leemos mañana.',
    '!horario off',
    '',
    'Avisos automaticos: 20 y 5 minutos antes del cierre.',
    'Días: 1=lunes, 7=domingo.'
  ].join('\n');
}

function scheduleStatusText(schedule) {
  if (!schedule) {
    return [
      'Sin horario configurado.',
      'Usa: !horario 08:00 22:00 America/Mexico_City',
      'Ayuda: !horario ayuda'
    ].join('\n');
  }
  return [
    `Horario: ${schedule.enabled ? 'activo' : 'apagado'}`,
    `Abre: ${formatScheduleTime(schedule.open_time)}`,
    `Cierra: ${formatScheduleTime(schedule.close_time)}`,
    `Zona: ${schedule.timezone}`,
    `Días: ${schedule.active_days}`,
    `Estado esperado: ${schedule.expected_state}`,
    `Aviso al abrir: ${schedule.open_message || 'mensaje por defecto'}`,
    `Aviso al cerrar: ${schedule.close_message || 'mensaje por defecto'}`,
    'Avisos previos: 20 y 5 minutos antes del cierre.',
    '',
    'Ayuda: !horario ayuda'
  ].join('\n');
}

function badWordsHelpText() {
  return [
    'Filtro de malas palabras:',
    '!palabra lista',
    '!palabra add pendej',
    '!palabra remove 12',
    '!palabra off 12',
    '!palabra on 12',
    '!palabra load palabra1, palabra2, palabra3',
    '',
    'Las palabras se registran por grupo. En observación solo avisa y deja caso auditable.'
  ].join('\n');
}

function formatBadWordsList(rules) {
  if (!rules.length) {
    return [
      'No hay palabras configuradas para este grupo.',
      'Usa: !palabra add texto'
    ].join('\n');
  }
  return [
    'Filtro de malas palabras:',
    ...rules.slice(0, 20).map(rule => {
      const state = rule.enabled ? 'on' : 'off';
      return `#${rule.id} [${state}/${rule.scope}/${rule.severity}] ${rule.pattern}`;
    })
  ].join('\n');
}

function parseBadWordArgs(args = '') {
  const trimmed = args.trim();
  if (!trimmed) return { kind: 'help' };
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  const rawAction = match?.[1] || '';
  const rawRest = (match?.[2] || '').trim();
  const rest = rawRest.split(/\s+/).filter(Boolean);
  const action = rawAction.toLowerCase();
  if (['ayuda', 'help'].includes(action)) return { kind: 'help' };
  if (['lista', 'listar', 'list'].includes(action)) return { kind: 'list' };
  if (['add', 'agregar', 'añadir'].includes(action)) {
    const pattern = rest.join(' ').trim();
    return pattern ? { kind: 'add', pattern } : null;
  }
  if (['remove', 'eliminar', 'borrar', 'quitar'].includes(action)) {
    const id = Number(rest[0]);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { kind: 'remove', id };
  }
  if (['on', 'activar', 'encender', 'off', 'apagar', 'desactivar'].includes(action)) {
    const id = Number(rest[0]);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { kind: 'toggle', id, enabled: ['on', 'activar', 'encender'].includes(action) };
  }
  if (['load', 'cargar', 'masivo'].includes(action)) {
    if (!rawRest) return null;
    const patterns = rawRest.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    return patterns.length ? { kind: 'load', patterns } : null;
  }
  return null;
}

async function handleBan({ sock, msg, chatJid, senderJid, settings }) {
  const groupMode = guardianModeFromSettings(settings);
  const quoted = getQuotedMessageKey(msg);
  if (!quoted) {
    await reply(sock, msg, 'Para banear, responde directamente al mensaje de la persona y usa !ban.', { priority: 'admin' });
    return true;
  }
  if (!quoted.participant) {
    await reply(sock, msg, 'No pude identificar a quién pertenece ese mensaje. Responde a un mensaje de una persona del grupo.', { priority: 'admin' });
    return true;
  }
  if (quotedMessageTargetsBot({ sock, quoted })) {
    await reply(sock, msg, 'No puedo banear a GuardianBot. Si necesitas ajustes, usa los comandos de configuración.', { priority: 'admin' });
    return true;
  }
  if (sameJidIdentity(quoted.participant, senderJid)) {
    await reply(sock, msg, 'No puedes banear a un admin del grupo (incluyéndote a ti mismo).', { priority: 'admin' });
    return true;
  }

  const targetIsAdmin = await senderIsGroupAdmin(sock, chatJid, quoted.participant);
  if (targetIsAdmin) {
    await reply(sock, msg, 'No puedes banear a otro admin del grupo.', { priority: 'admin' });
    return true;
  }

  if (!guardianCanExecuteActions({ groupMode })) {
    await createModerationCase({
      groupJid: chatJid,
      userJid: quoted.participant,
      reporterJid: senderJid,
      sourceMessageId: quoted.messageId,
      ruleKey: 'admin_ban_command',
      severity: 'high',
      status: 'open',
      actionTaken: 'blocked',
      evidence: {
        observeOnly: true,
        groupMode,
        note: 'Las compuertas destructivas de GuardianBot no están completas. El ban no se ejecutó; queda caso auditable.'
      }
    });
    await logGroupAdminAudit({
      groupJid: chatJid,
      actorJid: senderJid,
      commandName: 'ban',
      eventType: 'ban_blocked_destructive_disabled',
      status: 'blocked',
      details: {
        targetJid: quoted.participant,
        quotedMessageId: quoted.messageId,
        globalDryRun: config.dryRun,
        dryRun: config.guardian.dryRun,
        observeOnly: config.guardian.observeOnly,
        destructiveActions: config.guardian.destructiveActions,
        groupMode
      }
    });
    await reply(sock, msg, [
      '⚠️ Ban registrado como caso auditable, pero NO ejecutado.',
      'Motivo: las compuertas destructivas de GuardianBot no están completas.',
      'Para activar bans reales deben estar apagados dry-run/observación, autorizadas las acciones destructivas y el grupo en modo active.'
    ].join('\n'), { priority: 'admin' });
    return true;
  }

  try {
    const result = await sock.groupParticipantsUpdate(chatJid, [quoted.participant], 'remove');
    const participantResult = (result || []).find(r => r.jid === quoted.participant);
    if (!participantResult || participantResult.status !== '200') {
      await createModerationCase({
        groupJid: chatJid,
        userJid: quoted.participant,
        reporterJid: senderJid,
        sourceMessageId: quoted.messageId,
        ruleKey: 'admin_ban_command',
        severity: 'high',
        status: 'open',
        actionTaken: 'failed',
        evidence: {
          result,
          note: participantResult ? `Status: ${participantResult.status}` : 'Sin respuesta del servidor'
        }
      });
      await logGroupAdminAudit({
        groupJid: chatJid,
        actorJid: senderJid,
        commandName: 'ban',
        eventType: 'ban_failed',
        status: 'failed',
        details: { targetJid: quoted.participant, result }
      });
      await reply(sock, msg, '❌ No se pudo expulsar. Revisa los permisos. El intento quedó registrado como caso.', { priority: 'admin' });
      return true;
    }

    await createModerationCase({
      groupJid: chatJid,
      userJid: quoted.participant,
      reporterJid: senderJid,
      sourceMessageId: quoted.messageId,
      ruleKey: 'admin_ban_command',
      severity: 'high',
      status: 'closed',
      actionTaken: 'ban_executed',
      evidence: { result }
    });
    await logGroupAdminAudit({
      groupJid: chatJid,
      actorJid: senderJid,
      commandName: 'ban',
      eventType: 'ban_executed',
      status: 'executed',
      details: { targetJid: quoted.participant, quotedMessageId: quoted.messageId, result }
    });
    await reply(sock, msg, '✅ La persona fue expulsada del grupo. El caso quedó cerrado como ban ejecutado.', { priority: 'admin' });
    return true;
  } catch (error) {
    logger.error({ error, chatJid, targetJid: quoted.participant }, 'ban execution failed');
    await createModerationCase({
      groupJid: chatJid,
      userJid: quoted.participant,
      reporterJid: senderJid,
      sourceMessageId: quoted.messageId,
      ruleKey: 'admin_ban_command',
      severity: 'high',
      status: 'open',
      actionTaken: 'error',
      evidence: { error: error.message || String(error) }
    });
    await logGroupAdminAudit({
      groupJid: chatJid,
      actorJid: senderJid,
      commandName: 'ban',
      eventType: 'ban_error',
      status: 'error',
      details: { targetJid: quoted.participant, error: error.message || String(error) }
    });
    await reply(sock, msg, '❌ Error al ejecutar el ban. Quedó registrado como caso abierto.', { priority: 'admin' });
    return true;
  }
}

async function handleAdminCommand({ sock, msg, chatJid, senderJid, command, settings }) {
  if (command.name === 'salud' || command.name === 'resumen' || command.name === 'riesgos' || command.name === 'estadisticas') {
    const health = await guardianHealthSummary(chatJid);
    const schedule = await getGroupSchedule(chatJid);
    const protection = await getGroupProtectionState(chatJid);
    await reply(sock, msg, [
      `GuardianBot: ${settings?.enabled ? 'habilitado' : 'apagado por grupo'}`,
      `Modo efectivo: ${guardianModeFromSettings(settings)}`,
      `Casos abiertos: ${health.openCases}`,
      `Reportes 24h: ${health.reports24h}`,
      `Spam 24h: ${health.spam24h}`,
      `Malas palabras 24h: ${health.badWords24h}`,
      `Horario: ${schedule?.enabled ? `${schedule.open_time}-${schedule.close_time} ${schedule.timezone}` : 'apagado'}`,
      `Protección base: ${protection ? 'capturada' : 'sin capturar'}`
    ].join('\n'), { priority: 'admin' });
    return true;
  }

  if (command.name === 'cerrarvoz') {
    const [firstArg = '', secondArg = ''] = command.args.split(/\s+/).filter(Boolean);
    const firstLooksLikeJid = firstArg.includes('@');
    const result = await endGroupCallByCode({
      sock,
      callId: firstLooksLikeJid ? 'latest' : firstArg || 'latest',
      callerJid: firstLooksLikeJid ? firstArg : (secondArg.includes('@') ? secondArg : null),
      groupJid: chatJid,
      requestedBy: `guardian_admin_command:${senderJid}`
    });

    if (result.ok) {
      await reply(sock, msg, [
        '📵 Envié señal para cerrar/rechazar el chat de voz.',
        `callId: ${result.violation.callId}`,
        `método: ${result.closeResult?.method || 'intento múltiple'}`
      ].join('\n'), { priority: 'admin' });
      return true;
    }

    await reply(sock, msg, [
      'No pude cerrar el chat de voz por código todavía.',
      result.reason === 'missing_call_id_or_caller_jid'
        ? 'WhatsApp no le ha entregado al bot el callId/iniciador de ese chat de voz activo.'
        : `Motivo: ${result.reason}`,
      'Si ese chat de voz ya estaba abierto antes de que el bot recibiera el evento, hay que cerrarlo manualmente desde WhatsApp.',
      'El bot sí intentará cerrarlo cuando WhatsApp le entregue el evento o un aviso de chat de voz con identificador.'
    ].join('\n'), { priority: 'admin' });
    return true;
  }

  if (command.name === 'mal') {
    return handleAdminBadMessage({ sock, msg, chatJid, senderJid, settings });
  }

  if (command.name === 'respeto') {
    return handleAdminRespectMessage({ sock, msg, chatJid, senderJid, settings });
  }

  if (command.name === 'palabra') {
    const parsed = parseBadWordArgs(command.args);
    if (!parsed || parsed.kind === 'help') {
      await reply(sock, msg, badWordsHelpText(), { priority: 'admin' });
      return true;
    }
    if (parsed.kind === 'list') {
      const rules = await listBadWordsForGroup(chatJid);
      await reply(sock, msg, formatBadWordsList(rules), { priority: 'admin' });
      return true;
    }
    if (parsed.kind === 'add') {
      const normalizedPattern = normalizeText(parsed.pattern);
      if (!normalizedPattern) {
        await reply(sock, msg, badWordsHelpText(), { priority: 'admin' });
        return true;
      }
      const matchType = badWordMatchTypeForPattern(normalizedPattern);
      const id = await addBadWordRule({
        groupJid: chatJid,
        pattern: parsed.pattern,
        normalizedPattern,
        matchType,
        severity: 'moderada',
        enabled: true
      });
      await logGroupAdminAudit({
        groupJid: chatJid,
        actorJid: senderJid,
        commandName: 'palabra',
        eventType: 'bad_word_added',
        status: 'observed',
        details: { id, patternPreview: parsed.pattern.slice(0, 80), matchType }
      });
      await reply(sock, msg, `Palabra agregada al filtro del grupo: #${id}.`, { priority: 'admin' });
      return true;
    }
    if (parsed.kind === 'toggle') {
      const affectedRows = await setBadWordEnabled({ id: parsed.id, groupJid: chatJid, enabled: parsed.enabled });
      if (!affectedRows) {
        await reply(sock, msg, `No encontré la palabra #${parsed.id} para este grupo.`, { priority: 'admin' });
        return true;
      }
      await logGroupAdminAudit({
        groupJid: chatJid,
        actorJid: senderJid,
        commandName: 'palabra',
        eventType: parsed.enabled ? 'bad_word_enabled' : 'bad_word_disabled',
        status: 'observed',
        details: { id: parsed.id }
      });
      await reply(sock, msg, `Filtro #${parsed.id}: ${parsed.enabled ? 'activado' : 'apagado'}.`, { priority: 'admin' });
      return true;
    }
    if (parsed.kind === 'remove') {
      const affectedRows = await removeBadWordRule({ id: parsed.id, groupJid: chatJid });
      if (!affectedRows) {
        await reply(sock, msg, `No encontré la palabra #${parsed.id} para este grupo.`, { priority: 'admin' });
        return true;
      }
      await logGroupAdminAudit({
        groupJid: chatJid,
        actorJid: senderJid,
        commandName: 'palabra',
        eventType: 'bad_word_removed',
        status: 'executed',
        details: { id: parsed.id }
      });
      await reply(sock, msg, `Regla #${parsed.id} eliminada del filtro.`, { priority: 'admin' });
      return true;
    }
    if (parsed.kind === 'load') {
      const summary = await bulkAddBadWordRules({
        groupJid: chatJid,
        patterns: parsed.patterns.map(p => {
          const normalizedPattern = normalizeText(p);
          return {
            pattern: p,
            normalizedPattern,
            matchType: badWordMatchTypeForPattern(normalizedPattern),
            severity: 'moderada',
            enabled: true
          };
        })
      });
      await logGroupAdminAudit({
        groupJid: chatJid,
        actorJid: senderJid,
        commandName: 'palabra',
        eventType: 'bad_words_bulk_loaded',
        status: 'executed',
        details: { requested: parsed.patterns.length, inserted: summary.insertedIds.length, skipped: summary.skipped }
      });
      await reply(sock, msg, `Carga masiva: ${summary.insertedIds.length} de ${parsed.patterns.length} palabras agregadas al filtro del grupo. Omitidas: ${summary.skipped}.`, { priority: 'admin' });
      return true;
    }
  }

  if (command.name === 'horario') {
    if (!command.args) {
      const schedule = await getGroupSchedule(chatJid);
      await reply(sock, msg, scheduleStatusText(schedule), { priority: 'admin' });
      return true;
    }
    const parsed = parseHorarioArgs(command.args);
    if (!parsed) {
      await reply(sock, msg, scheduleHelpText(), { priority: 'admin' });
      return true;
    }
    if (parsed.kind === 'help') {
      await reply(sock, msg, scheduleHelpText(), { priority: 'admin' });
      return true;
    }

    const currentSchedule = await getGroupSchedule(chatJid);
    if (parsed.kind === 'message' || parsed.kind === 'days') {
      await upsertGroupSchedule({
        groupJid: chatJid,
        enabled: currentSchedule?.enabled || false,
        openTime: currentSchedule?.open_time || '08:00:00',
        closeTime: currentSchedule?.close_time || '22:00:00',
        timezone: currentSchedule?.timezone || config.guardian.defaultTimezone,
        activeDays: parsed.activeDays || currentSchedule?.active_days || '1,2,3,4,5,6,7',
        openMessage: parsed.target === 'open' ? parsed.text : currentSchedule?.open_message || null,
        closeMessage: parsed.target === 'close' ? parsed.text : currentSchedule?.close_message || null
      });
      await logGroupAdminAudit({
        groupJid: chatJid,
        actorJid: senderJid,
        commandName: 'horario',
        eventType: parsed.kind === 'message' ? 'schedule_message_updated' : 'schedule_days_updated',
        status: 'observed',
        details: parsed
      });
      await reply(sock, msg, parsed.kind === 'message'
        ? `Mensaje de ${parsed.target === 'open' ? 'apertura' : 'cierre'} guardado.`
        : `Días del horario guardados: ${parsed.activeDays}.`, { priority: 'admin' });
      return true;
    }

    const scheduleConfig = {
      groupJid: chatJid,
      enabled: parsed.enabled,
      openTime: parsed.openTime || '08:00:00',
      closeTime: parsed.closeTime || '22:00:00',
      timezone: parsed.timezone || config.guardian.defaultTimezone,
      activeDays: parsed.activeDays || currentSchedule?.active_days || '1,2,3,4,5,6,7',
      openMessage: currentSchedule?.open_message || '🟢 Horario activo. Ya pueden participar en el grupo.',
      closeMessage: currentSchedule?.close_message || '🔒 Horario cerrado. Dejamos el grupo tranquilo hasta el próximo horario.'
    };
    await upsertGroupSchedule(scheduleConfig);
    await logGroupAdminAudit({
      groupJid: chatJid,
      actorJid: senderJid,
      commandName: 'horario',
      eventType: 'schedule_config_updated',
      status: 'executed',
      details: parsed
    });
    if (!parsed.enabled) {
      await reply(sock, msg, 'Horario apagado para este grupo.', { priority: 'admin' });
      return true;
    }

    const schedule = {
      group_jid: chatJid,
      enabled: 1,
      open_time: scheduleConfig.openTime,
      close_time: scheduleConfig.closeTime,
      timezone: scheduleConfig.timezone,
      active_days: scheduleConfig.activeDays,
      open_message: scheduleConfig.openMessage,
      close_message: scheduleConfig.closeMessage,
      expected_state: currentSchedule?.expected_state || 'unknown'
    };
    const expectedState = expectedScheduleState(schedule);
    const result = await executeScheduleTransition({
      sock,
      schedule,
      expectedState,
      sendNotice: false,
      requestedBy: `guardian_admin_command:${senderJid}`
    });

    await reply(sock, msg, [
      `Horario activo: ${formatScheduleTime(schedule.open_time)} a ${formatScheduleTime(schedule.close_time)} (${schedule.timezone}).`,
      expectedState === 'open'
        ? 'Estado aplicado ahora: grupo abierto para todos.'
        : 'Estado aplicado ahora: grupo cerrado, solo admins pueden escribir.',
      'Avisos previos: 20 y 5 minutos antes del cierre automatico.',
      result.ok
        ? `Ajuste WhatsApp aplicado: ${result.setting}.`
        : `No pude aplicar el ajuste de WhatsApp (${result.reason}). Revisa que el bot sea admin.`
    ].join('\n'), { priority: 'admin' });
    return true;
  }

  if (command.name === 'abrir' || command.name === 'cerrar') {
    await logGroupAdminAudit({
      groupJid: chatJid,
      actorJid: senderJid,
      commandName: command.name,
      eventType: `manual_${command.name}_requested`,
      status: 'blocked',
      details: { observeOnly: true }
    });
    await reply(sock, msg, `Solicitud de ${command.name} registrada. No cambio permisos porque GuardianBot sigue en observación.`, { priority: 'admin' });
    return true;
  }

  if (command.name === 'mod') {
    if (command.args.toLowerCase() === 'baseline') {
      const baseline = await captureProtectionBaseline(sock, chatJid);
      await logGroupAdminAudit({
        groupJid: chatJid,
        actorJid: senderJid,
        commandName: 'mod baseline',
        eventType: 'protection_baseline_captured',
        status: 'observed',
        details: baseline
      });
      await reply(sock, msg, `Base de protección capturada: ${baseline.subject || '(sin nombre)'}; admins: ${baseline.admins}; miembros: ${baseline.size}.`, { priority: 'admin' });
      return true;
    }
    await reply(sock, msg, 'Uso disponible ahora: !mod baseline', { priority: 'admin' });
    return true;
  }

  if (command.name === 'caso') {
    await reply(sock, msg, 'Consulta detallada de casos queda preparada para la siguiente iteración de administración.', { priority: 'admin' });
    return true;
  }

  if (command.name === 'ejemplo') {
    await reply(sock, msg, guardianWelcomeText({ preview: true }), { priority: 'admin' });
    return true;
  }

  if (command.name === 'revista') {
    const type = ['weekly', 'monthly', 'mesaniversario'].includes(command.args) ? command.args : 'weekly';
    const magazine = await generateMagazineForGroup({ groupJid: chatJid, type, status: 'generated' });
    await reply(sock, msg, magazine.content_text || magazine.contentText, { priority: 'admin' });
    return true;
  }

  if (command.name === 'ban') {
    return handleBan({ sock, msg, chatJid, senderJid, settings });
  }

  await reply(sock, msg, 'Comando administrativo registrado, pero su acción real sigue bloqueada en esta fase.', { priority: 'admin' });
  return true;
}

export async function handleGuardianGroupMessage({ sock, msg, chatJid, senderJid, text }) {
  const command = normalizeGuardianCommand(
    commandFromText(text, GUARDIAN_ALIASES, config.guardian.commandPrefix)
  );
  const settings = await getGuardianGroupSettings(chatJid);

  const guardianActiveForGroup = config.guardian.enabled && settings?.enabled;
  if (guardianActiveForGroup) {
    await observeModeration({ sock, msg, groupJid: chatJid, senderJid, text, groupMode: guardianModeFromSettings(settings) });
    await observeCommunityActivity({ msg, groupJid: chatJid, senderJid, text });
  }

  if (!command || !GUARDIAN_COMMANDS.has(command.name)) return guardianActiveForGroup;

  const accepted = await registerGuardianCommandUse({
    groupJid: chatJid,
    userJid: senderJid,
    commandName: command.name,
    limitCount: config.guardian.userCommandLimitCount,
    windowMinutes: config.guardian.userCommandLimitWindow
  });

  if (!accepted) {
    logger.info({ chatJid, senderJid, command: command.name }, 'guardian command cooldown hit');
    return true;
  }

  if (command.name === 'guardian') {
    return handleGuardianSwitch({ sock, msg, chatJid, senderJid, command, settings });
  }

  let isAdmin = false;
  if (ADMIN_COMMANDS.has(command.name) || command.name === 'ayuda') {
    isAdmin = await senderIsGroupAdmin(sock, chatJid, senderJid);
  }

  if (ADMIN_COMMANDS.has(command.name)) {
    if (!isAdmin) {
      // Silenciosamente ignorar comandos de admin por usuarios normales
      return true;
    }
  }

  if (!config.guardian.enabled || !settings?.enabled) {
    if (['report', 'xp', 'perfil', 'insignias', 'misiones', 'top'].includes(command.name)) {
      await reply(sock, msg, 'GuardianBot está apagado para este grupo.');
      return true;
    }
    return false;
  }

  if (command.name === 'report') {
    return handleReport({ sock, msg, chatJid, senderJid, settings });
  }

  if (ADMIN_COMMANDS.has(command.name)) {
    return handleAdminCommand({ sock, msg, chatJid, senderJid, command, settings });
  }

  if (await handleInfoCommand({ sock, msg, command, settings, isAdmin })) return true;

  await reply(sock, msg, 'Comando GuardianBot reconocido, pero su módulo todavía no está activo en esta fase.', { priority: 'admin' });
  return true;
}
