import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function summarizeError(error) {
  return {
    name: error?.name,
    message: error?.message,
    code: error?.output?.statusCode ?? error?.statusCode ?? error?.code,
    data: error?.data ?? error?.output?.payload,
    stack: error?.stack
  };
}

async function assertWritableDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  const testFile = path.join(dir, `.write-test-${process.pid}`);
  await fs.writeFile(testFile, 'ok', 'utf8');
  await fs.unlink(testFile);
}

async function saveQrImage(qr, qrPath) {
  await fs.mkdir(path.dirname(qrPath), { recursive: true });
  await QRCode.toFile(qrPath, qr, {
    type: 'png',
    margin: 2,
    width: 1024,
    color: {
      dark: '#111111',
      light: '#ffffff'
    }
  });
}

function log(label, details = {}) {
  console.log(`[DIAGNOSTICO] ${label}`, JSON.stringify({
    at: new Date().toISOString(),
    ...details
  }));
}

function logError(label, details = {}) {
  console.error(`[DIAGNOSTICO] ${label}`, JSON.stringify({
    at: new Date().toISOString(),
    ...details
  }));
}

const args = parseArgs(process.argv.slice(2));
const authDir = path.resolve(args['auth-dir'] || process.env.WA_AUTH_DIR || 'auth/main');
const qrPath = path.resolve(args['qr-path'] || process.env.WA_QR_IMAGE_PATH || 'data/latest-qr.png');
const timeoutSeconds = Number(args.timeout || 1800);
const versionSource = args['version-source'] || 'baileys';

let socketNumber = 0;
let socketCurrent = null;
let reconnectTimer = null;
let lastQrAt = 0;
let totalQr = 0;
let reconnectAttempts = 0;
const maxReconnectAttempts = Number(args['max-reconnects'] || 2);

function scheduleReconnect(ms) {
  if (reconnectTimer) {
    log('reconexion_ignorada_timer_existente');
    return;
  }
  if (reconnectAttempts >= maxReconnectAttempts) {
    logError('reconexion_no_programada_limite_alcanzado', {
      reconnectAttempts,
      maxReconnectAttempts
    });
    return;
  }
  reconnectAttempts += 1;
  log('reconexion_programada', {
    inMs: ms,
    reconnectAttempts,
    maxReconnectAttempts
  });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    start().catch(error => {
      logError('fallo_reconexion', { error: summarizeError(error) });
    });
  }, ms);
}

