import { downloadMediaMessage, isJidGroup, isJidNewsletter } from '@whiskeysockets/baileys';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import {
  addPublicationCaptureItem,
  activateControlChat,
  deactivateControlChat,
  enqueueChannelPost,
  addStickerAsset,
  closeStickerLearning,
  closePublicationCapture,
  createStickerTestJob,
  getActiveControlChat,
  findChannel,
  getControlChat,
  getOpenStickerLearning,
  getOpenCampaignCapture,
  getOpenPublicationCapture,
  getPublicationSchedule,
  latestClosedStickerAsset,
  latestClosedStickerLearning,
  saveStickerStockSettings,
  getStickerStockSettings,
  setStickerStockEnabled,
  insertMessageEvent,
  listChannels,
  logAction,
  nextQueueSchedule,
  queueCounts,
  channelQueueStatus,
  savePublicationSchedule,
  schedulePendingPublicationCapture,
  setChannelPublishMode,
  setControlChatChannel,
  setControlChatInterval,
  setPublicationScheduleEnabled,
  startPublicationCapture,
  startStickerLearning,
  upsertChannel,
  upsertUser
} from '../db.js';
import { logger } from '../logger.js';
import { reply } from '../core/outboundQueue.js';
import { senderIsGroupAdmin } from '../core/permissions.js';
import { canalBotAccessForChat } from '../core/messageUtils.js';
import { stickerCommand, stickerTestSchedule, parseBlockSchedule, parseIndividualSchedule } from '../stickers/policy.js';
import { parsePublicationInterval, publicationCommand } from '../publications/policy.js';
import { collectCampaignIfCapturing, handleCampaignCommand } from '../campaigns/handler.js';

const COMMAND_ALIASES = new Map(Object.entries({
  ay: 'ayuda',
  hl: 'ayuda',
  ca: 'canal',
  cn: 'canales',
  in: 'intervalo',
  co: 'cola',
  pr: 'programar',
  po: 'programar-varios',
  por: 'programar-varios',
  pub: 'publicaciones',
  camp: 'campanas',
  campana: 'campanas',
  'campaña': 'campanas',
  ac: 'agregar-canal',
  cb: 'canalbot',
  st: 'stickers',
  ayuda: 'ayuda',
  help: 'ayuda',
  canalbot: 'canalbot',
  'canal-bot': 'canalbot',
  canales: 'canales',
  canal: 'canal',
  intervalo: 'intervalo',
  cola: 'cola',
  programar: 'programar',
  programarvarios: 'programar-varios',
  'programar-varios': 'programar-varios',
  agregarcanal: 'agregar-canal',
  'agregar-canal': 'agregar-canal'
  ,stickers: 'stickers',
  publicaciones: 'publicaciones',
  campanas: 'campanas',
  campañas: 'campanas'
}));

function unwrapMessage(message) {
  return message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.documentWithCaptionMessage?.message ||
    message;
}

function messageText(message) {
  const m = unwrapMessage(message);
  return m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    '';
}

function messageType(message) {
  const m = unwrapMessage(message);
  return Object.keys(m || {})[0] || 'unknown';
}

function hasMedia(message) {
  const m = unwrapMessage(message);
  return Boolean(m?.imageMessage || m?.videoMessage || m?.audioMessage || m?.documentMessage || m?.stickerMessage);
}

function isStickerMessage(message) {
  return Boolean(unwrapMessage(message)?.stickerMessage);
}

function commandFromText(text = '') {
  const match = text.trim().match(/^!(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const rawName = match[1].toLowerCase();
  return {
    name: COMMAND_ALIASES.get(rawName) || rawName,
    rawName,
    args: (match[2] || '').trim()
  };
}

function splitFirstArg(args = '') {
  const trimmed = args.trim();
  if (!trimmed) return { first: '', rest: '' };
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return {
    first: match?.[1] || '',
    rest: (match?.[2] || '').trim()
  };
}

function normalizeNewsletterJid(value = '') {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('@newsletter')) return trimmed;
  if (/^\d{8,}$/.test(trimmed)) return `${trimmed}@newsletter`;
  return null;
}

function parseNewsletterReference(value = '') {
  const raw = value.trim();
  const jid = normalizeNewsletterJid(raw);
  if (jid) return { kind: 'jid', key: jid };

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    if ((host === 'whatsapp.com' || host === 'wa.me') && parts[0] === 'channel' && parts[1]) {
      return { kind: 'invite', key: parts[1] };
    }
  } catch {
    // Not a URL; try bare invite below.
  }

  if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return { kind: 'invite', key: raw };
  return null;
}

