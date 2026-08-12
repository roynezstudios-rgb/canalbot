import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';
import { logAction, upsertSession } from '../db.js';
import { logger } from '../logger.js';
import { processDueChannelQueue } from '../queue/channelQueue.js';
import { handleMessagesUpsert } from './messages.js';
import { processDueStickerTestJobs } from '../stickers/testJobs.js';
import { processStickerStockJobs } from '../stickers/stockJobs.js';
import { recoverInterruptedPublishes } from '../db/publishSafety.js';
import { processDueCampaigns } from '../campaigns/jobs.js';
import { processDueCreatorMentions } from '../creatorMention/jobs.js';
import { setRuntimeSocket, updateRuntimeStatus } from '../runtime/status.js';

function disconnectStatusCode(lastDisconnect) {
  return lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
}

async function saveQrImage(qr) {
  await fs.mkdir(path.dirname(config.qrImagePath), { recursive: true });
  await QRCode.toFile(config.qrImagePath, qr, {
    type: 'png',
    margin: 2,
    width: 1024,
    color: {
      dark: '#111111',
      light: '#ffffff'
    }
  });
  return config.qrImagePath;
}

export async function startWhatsApp() {
  updateRuntimeStatus({ status: 'connecting', qrAvailable: false, lastError: null });
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  const waLogger = pino({ level: config.logLevel === 'debug' ? 'debug' : 'silent' });
  let stopped = false;
  let reconnectController = null;
  let queueTimer = null;
  let stickerTestTimer = null;
  let stickerStockTimer = null;
  let campaignTimer = null;
  let creatorMentionTimer = null;

  logger.info({
    sessionName: config.sessionName,
    authDir: config.authDir,
    version,
    isLatest,
    dryRun: config.dryRun
  }, 'starting baileys socket');

  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.ubuntu('Desktop'),
    logger: waLogger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false
  });
  setRuntimeSocket(sock);

  sock.ev.on('creds.update', saveCreds);

  let pairingCodeRequested = false;

  async function requestPairingCodeWhenReady() {
    if (pairingCodeRequested || sock.authState.creds.registered || !config.pairingPhone) {
      return;
    }

    pairingCodeRequested = true;
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.pairingPhone);
        logger.info({ code, pairingPhone: config.pairingPhone }, 'codigo de vinculacion de WhatsApp generado');
      } catch (error) {
        pairingCodeRequested = false;
        logger.error({ error }, 'failed to request WhatsApp pairing code');
      }
    }, 3000);
  }

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('QR recibido. Escanea este codigo con WhatsApp > Dispositivos vinculados.');
      qrcode.generate(qr, { small: true });
      const qrImagePath = await saveQrImage(qr);
      updateRuntimeStatus({
        status: 'qr_pending',
        qrAvailable: true,
        qrUpdatedAt: new Date().toISOString(),
        phoneJid: null,
        lastError: null
      });
      try {
        await logAction({
          actionKey: 'qr_generated',
          mode: 'dry_run',
          reason: 'waiting_for_whatsapp_pairing',
          details: { sessionName: config.sessionName, qrImagePath }
        });
      } catch (error) {
        logger.warn({ error }, 'database unavailable while recording QR generation');
      }
      logger.info({ qrImagePath }, 'imagen QR de vinculacion guardada');
    }

    if (connection === 'open') {
      const phoneJid = sock.user?.id || null;
      updateRuntimeStatus({
        status: 'connected',
        qrAvailable: false,
        phoneJid,
        lastError: null
      });
      try {
        await upsertSession({ sessionName: config.sessionName, status: 'connected', phoneJid });
        await logAction({
          actionKey: 'session_connected',
          mode: config.dryRun ? 'dry_run' : 'executed',
          reason: 'baileys_connection_open',
          details: { sessionName: config.sessionName, phoneJid }
        });
      } catch (error) {
        logger.warn({ error }, 'database unavailable while recording WhatsApp connection');
      }
      logger.info({ phoneJid }, 'whatsapp session connected');
      const automationEnabled = config.canalbot.enabled && config.canalbot.publishEnabled && !config.dryRun;
      if (automationEnabled) {
        try {
          const recovered = await recoverInterruptedPublishes();
          if (recovered.channelQueue || recovered.stickerStock || recovered.stickerTests) {
            logger.warn({ recovered }, 'interrupted publication jobs moved to review-required state');
          }
        } catch (error) {
          logger.error({ error }, 'failed recovering interrupted publication jobs');
        }
      }
      if (automationEnabled && !queueTimer) {
        queueTimer = setInterval(() => {
          processDueChannelQueue(sock).catch(error => {
            logger.error({ error }, 'failed processing WhatsApp channel queue');
          });
        }, 60_000);
        processDueChannelQueue(sock).catch(error => {
          logger.error({ error }, 'failed processing WhatsApp channel queue');
        });
      }
      if (automationEnabled && !stickerTestTimer) {
        stickerTestTimer = setInterval(() => {
          processDueStickerTestJobs(sock).catch(error => {
            logger.error({ error }, 'failed processing sticker test jobs');
          });
        }, 5_000);
        processDueStickerTestJobs(sock).catch(error => {
          logger.error({ error }, 'failed processing sticker test jobs');
        });
      }
      if (automationEnabled && !stickerStockTimer) {
        stickerStockTimer = setInterval(() => processStickerStockJobs(sock).catch(error => logger.error({ error }, 'failed processing sticker stock')), 5_000);
        processStickerStockJobs(sock).catch(error => logger.error({ error }, 'failed processing sticker stock'));
      }
      if (automationEnabled && !campaignTimer) {
        campaignTimer = setInterval(() => processDueCampaigns().catch(error => logger.error({ error }, 'failed processing campaigns')), 60_000);
        processDueCampaigns().catch(error => logger.error({ error }, 'failed processing campaigns'));
      }
      if (automationEnabled && !creatorMentionTimer) {
        creatorMentionTimer = setInterval(() => processDueCreatorMentions().catch(error => logger.error({ error }, 'failed processing creator mentions')), 60_000);
        processDueCreatorMentions().catch(error => logger.error({ error }, 'failed processing creator mentions'));
      }
    }

    if (connection === 'connecting') {
      updateRuntimeStatus({ status: 'connecting', lastError: null });
      await requestPairingCodeWhenReady();
    }

    if (connection === 'close') {
      const statusCode = disconnectStatusCode(lastDisconnect);
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const lastError = lastDisconnect?.error?.message || `status ${statusCode || 'unknown'}`;
      updateRuntimeStatus({
        status: loggedOut ? 'logged_out' : 'disconnected',
        qrAvailable: false,
        lastError
      });
      try {
        await upsertSession({
          sessionName: config.sessionName,
          status: loggedOut ? 'logged_out' : 'disconnected',
          lastError
        });
      } catch (error) {
        logger.warn({ error }, 'database unavailable while recording WhatsApp disconnect');
      }
      logger.warn({ statusCode, loggedOut }, 'whatsapp connection closed');

      if (!stopped && !loggedOut) {
        logger.info({ statusCode }, 'restarting WhatsApp socket after recoverable close');
        setTimeout(() => {
          startWhatsApp()
            .then(controller => {
              reconnectController = controller;
            })
            .catch(error => {
              logger.error({ error }, 'failed to restart WhatsApp socket');
            });
        }, 3000);
      }
    }
  });

  await requestPairingCodeWhenReady();

  if (config.canalbot.enabled && !config.dryRun) {
    sock.ev.on('messages.upsert', event => {
      handleMessagesUpsert({ sock, event }).catch(error => {
        logger.error({ error }, 'failed to process messages.upsert');
      });
    });
  } else {
    logger.info({ dryRun: config.dryRun, canalbotEnabled: config.canalbot.enabled }, 'incoming commands disabled for safe local pairing');
  }

  return {
    sock,
    async stop() {
      stopped = true;
      if (queueTimer) clearInterval(queueTimer);
      if (stickerTestTimer) clearInterval(stickerTestTimer);
      if (stickerStockTimer) clearInterval(stickerStockTimer);
      if (campaignTimer) clearInterval(campaignTimer);
      if (creatorMentionTimer) clearInterval(creatorMentionTimer);
      await reconnectController?.stop?.();
      setRuntimeSocket(null);
      updateRuntimeStatus({ status: 'stopped', qrAvailable: false });
      sock.end?.();
    }
  };
}
