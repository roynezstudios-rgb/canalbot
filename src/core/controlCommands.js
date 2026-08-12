import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../logger.js';
import { endGroupCallByCode, recentGroupCallSnapshot } from '../guardianbot/moderation/groupCalls.js';

const CONTROL_DIR = path.resolve('data/control');
const INBOX_DIR = path.join(CONTROL_DIR, 'inbox');
const PROCESSING_DIR = path.join(CONTROL_DIR, 'processing');
const PROCESSED_DIR = path.join(CONTROL_DIR, 'processed');
const FAILED_DIR = path.join(CONTROL_DIR, 'failed');

function commandId() {
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

async function ensureControlDirs() {
  await Promise.all([
    fs.mkdir(INBOX_DIR, { recursive: true }),
    fs.mkdir(PROCESSING_DIR, { recursive: true }),
    fs.mkdir(PROCESSED_DIR, { recursive: true }),
    fs.mkdir(FAILED_DIR, { recursive: true })
  ]);
}

function responsePath(id) {
  return path.join(PROCESSED_DIR, `${id}.response.json`);
}

export async function submitControlCommand(command) {
  await ensureControlDirs();
  const id = command.id || commandId();
  const filePath = path.join(INBOX_DIR, `${id}.json`);
  const tmpPath = `${filePath}.tmp`;
  const payload = {
    ...command,
    id,
    createdAt: new Date().toISOString()
  };

  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
  return { id, filePath, responsePath: responsePath(id) };
}

export async function waitForControlResponse(id, { timeoutMs = 10_000, intervalMs = 500 } = {}) {
  const startedAt = Date.now();
  const targetPath = responsePath(id);
  const failedPath = path.join(FAILED_DIR, `${id}.response.json`);

  while (Date.now() - startedAt < timeoutMs) {
    for (const candidate of [targetPath, failedPath]) {
      try {
        const raw = await fs.readFile(candidate, 'utf8');
        return JSON.parse(raw);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return {
    ok: false,
    id,
    reason: 'timeout_waiting_for_service',
    message: 'El comando fue escrito, pero el servicio no respondió dentro del tiempo esperado.'
  };
}

async function writeResponse(id, response, failed = false) {
  await ensureControlDirs();
  const dir = failed ? FAILED_DIR : PROCESSED_DIR;
  const targetPath = path.join(dir, `${id}.response.json`);
  await fs.writeFile(targetPath, `${JSON.stringify(response, null, 2)}\n`, 'utf8');
}

async function processCommandFile(sock, fileName) {
  const inboxPath = path.join(INBOX_DIR, fileName);
  const processingPath = path.join(PROCESSING_DIR, fileName);
  let command = null;

  try {
    await fs.rename(inboxPath, processingPath);
    command = JSON.parse(await fs.readFile(processingPath, 'utf8'));

    if (command.type !== 'end_group_call') {
      throw new Error(`Unsupported control command type: ${command.type}`);
    }

    const result = await endGroupCallByCode({
      sock,
      callId: command.callId || 'latest',
      callerJid: command.callerJid || null,
      groupJid: command.groupJid || null,
      requestedBy: command.requestedBy || 'cli'
    });
    const response = {
      ok: result.ok,
      id: command.id,
      type: command.type,
      processedAt: new Date().toISOString(),
      result,
      recentGroupCalls: recentGroupCallSnapshot()
    };
    await writeResponse(command.id, response, !result.ok);
    await fs.rename(processingPath, path.join(PROCESSED_DIR, `${command.id}.command.json`));
  } catch (error) {
    const id = command?.id || fileName.replace(/\.json$/, '');
    const response = {
      ok: false,
      id,
      processedAt: new Date().toISOString(),
      reason: 'control_command_failed',
      error: error.message || String(error)
    };
    await writeResponse(id, response, true).catch(writeError => {
      logger.error({ writeError, response }, 'failed writing control command error response');
    });
    await fs.rename(processingPath, path.join(FAILED_DIR, `${id}.command.json`)).catch(() => {});
    logger.error({ error, fileName }, 'failed processing control command');
  }
}

export async function processControlCommands(sock) {
  await ensureControlDirs();
  const files = (await fs.readdir(INBOX_DIR))
    .filter(fileName => fileName.endsWith('.json'))
    .sort();

  for (const fileName of files) {
    await processCommandFile(sock, fileName);
  }
}

export function startControlCommandProcessor(sock, { intervalMs = 1500 } = {}) {
  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      await processControlCommands(sock);
    } catch (error) {
      logger.error({ error }, 'failed polling control commands');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  tick();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}