function splitBulkPhrases(text = '') {
  return text
    .split(';')
    .map(item => item.trim())
    .filter(Boolean);
}

function newsletterNameFromMetadata(metadata) {
  const candidate =
    metadata?.name?.text ||
    metadata?.thread_metadata?.name?.text ||
    metadata?.thread?.name?.text ||
    metadata?.name;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export async function resolveNewsletterChannel(sock, args) {
  const { first, rest } = splitFirstArg(args);
  const reference = parseNewsletterReference(first);
  if (!reference) return null;

  let metadata = null;
  try {
    metadata = await sock.newsletterMetadata(reference.kind, reference.key);
  } catch (error) {
    if (reference.kind !== 'jid') throw error;
    logger.warn({ error, channelJid: reference.key }, 'could not fetch newsletter metadata by jid');
  }

  const metadataJid = normalizeNewsletterJid(metadata?.id || metadata?.thread_metadata?.id || metadata?.jid || '');
  const channelJid = reference.kind === 'jid' ? reference.key : metadataJid;
  if (!channelJid) {
    throw new Error('No pude resolver el enlace a un JID de canal.');
  }

  return {
    channelJid,
    name: rest || newsletterNameFromMetadata(metadata) || null,
    metadata
  };
}

function mediaInfo(message) {
  const m = unwrapMessage(message);
  if (m?.imageMessage) return { type: 'image', mimeType: m.imageMessage.mimetype || 'image/jpeg', fileLength: Number(m.imageMessage.fileLength || 0) };
  if (m?.videoMessage) return { type: 'video', mimeType: m.videoMessage.mimetype || 'video/mp4', fileLength: Number(m.videoMessage.fileLength || 0) };
  if (m?.documentMessage) return { type: 'document', mimeType: m.documentMessage.mimetype || 'application/octet-stream' };
  return null;
}

function extensionForMime(mimeType = '') {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('pdf')) return 'pdf';
  return 'bin';
}

