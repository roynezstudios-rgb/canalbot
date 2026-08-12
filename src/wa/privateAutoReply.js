import { isJidGroup, isJidNewsletter } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { logAction } from '../db.js';
import { reply } from '../core/outboundQueue.js';
import { commandFromText } from '../core/messageUtils.js';

const PRIVATE_REPLY_ALIASES = new Map(Object.entries({
  ayuda: 'faq',
  ay: 'faq',
  help: 'faq',
  faq: 'faq',
  bot: 'bot',
  humano: 'humano',
  persona: 'humano',
  admin: 'humano',
  reportar: 'reportar',
  reporte: 'reportar',
  report: 'reportar',
  problema: 'reportar',
  grupo: 'grupo',
  reglas: 'grupo',
  comandos: 'grupo'
}));

const PRIVATE_REPLY_COMMANDS = new Set(['faq', 'bot', 'humano', 'reportar', 'grupo']);
const lastAutoReplyByChat = new Map();

function isPrivateChat(chatJid = '') {
  return Boolean(chatJid) && !isJidGroup(chatJid) && !isJidNewsletter(chatJid);
}

function cooldownMs() {
  return Math.max(1, config.personalAutoReply.cooldownHours) * 60 * 60 * 1000;
}

export function privateAutoReplyCommand(text = '') {
  const command = commandFromText(text, PRIVATE_REPLY_ALIASES, config.guardian.commandPrefix);
  if (!command || !PRIVATE_REPLY_COMMANDS.has(command.name)) return null;
  return command;
}

export function privateAutoReplyText(commandName = 'bot') {
  if (commandName === 'reportar') {
    return [
      'Gracias por avisar.',
      '',
      'Si el problema paso dentro del grupo, lo mejor es usar las herramientas del grupo para que quede contexto y evidencia:',
      `- Responde al mensaje problematico con ${config.guardian.commandPrefix}report.`,
      '- Con 3 reportes distintos, el bot intenta borrar el mensaje y registra infraccion.',
      `- Si eres admin, puedes responder al mensaje con ${config.guardian.commandPrefix}mal o ${config.guardian.commandPrefix}respeto para intervenir mas rapido.`,
      '',
      'La idea es bajar el conflicto, no escalarlo por privado. Este numero puede no tener seguimiento humano inmediato.'
    ].join('\n');
  }

  if (commandName === 'grupo') {
    return [
      'Funciones utiles dentro del grupo:',
      '',
      `- ${config.guardian.commandPrefix}report: reporta un mensaje respondiendolo directamente.`,
      `- ${config.guardian.commandPrefix}xp, ${config.guardian.commandPrefix}perfil, ${config.guardian.commandPrefix}top: participacion sana y niveles.`,
      '- Pregunta diaria: responde directamente a la pregunta para ganar XP extra.',
      '- Horario del grupo: el bot puede abrir/cerrar y avisar antes del cierre.',
      '',
      'Para evitar malentendidos, los reportes y problemas conviene tratarlos dentro del grupo donde esta el contexto.'
    ].join('\n');
  }

  if (commandName === 'humano') {
    return [
      'Este numero esta conectado principalmente a un bot.',
      '',
      'Puede haber una persona revisando en algun momento, pero no es un canal de soporte con respuesta inmediata. Despues de esta respuesta automatica no hay garantia de seguimiento humano.',
      '',
      `Para dudas rapidas puedes usar ${config.guardian.commandPrefix}faq, ${config.guardian.commandPrefix}grupo o ${config.guardian.commandPrefix}reportar.`
    ].join('\n');
  }

  return [
    'Hola, gracias por escribir.',
    '',
    'Este numero esta conectado principalmente a un bot que administra funciones del grupo/canal. No es un chat de atencion humana inmediata, asi que puede que nadie responda despues de este mensaje.',
    '',
    'Comandos utiles aqui:',
    `- ${config.guardian.commandPrefix}faq: ver esta ayuda.`,
    `- ${config.guardian.commandPrefix}grupo: funciones disponibles en el grupo.`,
    `- ${config.guardian.commandPrefix}reportar: como avisar de un problema.`,
    `- ${config.guardian.commandPrefix}humano: aclaracion sobre respuestas humanas.`,
    '',
    'Si vienes por un conflicto del grupo, por favor usa las funciones dentro del grupo para que quede contexto y se pueda moderar mejor.'
  ].join('\n');
}

export function shouldSendPrivateAutoReply({ chatJid, text = '', now = Date.now() }) {
  if (!config.personalAutoReply.enabled || !isPrivateChat(chatJid)) {
    return { send: false, reason: 'disabled_or_not_private', command: null };
  }

  const command = privateAutoReplyCommand(text);
  if (command) return { send: true, reason: 'command', command };
  if (String(text || '').trim().startsWith(config.guardian.commandPrefix)) {
    return { send: false, reason: 'unknown_command', command: null };
  }

  const lastReplyAt = lastAutoReplyByChat.get(chatJid) || 0;
  if (now - lastReplyAt < cooldownMs()) {
    return { send: false, reason: 'cooldown', command: null };
  }

  return { send: true, reason: 'first_contact', command: { name: 'bot', rawName: '', args: '' } };
}

export async function handlePrivateAutoReply({ sock, msg, chatJid, senderJid, text }) {
  const decision = shouldSendPrivateAutoReply({ chatJid, text });
  if (!decision.send) return false;

  const commandName = decision.command?.name || 'bot';
  await reply(sock, msg, privateAutoReplyText(commandName), { priority: 'private-autoreply' });
  lastAutoReplyByChat.set(chatJid, Date.now());
  await logAction({
    actionKey: 'private_autoreply_sent',
    mode: 'executed',
    targetUserJid: senderJid,
    messageId: msg.key.id,
    reason: decision.reason,
    details: { chatJid, commandName }
  });
  return true;
}
