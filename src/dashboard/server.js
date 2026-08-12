import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { config } from '../config.js';
import {
  createCampaign,
  enqueueChannelPost,
  findChannel,
  getActiveControlChat,
  getPool,
  logAction,
  setCampaignStatus,
  setChannelPublishMode,
  upsertChannel
} from '../db.js';
import { confirmChannelAdmin, dashboardSnapshot, getCampaignById } from '../db/dashboard.js';
import { logger } from '../logger.js';
import { getRuntimeSocket, getRuntimeStatus } from '../runtime/status.js';
import { resolveNewsletterChannel } from '../wa/messages.js';

const JSON_LIMIT = 1024 * 1024;

function isLoopback(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(host);
}

function allowedOrigin(origin) {
  if (!origin) return null;
  return config.dashboard.allowedOrigins.includes(origin) ? origin : null;
}

function corsHeaders(req) {
  const origin = allowedOrigin(req.headers.origin);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'Content-Type, X-CanalBot-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  };
}

function sendJson(req, res, status, value) {
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(value));
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('La solicitud supera el tamaño permitido.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req, JSON_LIMIT);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    const error = new Error('El contenido JSON no es válido.');
    error.statusCode = 400;
    throw error;
  }
}

async function readForm(req) {
  const maxBytes = config.canalbot.maxMediaBytes + JSON_LIMIT;
  const body = await readBody(req, maxBytes);
  const request = new Request('http://canalbot.local/api/v1/publications', {
    method: 'POST',
    headers: req.headers,
    body
  });
  return request.formData();
}

function requireLocalAccess(req) {
  if (config.dashboard.accessToken) {
    const supplied = req.headers['x-canalbot-token'];
    if (supplied === config.dashboard.accessToken) return;
    const error = new Error('El token local del dashboard no es válido.');
    error.statusCode = 401;
    throw error;
  }
  if (req.headers.origin && !allowedOrigin(req.headers.origin)) {
    const error = new Error('Origen no autorizado para modificar CanalBot.');
    error.statusCode = 403;
    throw error;
  }
}

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || null;
}

function extensionForMime(mimeType) {
  const known = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm'
  };
  return known[mimeType] || 'bin';
}

export function validateUploadedMedia(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) return null;
  if (!String(file.type).startsWith('image/') && !String(file.type).startsWith('video/')) {
    const error = new Error('El dashboard admite imágenes o videos en esta etapa.');
    error.statusCode = 400;
    throw error;
  }
  if (file.size > config.canalbot.maxMediaBytes) {
    const error = new Error('El archivo supera el límite configurado para CanalBot.');
    error.statusCode = 413;
    throw error;
  }
  return file;
}

export function requireRegisteredChannel(channelJid, channel) {
  if (!channel || channel.channel_jid !== channelJid) {
    const error = new Error('Selecciona un canal registrado.');
    error.statusCode = 400;
    throw error;
  }
  return channel;
}

export function validatePublicationDraft({ channelJid, channel, textContent, file, scheduledRaw, now = () => new Date() }) {
  requireRegisteredChannel(channelJid, channel);
  const mediaFile = validateUploadedMedia(file);
  if (!textContent && !mediaFile) {
    const error = new Error('Agrega texto, una imagen o un video.');
    error.statusCode = 400;
    throw error;
  }
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : now();
  if (Number.isNaN(scheduledAt.getTime())) {
    const error = new Error('La fecha de publicación no es válida.');
    error.statusCode = 400;
    throw error;
  }
  return { mediaFile, scheduledAt };
}

export function requireControlChat(control) {
  if (!control) {
    const error = new Error('Activa primero un grupo de control con !canalbot on.');
    error.statusCode = 409;
    throw error;
  }
  return control;
}

export function validateCampaignSchedule(name, scheduleTime, timezone = 'America/Mexico_City') {
  if (!name || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) {
    const error = new Error('Completa el nombre y una hora válida para la campaña.');
    error.statusCode = 400;
    throw error;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    const error = new Error('Usa una zona horaria IANA válida, por ejemplo America/Mexico_City.');
    error.statusCode = 400;
    throw error;
  }
  return { name, scheduleTime, timezone };
}

async function saveUploadedMedia(file) {
  file = validateUploadedMedia(file);
  if (!file) return null;

  const directory = path.join(config.mediaCacheDir, 'dashboard');
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, `${crypto.randomUUID()}.${extensionForMime(file.type)}`);
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
  return { path: target, mimeType: file.type };
}

async function databaseStatus() {
  try {
    await getPool().query('SELECT 1');
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error.message || String(error) };
  }
}