async function downloadQueueMedia({ sock, msg, info }) {
  if (info.fileLength > config.canalbot.maxMediaBytes) {
    throw new Error(`El archivo supera el máximo permitido de ${Math.floor(config.canalbot.maxMediaBytes / (1024 * 1024))} MB.`);
  }
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.resolve(config.mediaCacheDir, 'channel-queue', day);
  await fs.mkdir(dir, { recursive: true });
  const ext = extensionForMime(info.mimeType);
  const filePath = path.join(dir, `${Date.now()}-${crypto.randomUUID()}.${ext}`);
  const buffer = await downloadMediaMessage(
    msg,
    'buffer',
    {},
    { reuploadRequest: sock.updateMediaMessage }
  );
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function downloadStickerMedia({ sock, msg }) {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.resolve(config.mediaCacheDir, 'stickers', day);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${crypto.randomUUID()}.webp`);
  const buffer = await downloadMediaMessage(
    msg,
    'buffer',
    {},
    { reuploadRequest: sock.updateMediaMessage }
  );
  await fs.writeFile(filePath, buffer);
  return filePath;
}

const CANALBOT_COMMANDS = new Set([
  'canalbot',
  'ayuda',
  'canales',
  'canal',
  'agregar-canal',
  'intervalo',
  'cola',
  'programar',
  'programar-varios',
  'stickers',
  'publicaciones',
  'campanas'
]);

async function handlePublicationCommand({ sock, msg, chatJid, senderJid, command }) {
  const publication = publicationCommand(`!pub ${command.args}`);
  const option = publication?.name || '';
  const control = await getControlChat(chatJid);
  const channelJid = control?.active_channel_jid;

  if (!channelJid) {
    await reply(sock, msg, 'Primero elige el canal que recibirá la cola con: !ca <nombre o jid>');
    return true;
  }

  if (option === 'iniciar') {
    if (await getOpenCampaignCapture(chatJid)) {
      await reply(sock, msg, 'Primero cierra la captura de campaña con: !camp fin');
      return true;
    }
    await startPublicationCapture({ chatJid, channelJid, creatorJid: senderJid });
    await reply(sock, msg, 'Captura de publicaciones iniciada. Envía textos, imágenes y videos en el orden deseado. Termina con: !pub fin');
    return true;
  }

  if (option === 'fin') {
    const closed = await closePublicationCapture(chatJid);
    if (!closed.capture) {
      await reply(sock, msg, 'No había una captura abierta. Usa: !pub iniciar');
      return true;
    }
    const settings = await getPublicationSchedule(chatJid, closed.capture.channel_jid);
    const scheduled = settings
      ? await schedulePendingPublicationCapture({ chatJid, channelJid: closed.capture.channel_jid, intervalSeconds: settings.interval_seconds })
      : [];
    await reply(sock, msg, closed.count
      ? `Listo: guardé ${closed.count} publicación${closed.count === 1 ? '' : 'es'} en orden.${scheduled.length ? ` Dejé ${scheduled.length} programada${scheduled.length === 1 ? '' : 's'} y pausada${scheduled.length === 1 ? '' : 's'}.` : ' Configura el intervalo con: !pub cada 2h'}`
      : 'No recibí textos, imágenes o videos durante la captura.');
    return true;
  }

  if (option === 'cada') {
    const parsed = parsePublicationInterval(publication.args);
    if (!parsed) {
      await reply(sock, msg, 'Uso: !pub cada 5m | 2h | 1d. Esta cola no admite segundos y el mínimo es 5 minutos.');
      return true;
    }
    const schedule = await savePublicationSchedule({ chatJid, channelJid, intervalSeconds: parsed.intervalSeconds });
    await setChannelPublishMode({ channelJid, publishMode: 'off' });
    const scheduled = await schedulePendingPublicationCapture({ chatJid, channelJid, intervalSeconds: parsed.intervalSeconds });
    await reply(sock, msg, `Intervalo guardado: 1 publicación cada ${parsed.label}. Reorganicé ${schedule?.pending_count || 0} pendiente${Number(schedule?.pending_count || 0) === 1 ? '' : 's'} y añadí ${scheduled.length} elemento${scheduled.length === 1 ? '' : 's'} nuevo${scheduled.length === 1 ? '' : 's'} en pausa. Activa con: !pub activar`);
    return true;
  }

  if (option === 'activar' || option === 'pausar' || option === 'estado') {
    const settings = await getPublicationSchedule(chatJid, channelJid);
    if (!settings) {
      await reply(sock, msg, 'Primero define el intervalo: !pub cada 2h');
      return true;
    }
    if (option === 'activar') {
      const scheduled = await schedulePendingPublicationCapture({ chatJid, channelJid, intervalSeconds: settings.interval_seconds });
      await setPublicationScheduleEnabled({ chatJid, channelJid, enabled: true });
      await setChannelPublishMode({ channelJid, publishMode: 'active' });
      await reply(sock, msg, `Cola de publicaciones activada para este canal.${scheduled.length ? ` Se añadieron ${scheduled.length} elemento${scheduled.length === 1 ? '' : 's'} pendientes.` : ''}`);
      return true;
    }
    if (option === 'pausar') {
      await setPublicationScheduleEnabled({ chatJid, channelJid, enabled: false });
      await setChannelPublishMode({ channelJid, publishMode: 'off' });
      await reply(sock, msg, 'Cola de publicaciones pausada para este canal. El contenido y su orden se conservan.');
      return true;
    }
    const counts = await queueCounts(channelJid);
    const queueStatus = await channelQueueStatus(channelJid);
    const open = await getOpenPublicationCapture(chatJid);
    await reply(sock, msg, [
      `Canal: ${channelJid}`,
      `Intervalo: ${Math.round(Number(settings.interval_seconds) / 60)} minutos`,
      `Estado: ${settings.status}`,
      `Por programar: ${settings.pending_count || 0}`,
      `En cola: ${counts.queued || 0}`,
      `Siguiente: ${queueStatus?.next_scheduled_at ? new Date(queueStatus.next_scheduled_at).toISOString() : 'sin contenido programado'}`,
      `Última publicación: ${queueStatus?.last_published_at ? new Date(queueStatus.last_published_at).toISOString() : 'aún ninguna'}`,
      `Pendientes por tipo: ${queueStatus?.queued_text || 0} texto, ${queueStatus?.queued_image || 0} imagen, ${queueStatus?.queued_video || 0} video`,
      `Fallidas: ${queueStatus?.failed_count || 0}`,
      open?.channel_jid === channelJid ? 'Captura abierta: sí.' : 'Captura abierta: no.'
    ].join('\n'));
    return true;
  }

  await reply(sock, msg, 'Uso: !pub iniciar | fin | cada 2h | activar | pausar | estado');
  return true;
}

async function handleStickerCommand({ sock, msg, chatJid, senderJid, command }) {
  const sticker = stickerCommand(`!st ${command.args}`);
  const option = sticker?.name || '';
  if (option === 'iniciar') {
    const control = await getControlChat(chatJid);
    if (!control?.active_channel_jid) {
      await reply(sock, msg, 'Primero elige el canal que recibirá este stock con: !ca <nombre o jid>');
      return true;
    }
    await startStickerLearning({ chatJid, channelJid: control.active_channel_jid, creatorJid: senderJid });
    await reply(sock, msg, 'Aprendizaje de stickers iniciado. Manda los stickers que quieres guardar y termina con: !st fin');
    return true;
  }

  if (option === 'fin') {
    const closed = await closeStickerLearning(chatJid);
    if (!closed.learning) {
      await reply(sock, msg, 'No había un aprendizaje de stickers abierto. Usa: !st iniciar');
      return true;
    }
    await reply(sock, msg, closed.count
      ? `Listo: guardé ${closed.count} sticker${closed.count === 1 ? '' : 's'}. Prueba uno con: !st prueba`
      : 'No recibí stickers durante el aprendizaje. Usa: !st iniciar y envía al menos uno.');
    return true;
  }

  if (option === 'prueba') {
    const control = await getControlChat(chatJid);
    if (!control?.active_channel_jid) {
      await reply(sock, msg, 'Primero configura un canal activo con: !ac <enlace del canal>');
      return true;
    }
    const asset = await latestClosedStickerAsset(chatJid);
    if (!asset) {
      await reply(sock, msg, 'Primero guarda un sticker: !st iniciar → sticker → !st fin');
      return true;
    }
    const scheduledAt = stickerTestSchedule();
    const jobId = await createStickerTestJob({
      learningId: asset.learning_id,
      stickerAssetId: asset.id,
      channelJid: control.active_channel_jid,
      sourceChatJid: chatJid,
      sourceMessageId: msg.key.id,
      creatorJid: senderJid,
      scheduledAt
    });
    await reply(sock, msg, `Prueba #${jobId} programada. Enviaré 1 sticker al canal activo a las ${scheduledAt.toISOString()} y me detendré.`);
    return true;
  }

  if (option === 'cada' || option === 'bloque') {
    const control = await getControlChat(chatJid);
    const learning = await latestClosedStickerLearning(chatJid, control?.active_channel_jid);
    if (!control?.active_channel_jid || !learning) {
      await reply(sock, msg, 'Necesitas un canal activo y un stock cerrado de stickers antes de configurar publicaciones.');
      return true;
    }
    const parsed = option === 'cada' ? parseIndividualSchedule(sticker.args) : parseBlockSchedule(sticker.args);
    if (!parsed) {
      await reply(sock, msg, option === 'cada'
        ? 'Uso: !st cada 15m | 2h | 1d. Los stickers individuales no permiten segundos.'
        : 'Uso: !st bloque <1-5> <segundos entre stickers, mínimo 10s> <intervalo mínimo 1h>. Ejemplo: !st bloque 5 15s 1h');
      return true;
    }
    const settings = await saveStickerStockSettings({
      chatJid, learningId: learning.id, channelJid: control.active_channel_jid, mode: option === 'cada' ? 'individual' : 'block',
      individualIntervalSeconds: option === 'cada' ? parsed.intervalSeconds : 3600,
      blockSize: option === 'bloque' ? parsed.blockSize : 1,
      inBlockDelaySeconds: option === 'bloque' ? parsed.inBlockDelaySeconds : 15,
      blockIntervalSeconds: option === 'bloque' ? parsed.blockIntervalSeconds : 3600
    });
    await reply(sock, msg, `Configuración guardada y pausada. Stock: ${learning.stock_count}. Modo: ${option === 'cada' ? `1 sticker cada ${parsed.label}` : parsed.label}. Activa con: !st activar`);
    return true;
  }

  if (option === 'activar' || option === 'pausar' || option === 'estado') {
    const control = await getControlChat(chatJid);
    const settings = await getStickerStockSettings(chatJid, control?.active_channel_jid);
    if (!settings) {
      await reply(sock, msg, 'Primero configura el modo: !st cada 1h o !st bloque 5 15s 1h');
      return true;
    }
    if (option === 'activar') {
      await setStickerStockEnabled({ chatJid, channelJid: control.active_channel_jid, enabled: true });
      await reply(sock, msg, 'Publicación de stickers activada. Usará el stock una sola vez y se detendrá al terminar o ante un fallo.');
      return true;
    }
    if (option === 'pausar') {
      await setStickerStockEnabled({ chatJid, channelJid: control.active_channel_jid, enabled: false });
      await reply(sock, msg, 'Publicación de stickers pausada. El stock no se borra.');
      return true;
    }
    await reply(sock, msg, `Stock: ${settings.stock_count}. Enviados: ${settings.sent_count}. Estado: ${settings.status}. Modo: ${settings.mode}. ${settings.enabled ? 'Activo.' : 'Pausado.'}`);
    return true;
  }

  await reply(sock, msg, 'Uso: !st iniciar | fin | prueba | cada 1h | bloque 5 15s 1h | activar | pausar | estado');
  return true;
}