async function start() {
  if (socketCurrent) {
    log('inicio_ignorado_socket_existente');
    return socketCurrent;
  }

  socketNumber += 1;
  const localSocketNumber = socketNumber;

  await assertWritableDir(authDir);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const baileysVersion = await fetchLatestBaileysVersion();
  const waWebVersion = await fetchLatestWaWebVersion();
  const selectedVersion = versionSource === 'wa-web' ? waWebVersion.version : baileysVersion.version;
  const versionsMatch = JSON.stringify(baileysVersion.version) === JSON.stringify(waWebVersion.version);

  log('entorno', {
    pid: process.pid,
    socketNumber: localSocketNumber,
    node: process.version,
    cwd: process.cwd(),
    authDir,
    qrPath,
    versionSource,
    selectedVersion,
    fetchLatestBaileysVersion: baileysVersion,
    fetchLatestWaWebVersion: waWebVersion,
    versionsMatch,
    registered: state.creds.registered,
    hasMe: Boolean(state.creds.me),
    hasAdvSecretKey: Boolean(state.creds.advSecretKey)
  });

  const sock = makeWASocket({
    auth: state,
    version: selectedVersion,
    browser: Browsers.ubuntu('CanalBot'),
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false,
    qrTimeout: 60_000
  });

  socketCurrent = sock;

  sock.ev.on('creds.update', async update => {
    try {
      await saveCreds();
      log('credenciales_guardadas', {
        registered: update.registered ?? state.creds.registered,
        hasMe: Boolean(update.me ?? state.creds.me)
      });
    } catch (error) {
      logError('error_guardando_credenciales', { error: summarizeError(error) });
    }
  });

  const passkeyLogger = type => node => {
    logError('whatsapp_exige_passkey', {
      type,
      attrs: node?.attrs,
      hasContent: Boolean(node?.content)
    });
  };

  sock.ws?.on?.('CB:notification,type:passkey_prologue_request', passkeyLogger('passkey_prologue_request'));
  sock.ws?.on?.('CB:notification,type:crsc_continuation', passkeyLogger('crsc_continuation'));
  sock.ws?.on?.('CB:iq,,pair-success', node => {
    log('pair_success', {
      attrs: node?.attrs
    });
  });
  sock.ws?.on?.('CB:success', node => {
    log('login_completo', {
      attrs: node?.attrs
    });
  });
  sock.ws?.on?.('CB:stream:error', node => {
    logError('stream_error', {
      attrs: node?.attrs,
      children: Array.isArray(node?.content) ? node.content.map(child => child?.tag) : []
    });
  });
  sock.ws?.on?.('CB:failure', node => {
    logError('failure', {
      attrs: node?.attrs
    });
  });

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr, isNewLogin } = update;
    const now = Date.now();

    if (qr) {
      totalQr += 1;
      const intervalMs = lastQrAt > 0 ? now - lastQrAt : null;
      lastQrAt = now;
      const fingerprint = crypto.createHash('sha256').update(qr).digest('hex').slice(0, 12);
      await saveQrImage(qr, qrPath);
      log('qr_recibido', {
        totalQr,
        fingerprint,
        intervalMs,
        socketNumber: localSocketNumber,
        qrPath
      });
      if (intervalMs !== null && intervalMs < 10_000) {
        logError('alerta_qr_cambia_demasiado_rapido', { intervalMs });
      }
    }

    log('connection_update', {
      connection,
      isNewLogin,
      hasQr: Boolean(qr),
      receivedPendingNotifications: update.receivedPendingNotifications,
      isOnline: update.isOnline,
      socketNumber: localSocketNumber
    });

    if (connection === 'open') {
      log('conexion_abierta_correctamente', { user: sock.user?.id || null });
      return;
    }

    if (connection !== 'close') return;

    const error = lastDisconnect?.error;
    const code = error?.output?.statusCode ?? error?.statusCode ?? error?.code;
    logError('conexion_cerrada', {
      code,
      error: summarizeError(error),
      socketNumber: localSocketNumber
    });

    if (socketCurrent === sock) {
      socketCurrent = null;
    }

    if (code === DisconnectReason.restartRequired) {
      log('codigo_515_reinicio_requerido');
      scheduleReconnect(1500);
    } else if (code === DisconnectReason.loggedOut) {
      logError('codigo_401_logged_out_no_reconectar');
    } else if (code === DisconnectReason.connectionReplaced) {
      logError('codigo_440_connection_replaced_revisar_procesos');
    } else if (code === DisconnectReason.badSession) {
      logError('codigo_500_bad_session');
    } else if (code === DisconnectReason.forbidden) {
      logError('codigo_403_forbidden_detener_reintentos');
    } else if (
      code === DisconnectReason.connectionLost ||
      code === DisconnectReason.connectionClosed ||
      code === DisconnectReason.unavailableService
    ) {
      log('desconexion_recuperable_reconexion_controlada', { code });
      scheduleReconnect(10_000);
    } else {
      logError('codigo_desconocido_o_no_clasificado', { code });
    }
  });

  return sock;
}

const timeout = setTimeout(() => {
  logError('tiempo_agotado', { timeoutSeconds });
  socketCurrent?.end?.();
  process.exit(1);
}, Math.max(30, timeoutSeconds) * 1000);

process.on('uncaughtException', error => {
  logError('uncaughtException', { error: summarizeError(error) });
});

process.on('unhandledRejection', reason => {
  logError('unhandledRejection', {
    error: reason instanceof Error ? summarizeError(reason) : reason
  });
});

start().catch(error => {
  clearTimeout(timeout);
  logError('error_inicial', { error: summarizeError(error) });
  process.exit(1);
});
