import { config } from './config.js';
import { closePool, logAction } from './db.js';
import { startDashboardServer } from './dashboard/server.js';
import { logger } from './logger.js';
import { updateRuntimeStatus } from './runtime/status.js';
import { startWhatsApp } from './wa/connect.js';

async function recordStartup(details) {
  try {
    await logAction(details);
  } catch (error) {
    logger.warn({ error }, 'database unavailable while recording startup');
  }
}

async function main() {
  logger.info({
    dryRun: config.dryRun,
    enableConnect: config.enableConnect,
    sessionName: config.sessionName,
    dashboardEnabled: config.dashboard.enabled
  }, 'CanalBot starting');

  const dashboardController = config.dashboard.enabled
    ? await startDashboardServer()
    : null;
  let whatsappController = null;

  if (!config.enableConnect) {
    updateRuntimeStatus({ status: 'disabled', qrAvailable: false });
    await recordStartup({
      actionKey: 'startup',
      mode: 'dry_run',
      reason: 'WA_ENABLE_CONNECT=false',
      details: { sessionName: config.sessionName }
    });
    logger.info('WhatsApp connection disabled. Use the safe local command to prepare QR pairing.');
    if (!dashboardController) {
      await closePool();
      return;
    }
  } else {
    whatsappController = await startWhatsApp();
  }

  const keepAlive = setInterval(() => {
    logger.debug('CanalBot keep-alive');
  }, 60_000);

  const shutdown = async signal => {
    logger.info({ signal }, 'shutting down CanalBot');
    clearInterval(keepAlive);
    await whatsappController?.stop?.();
    await dashboardController?.stop?.();
    await closePool();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(async error => {
  logger.error({ error }, 'CanalBot failed');
  updateRuntimeStatus({ status: 'error', lastError: error.message || String(error) });
  await closePool().catch(() => {});
  process.exit(1);
});