async function collectStickerIfLearning({ sock, msg, chatJid, senderJid }) {
  if (!isStickerMessage(msg.message)) return false;
  const activeControl = await getActiveControlChat();
  if (activeControl?.chat_jid !== chatJid) return false;
  const learning = await getOpenStickerLearning(chatJid);
  if (!learning || learning.creator_jid !== senderJid) return false;

  const filePath = await downloadStickerMedia({ sock, msg });
  await addStickerAsset({
    learningId: learning.id,
    sourceMessageId: msg.key.id,
    filePath,
    mimeType: unwrapMessage(msg.message)?.stickerMessage?.mimetype || 'image/webp'
  });
  // Learning is intentionally silent: confirmation is sent only at !st fin.
  return true;
}

async function collectPublicationIfCapturing({ sock, msg, chatJid, senderJid, text }) {
  if (isStickerMessage(msg.message)) return false;
  const activeControl = await getActiveControlChat();
  if (activeControl?.chat_jid !== chatJid) return false;
  const capture = await getOpenPublicationCapture(chatJid);
  if (!capture || capture.creator_jid !== senderJid) return false;
  const info = mediaInfo(msg.message);
  if (info && !['image', 'video'].includes(info.type)) return false;
  if (!info && !text.trim()) return false;

  const mediaPath = info ? await downloadQueueMedia({ sock, msg, info }) : null;
  await addPublicationCaptureItem({
    sessionId: capture.id,
    sourceMessageId: msg.key.id,
    contentType: info?.type || 'text',
    textContent: text || null,
    mediaPath,
    mimeType: info?.mimeType || null,
    maxItems: config.canalbot.maxCaptureItems
  });
  // Capture is intentionally silent: the ordered total is reported at !pub fin.
  return true;
}

