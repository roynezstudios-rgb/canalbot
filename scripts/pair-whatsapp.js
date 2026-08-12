import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcode from 'qrcode-terminal';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
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

function usage() {
  return `Uso:
  npm run pair:qr
  npm run pair:code -- --phone 5215551234567

Opciones:
  --auth-dir <ruta>   Carpeta de sesion. Default: WA_AUTH_DIR o auth/main
  --qr-path <ruta>    Imagen QR. Default: WA_QR_IMAGE_PATH o data/latest-qr.png
  --timeout <seg>     Tiempo maximo. Default: 180
`;
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

function disconnectStatusCode(lastDisconnect) {
  return lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args._[0] || 'qr';
  if (!['qr', 'code', 'help'].includes(mode)) {
    throw new Error(`Modo invalido: ${mode}\n${usage()}`);
  }
  if (mode === 'help') {
    console.log(usage());
    return;
  }

  const authDir = path.resolve(args['auth-dir'] || process.env.WA_AUTH_DIR || 'auth/main');
  const qrPath = path.resolve(args['qr-path'] || process.env.WA_QR_IMAGE_PATH || 'data/latest-qr.png');
  const phone = String(args.phone || process.env.WA_PAIRING_PHONE || '').replace(/\D/g, '');
  const timeoutSeconds = Number(args.timeout || 180);

  if (mode === 'code' && !phone) {
    throw new Error('Falta --phone con codigo de pais y numero, solo digitos.');
  }

  await fs.mkdir(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });
  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.ubuntu('Desktop'),
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false
  });

  let pairingRequested = false;
  let finished = false;

  function finish(code = 0) {
    if (finished) return;
    finished = true;
    sock.end?.();
    process.exit(code);
  }

  const timeout = setTimeout(() => {
    console.error(`Tiempo agotado (${timeoutSeconds}s). Vuelve a ejecutar el comando de vinculacion.`);
    finish(1);
  }, Math.max(30, timeoutSeconds) * 1000);

  async function requestPairingCode() {
    if (pairingRequested || sock.authState.creds.registered || mode !== 'code') return;
    pairingRequested = true;
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phone);
        console.log('');
        console.log('Codigo de vinculacion de WhatsApp:');
        console.log(code);
        console.log('');
        console.log('En el telefono: WhatsApp > Dispositivos vinculados > Vincular con numero de telefono.');
      } catch (error) {
        pairingRequested = false;
        console.error(`No se pudo generar el codigo: ${error.message || error}`);
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && mode === 'qr') {
      console.log('');
      console.log('Escanea este QR con WhatsApp > Dispositivos vinculados:');
      qrcode.generate(qr, { small: true });
      await saveQrImage(qr, qrPath);
      console.log(`Imagen QR guardada en: ${qrPath}`);
    }

    if (connection === 'connecting') {
      await requestPairingCode();
    }

    if (connection === 'open') {
      clearTimeout(timeout);
      console.log('');
      console.log(`WhatsApp vinculado correctamente: ${sock.user?.id || 'sesion conectada'}`);
      console.log(`Sesion guardada en: ${authDir}`);
      finish(0);
    }

    if (connection === 'close') {
      const statusCode = disconnectStatusCode(lastDisconnect);
      if (statusCode === DisconnectReason.loggedOut) {
        clearTimeout(timeout);
        console.error('WhatsApp cerro la sesion. Borra auth/main solo si quieres vincular desde cero.');
        finish(1);
      }
    }
  });

  await requestPairingCode();
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