async function handleStatus(req, res) {
  sendJson(req, res, 200, {
    ok: true,
    runtime: getRuntimeStatus(),
    database: await databaseStatus(),
    safety: {
      dryRun: config.dryRun,
      commandsEnabled: config.canalbot.enabled,
      publishingEnabled: config.canalbot.publishEnabled
    }
  });
}

async function handleQr(req, res) {
  const runtime = getRuntimeStatus();
  if (!runtime.qrAvailable) {
    sendJson(req, res, 404, { ok: false, error: 'No hay un QR pendiente.' });
    return;
  }
  try {
    const image = await fs.readFile(config.qrImagePath);
    res.writeHead(200, {
      ...corsHeaders(req),
      'Content-Type': 'image/png',
      'Content-Length': image.length
    });
    res.end(image);
  } catch {
    sendJson(req, res, 404, { ok: false, error: 'El QR todavía no está listo.' });
  }
}

async function handleAddChannel(req, res) {
  requireLocalAccess(req);
  const input = await readJson(req);
  const reference = String(input.reference || '').trim();
  const name = String(input.name || '').trim();
  if (!reference.startsWith('https://whatsapp.com/channel/') && !reference.endsWith('@newsletter')) {
    const error = new Error('Usa un enlace de canal de WhatsApp o un JID @newsletter.');
    error.statusCode = 400;
    throw error;
  }
  if (!name) {
    const error = new Error('Escribe el nombre con el que se guardará el canal.');
    error.statusCode = 400;
    throw error;
  }
  if (input.adminConfirmed !== true) {
    const error = new Error('Confirma que el número vinculado es administrador del canal.');
    error.statusCode = 400;
    throw error;
  }

  const sock = getRuntimeSocket();
  if (!sock || getRuntimeStatus().status !== 'connected') {
    const error = new Error('Primero vincula el número de WhatsApp desde la pantalla de inicio.');
    error.statusCode = 409;
    throw error;
  }

  const resolved = await resolveNewsletterChannel(sock, `${reference} ${name}`);
  if (!resolved?.channelJid) {
    const error = new Error('No se pudo leer el canal con ese enlace.');
    error.statusCode = 422;
    throw error;
  }

  const publishMode = config.dryRun ? 'dry_run' : 'active';
  await upsertChannel({
    channelJid: resolved.channelJid,
    name,
    enabled: true,
    publishMode,
    contentProfile: slug(name)
  });
  await confirmChannelAdmin(resolved.channelJid);
  const control = await getActiveControlChat();
  await logAction({
    actionKey: 'channel_added_from_dashboard',
    mode: 'executed',
    groupJid: control?.chat_jid || null,
    reason: 'local_dashboard',
    details: { channelJid: resolved.channelJid, channelName: name, adminConfirmed: true }
  });

  sendJson(req, res, 201, {
    ok: true,
    channel: {
      channelJid: resolved.channelJid,
      name,
      publishMode,
      adminConfirmed: true
    },
    commandEquivalent: `!ac ${reference} ${name}`
  });
}

async function handleChannelMode(req, res, channelJid) {
  requireLocalAccess(req);
  const input = await readJson(req);
  const requested = String(input.publishMode || '');
  if (!['off', 'dry_run', 'active'].includes(requested)) {
    const error = new Error('El modo del canal no es válido.');
    error.statusCode = 400;
    throw error;
  }
  if (requested === 'active' && (config.dryRun || !config.canalbot.publishEnabled)) {
    const error = new Error('El modo seguro local impide activar publicaciones reales.');
    error.statusCode = 409;
    throw error;
  }
  const changed = await setChannelPublishMode({ channelJid, publishMode: requested });
  if (!changed) {
    const error = new Error('No se encontró el canal.');
    error.statusCode = 404;
    throw error;
  }
  sendJson(req, res, 200, { ok: true, publishMode: requested });
}

async function handlePublication(req, res) {
  requireLocalAccess(req);
  const form = await readForm(req);
  const channelJid = String(form.get('channelJid') || '').trim();
  const textContent = String(form.get('text') || '').trim();
  const scheduledRaw = String(form.get('scheduledAt') || '').trim();
  const file = form.get('file');
  const channel = await findChannel(channelJid);
  const { scheduledAt } = validatePublicationDraft({
    channelJid,
    channel,
    textContent,
    file,
    scheduledRaw
  });

  const control = await getActiveControlChat();
  const media = await saveUploadedMedia(file);
  const contentType = media
    ? (media.mimeType.startsWith('video/') ? 'video' : 'image')
    : 'text';
  const sourceMessageId = `dashboard:${crypto.randomUUID()}`;
  let queueId;
  try {
    queueId = await enqueueChannelPost({
      channelJid,
      sourceChatJid: control?.chat_jid || 'dashboard@local',
      sourceMessageId,
      creatorJid: null,
      contentType,
      textContent,
      mediaPath: media?.path || null,
      mimeType: media?.mimeType || null,
      scheduledAt
    });
  } catch (error) {
    if (media?.path) await fs.rm(media.path, { force: true }).catch(() => {});
    throw error;
  }
  try {
    await logAction({
      actionKey: 'publication_queued_from_dashboard',
      mode: 'executed',
      groupJid: control?.chat_jid || null,
      messageId: sourceMessageId,
      reason: 'local_dashboard',
      details: { queueId, channelJid, contentType, scheduledAt: scheduledAt.toISOString() }
    });
  } catch (error) {
    logger.warn({ error, queueId, channelJid }, 'dashboard publication queued but audit log failed');
  }
  sendJson(req, res, 201, { ok: true, queueId, contentType, scheduledAt: scheduledAt.toISOString() });
}