async function handleCanalBotSwitch({ sock, msg, chatJid, senderJid, command }) {
  if (!isJidGroup(chatJid)) {
    await reply(sock, msg, 'CanalBot se activa desde un grupo de control. Usa este comando dentro del grupo elegido.');
    return true;
  }

  const isAdmin = await senderIsGroupAdmin(sock, chatJid, senderJid);
  if (!isAdmin) {
    await reply(sock, msg, 'Solo admins del grupo pueden activar o apagar CanalBot.');
    return true;
  }

  const option = command.args.toLowerCase();
  const activeControl = await getActiveControlChat();

  if (!option || ['estado', 'status'].includes(option)) {
    await reply(sock, msg, activeControl
      ? [
          'CanalBot tiene un grupo de control activo:',
          activeControl.name || activeControl.chat_jid,
          activeControl.chat_jid,
          activeControl.chat_jid === chatJid ? 'Este grupo es el control actual.' : 'Este grupo no es el control actual.'
        ].join('\n')
      : 'CanalBot no tiene grupo de control activo. Usa: !canalbot on');
    return true;
  }

  if (['on', 'encender', 'activar'].includes(option)) {
    const activation = await activateControlChat({ chatJid, name: msg.pushName || null });
    if (!activation.activated) {
      await logAction({
        actionKey: 'channel_control_activation_blocked',
        mode: 'blocked',
        groupJid: chatJid,
        targetUserJid: senderJid,
        messageId: msg.key.id,
        reason: activation.reason,
        details: { activeControlChatJid: activation.activeControl?.chat_jid || null }
      });
      await reply(sock, msg, [
        'CanalBot ya tiene un grupo de control activo.',
        activation.activeControl?.name || activation.activeControl?.chat_jid,
        activation.activeControl?.chat_jid,
        'Para moverlo, primero apágalo desde ese grupo con: !canalbot off'
      ].join('\n'));
      return true;
    }

    await logAction({
      actionKey: 'channel_control_activated',
      mode: 'executed',
      groupJid: chatJid,
      targetUserJid: senderJid,
      messageId: msg.key.id,
      reason: 'canalbot_on_command',
      details: { activeControlChatJid: chatJid }
    });
    await reply(sock, msg, [
      'CanalBot activado para este grupo de control.',
      'Desde ahora ignorará comandos de CanalBot en otros grupos.',
      'Siguiente paso: !ac <enlace|jid del canal> o !ca <nombre|jid>'
    ].join('\n'));
    return true;
  }

  if (['off', 'apagar', 'desactivar'].includes(option)) {
    if (!activeControl || activeControl.chat_jid !== chatJid) {
      await reply(sock, msg, 'Este grupo no es el grupo de control activo de CanalBot.');
      return true;
    }

    await deactivateControlChat(chatJid);
    await logAction({
      actionKey: 'channel_control_deactivated',
      mode: 'executed',
      groupJid: chatJid,
      targetUserJid: senderJid,
      messageId: msg.key.id,
      reason: 'canalbot_off_command',
      details: { activeControlChatJid: chatJid }
    });
    await reply(sock, msg, 'CanalBot apagado para este grupo. No se borró la cola ni el canal configurado.');
    return true;
  }

  await reply(sock, msg, 'Uso: !canalbot on | off | estado');
  return true;
}

async function handleQueueCommand({ sock, msg, chatJid, senderJid, text }) {
  if (!config.canalbot.enabled) return false;

  const command = commandFromText(text);
  if (!command) return false;

  if (!CANALBOT_COMMANDS.has(command.name)) {
    return false;
  }

  if (command.name === 'canalbot') {
    return handleCanalBotSwitch({ sock, msg, chatJid, senderJid, command });
  }

  const activeControl = await getActiveControlChat();
  const access = canalBotAccessForChat({
    chatJid,
    activeControlChatJid: activeControl?.chat_jid || null,
    requireActiveControl: true
  });
  if (!access.allowed) {
    await logAction({
      actionKey: 'channel_command_blocked_wrong_group',
      mode: 'blocked',
      groupJid: isJidGroup(chatJid) ? chatJid : null,
      targetUserJid: senderJid,
      messageId: msg.key.id,
      reason: access.reason,
      details: {
        chatJid,
        command: command.rawName,
        canonicalCommand: command.name,
        activeControlChatJid: activeControl?.chat_jid || null
      }
    });
    logger.warn({
      chatJid,
      activeControlChatJid: activeControl?.chat_jid || null,
      command: command.rawName,
      reason: access.reason
    }, 'blocked CanalBot command outside active control group');
    if (isJidGroup(chatJid) && command.name === 'ayuda') {
      return false;
    }
    return true;
  }

  if (isJidGroup(chatJid)) {
    const isAdmin = await senderIsGroupAdmin(sock, chatJid, senderJid);
    if (!isAdmin) {
      await reply(sock, msg, 'Solo admins del grupo pueden usar comandos de programación.');
      return true;
    }
  }

  if (command.name === 'ayuda') {
    await reply(sock, msg, [
      'Comandos de canal:',
      '!canalbot estado | on | off',
      '!ay ayuda',
      '!cn lista canales',
      '!ac <enlace|jid> [nombre]',
      '!ca <nombre|jid>',
      '!in 90',
      '!pr <texto>',
      '!po texto1 ; texto2 ; texto3',
      '!pub iniciar → textos/imágenes/videos → !pub fin',
      '!pub cada 2h | activar | pausar | estado',
      '!camp crear Nombre 09:00 | iniciar Nombre | fin | activar Nombre | estado',
      'Foto/video directo: !pr texto opcional',
      '!co estado cola'
      ,'!st iniciar | fin | prueba (prueba: 1 sticker en 1 minuto)'
    ].join('\n'));
    return true;
  }

  if (command.name === 'stickers') {
    return handleStickerCommand({ sock, msg, chatJid, senderJid, command });
  }

  if (command.name === 'publicaciones') {
    return handlePublicationCommand({ sock, msg, chatJid, senderJid, command });
  }

  if (command.name === 'campanas') {
    return handleCampaignCommand({ sock, msg, chatJid, senderJid, args: command.args, reply });
  }

  if (command.name === 'canales') {
    const channels = await listChannels();
    if (!channels.length) {
      await reply(sock, msg, 'No hay canales configurados todavía.');
      return true;
    }
    await reply(sock, msg, channels.map(channel =>
      `${channel.enabled ? '✅' : '⛔'} ${channel.name || channel.content_profile || channel.channel_jid}\n${channel.channel_jid}\nmodo: ${channel.publish_mode}`
    ).join('\n\n'));
    return true;
  }

  if (command.name === 'canal') {
    if (!command.args) {
      const control = await getControlChat(chatJid);
      await reply(sock, msg, control?.active_channel_jid
        ? `Canal activo:\n${control.active_channel_jid}`
        : 'No hay canal activo. Usa: !ca <nombre o jid>');
      return true;
    }
    const channel = await findChannel(command.args);
    if (!channel) {
      await reply(sock, msg, `No encontré canal para: ${command.args}\nUsa !canales para ver opciones.`);
      return true;
    }
    await setControlChatChannel({ chatJid, name: msg.pushName || null, channelJid: channel.channel_jid });
    await reply(sock, msg, `Canal activo configurado:\n${channel.name || channel.channel_jid}\n${channel.channel_jid}`);
    return true;
  }

  if (command.name === 'agregar-canal') {
    if (!command.args) {
      await reply(sock, msg, 'Usa: !ac <enlace de canal o jid> [nombre]');
      return true;
    }

    try {
      const channel = await resolveNewsletterChannel(sock, command.args);
      if (!channel) {
        await reply(sock, msg, 'No pude leer ese canal. Mándame un enlace tipo https://whatsapp.com/channel/... o un JID @newsletter.');
        return true;
      }

      await upsertChannel({
        channelJid: channel.channelJid,
        name: channel.name,
        enabled: true,
        publishMode: 'active',
        contentProfile: channel.name ? channel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) : null
      });
      await setControlChatChannel({ chatJid, name: msg.pushName || null, channelJid: channel.channelJid });
      await logAction({
        actionKey: 'channel_added_from_command',
        mode: 'executed',
        groupJid: chatJid,
        targetUserJid: senderJid,
        messageId: msg.key.id,
        reason: 'user_command_ac',
        details: {
          channelJid: channel.channelJid,
          channelName: channel.name || null
        }
      });
      await reply(sock, msg, [
        'Canal agregado y activado para este grupo.',
        `Nombre: ${channel.name || '(sin nombre)'}`,
        `JID: ${channel.channelJid}`,
        'Nota: el numero del bot debe ser admin del canal para publicar.'
      ].join('\n'));
    } catch (error) {
      logger.warn({ error, args: command.args }, 'failed to add newsletter channel from command');
      await reply(sock, msg, `No pude agregar ese canal: ${error.message || error}`);
    }
    return true;
  }

  if (command.name === 'intervalo') {
    const minutes = Number(command.args);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      await reply(sock, msg, 'Intervalo inválido. Usa minutos entre 5 y 1440. Ejemplo: !in 90');
      return true;
    }
    await setControlChatInterval({ chatJid, name: msg.pushName || null, intervalMinutes: minutes });
    await reply(sock, msg, `Intervalo configurado: ${minutes} minutos entre publicaciones.`);
    return true;
  }

  if (command.name === 'cola') {
    const control = await getControlChat(chatJid);
    const counts = await queueCounts(control?.active_channel_jid || null);
    await reply(sock, msg, [
      `Cola${control?.active_channel_jid ? ` para ${control.active_channel_jid}` : ''}:`,
      `Pendientes: ${counts.queued || 0}`,
      `Publicando: ${counts.publishing || 0}`,
      `Publicadas: ${counts.published || 0}`,
      `Fallidas: ${counts.failed || 0}`,
      `Canceladas: ${counts.cancelled || 0}`
    ].join('\n'));
    return true;
  }

  if (command.name === 'programar-varios') {
    const control = await getControlChat(chatJid);
    if (!control?.active_channel_jid) {
      await reply(sock, msg, 'Primero elige canal: !ca <nombre o jid>');
      return true;
    }

    const phrases = splitBulkPhrases(command.args);
    if (phrases.length < 2) {
      await reply(sock, msg, 'Usa: !po texto1 ; texto2 ; texto3');
      return true;
    }
    if (phrases.length > 30) {
      await reply(sock, msg, 'Demasiadas frases en un solo mensaje. Máximo 30 por tanda.');
      return true;
    }

    const queued = [];
    for (let index = 0; index < phrases.length; index++) {
      const scheduledAt = await nextQueueSchedule({
        channelJid: control.active_channel_jid,
        intervalMinutes: control.interval_minutes || 90
      });
      const queueId = await enqueueChannelPost({
        channelJid: control.active_channel_jid,
        sourceChatJid: chatJid,
        sourceMessageId: `${msg.key.id}:${index + 1}`,
        creatorJid: senderJid,
        contentType: 'text',
        textContent: phrases[index],
        mediaPath: null,
        mimeType: null,
        scheduledAt
      });
      queued.push({ queueId, scheduledAt });
    }

    await logAction({
      actionKey: 'channel_bulk_queue_enqueued',
      mode: 'executed',
      groupJid: chatJid,
      targetUserJid: senderJid,
      messageId: msg.key.id,
      reason: 'user_command_po',
      details: {
        count: queued.length,
        channelJid: control.active_channel_jid,
        firstQueueId: queued[0]?.queueId || null,
        lastQueueId: queued.at(-1)?.queueId || null
      }
    });

    await reply(sock, msg, [
      `Programé ${queued.length} frases en cola.`,
      `Canal: ${control.active_channel_jid}`,
      `Primera: #${queued[0].queueId} ${queued[0].scheduledAt.toISOString()}`,
      `Última: #${queued.at(-1).queueId} ${queued.at(-1).scheduledAt.toISOString()}`,
      `Intervalo actual: ${control.interval_minutes || 90} minutos`
    ].join('\n'));
    return true;
  }

  if (command.name === 'programar') {
    const control = await getControlChat(chatJid);
    if (!control?.active_channel_jid) {
      await reply(sock, msg, 'Primero elige canal: !ca <nombre o jid>');
      return true;
    }

    const info = mediaInfo(msg.message);
    const textContent = command.args || '';
    if (!info && !textContent) {
      await reply(sock, msg, 'Mandame texto o una foto/video con caption: !pr texto');
      return true;
    }

    let mediaPath = null;
    if (info) {
      mediaPath = await downloadQueueMedia({ sock, msg, info });
    }

    const scheduledAt = await nextQueueSchedule({
      channelJid: control.active_channel_jid,
      intervalMinutes: control.interval_minutes || 90
    });
    const queueId = await enqueueChannelPost({
      channelJid: control.active_channel_jid,
      sourceChatJid: chatJid,
      sourceMessageId: msg.key.id,
      creatorJid: senderJid,
      contentType: info?.type || 'text',
      textContent,
      mediaPath,
      mimeType: info?.mimeType || null,
      scheduledAt
    });
    await logAction({
      actionKey: 'channel_queue_enqueued',
      mode: 'executed',
      groupJid: chatJid,
      targetUserJid: senderJid,
      messageId: msg.key.id,
      reason: 'user_command_programar',
      details: {
        queueId,
        channelJid: control.active_channel_jid,
        contentType: info?.type || 'text',
        scheduledAt
      }
    });
    await reply(sock, msg, [
      `Programado en cola #${queueId}.`,
      `Canal: ${control.active_channel_jid}`,
      `Tipo: ${info?.type || 'text'}`,
      `Horario UTC: ${scheduledAt.toISOString()}`,
      `Intervalo actual: ${control.interval_minutes || 90} minutos`
    ].join('\n'));
    return true;
  }

  return false;
}