async function handleCreateCampaign(req, res) {
  requireLocalAccess(req);
  const input = await readJson(req);
  const name = String(input.name || '').trim();
  const channelJid = String(input.channelJid || '').trim();
  const scheduleTime = String(input.scheduleTime || '').trim();
  const timezone = String(input.timezone || 'America/Mexico_City').trim();
  const control = await getActiveControlChat();
  requireControlChat(control);
  validateCampaignSchedule(name, scheduleTime, timezone);
  const channel = await findChannel(channelJid);
  requireRegisteredChannel(channelJid, channel);
  const campaign = await createCampaign({
    chatJid: control.chat_jid,
    channelJid,
    name,
    scheduleTime,
    timezone
  });
  sendJson(req, res, 201, { ok: true, campaign });
}

async function handleCampaignStatus(req, res, id) {
  requireLocalAccess(req);
  const input = await readJson(req);
  const status = input.status === 'running' ? 'running' : input.status === 'paused' ? 'paused' : null;
  if (!status) {
    const error = new Error('El estado de campaña no es válido.');
    error.statusCode = 400;
    throw error;
  }
  if (status === 'running' && (config.dryRun || !config.canalbot.publishEnabled)) {
    const error = new Error('El modo seguro local impide activar publicaciones reales.');
    error.statusCode = 409;
    throw error;
  }
  const campaign = await getCampaignById(id);
  if (!campaign) {
    const error = new Error('No se encontró la campaña.');
    error.statusCode = 404;
    throw error;
  }
  await setCampaignStatus({ campaignId: id, status });
  sendJson(req, res, 200, { ok: true, status });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/status') return handleStatus(req, res);
  if (req.method === 'GET' && url.pathname === '/api/v1/qr') return handleQr(req, res);
  if (req.method === 'GET' && url.pathname === '/api/v1/dashboard') {
    sendJson(req, res, 200, { ok: true, ...(await dashboardSnapshot()) });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/shutdown') {
    requireLocalAccess(req);
    sendJson(req, res, 202, { ok: true });
    setTimeout(() => process.kill(process.ppid, 'SIGTERM'), 100);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/channels') return handleAddChannel(req, res);
  if (req.method === 'POST' && url.pathname === '/api/v1/publications') return handlePublication(req, res);
  if (req.method === 'POST' && url.pathname === '/api/v1/campaigns') return handleCreateCampaign(req, res);

  const channelMode = url.pathname.match(/^\/api\/v1\/channels\/(.+)\/mode$/);
  if (req.method === 'POST' && channelMode) {
    return handleChannelMode(req, res, decodeURIComponent(channelMode[1]));
  }
  const campaignStatus = url.pathname.match(/^\/api\/v1\/campaigns\/(\d+)\/status$/);
  if (req.method === 'POST' && campaignStatus) {
    return handleCampaignStatus(req, res, Number(campaignStatus[1]));
  }

  sendJson(req, res, 404, { ok: false, error: 'Ruta no encontrada.' });
}

export async function startDashboardServer() {
  if (!isLoopback(config.dashboard.host)) {
    throw new Error('La API de CanalBot sólo puede escuchar en localhost. Usa un túnel o proxy seguro con autenticación y HTTPS.');
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch(error => {
      logger.warn({ error, method: req.method, url: req.url }, 'dashboard request failed');
      if (!res.headersSent) {
        sendJson(req, res, error.statusCode || 500, {
          ok: false,
          error: error.statusCode ? error.message : 'CanalBot no pudo completar esta acción.'
        });
      } else {
        res.end();
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.dashboard.port, config.dashboard.host, resolve);
  });
  logger.info({ host: config.dashboard.host, port: config.dashboard.port }, 'CanalBot local dashboard API ready');

  return {
    async stop() {
      await new Promise(resolve => server.close(resolve));
    }
  };
}