export async function handleMessagesUpsert({ sock, event }) {
  for (const msg of event.messages || []) {
    if (!msg.message) continue;

    const chatJid = msg.key.remoteJid;
    const senderJid = msg.key.participant || (msg.key.fromMe ? sock.user?.id : msg.key.remoteJid);
    const text = messageText(msg.message);
    const type = messageType(msg.message);

    await upsertUser({ jid: senderJid, displayName: msg.pushName });
    const inserted = await insertMessageEvent({
      messageId: msg.key.id,
      chatJid,
      senderJid,
      messageType: type,
      text,
      hasMedia: hasMedia(msg.message),
      hasLink: false,
      raw: {
        key: msg.key,
        messageTimestamp: msg.messageTimestamp,
        pushName: msg.pushName
      }
    });
    if (!inserted) continue;

    const handledCommand = await handleQueueCommand({ sock, msg, chatJid, senderJid, text });
    if (handledCommand) continue;

    if (await collectStickerIfLearning({ sock, msg, chatJid, senderJid })) continue;

    if (await collectPublicationIfCapturing({ sock, msg, chatJid, senderJid, text })) continue;

    if (await collectCampaignIfCapturing({ sock, msg, chatJid, senderJid, text, isSticker: isStickerMessage, mediaInfo, downloadMedia: downloadQueueMedia })) continue;

    if (isJidNewsletter(chatJid)) {
      await logAction({
        actionKey: 'newsletter_message_seen',
        mode: config.dryRun ? 'dry_run' : 'executed',
        groupJid: chatJid,
        messageId: msg.key.id,
        reason: 'newsletter_event',
        details: { type }
      });
    }
  }
}
