import { config } from './config.js';
import { logger } from './logger.js';
import { closePool, logAction } from './db.js';
import { startWhatsApp } from './wa/connect.js';

async function main() {
  logger.info({
    dryRun: config.dryRun,
    enableConnect: config.enableConnect,
    sessionName: config.sessionName
  }, 'CanalBot starting');

  if (!config.enableConnect) {
    await logAction({
      actionKey: 'startup',
      mode: 'dry_run',
      reason: 'WA_ENABLE_CONNECT=false',
      details: { sessionName: config.sessionName }
    });
    logger.info('WhatsApp connection disabled. Set WA_ENABLE_CONNECT=true only after Roy authorizes QR/code pairing.');
    await closePool();
    return;
  }

  const controller = await startWhatsApp();
  const keepAlive = setInterval(() => {
    logger.debug('CanalBot keep-alive');
  }, 60_000);

  const shutdown = async signal => {
    logger.info({ signal }, 'shutting down CanalBot');
    clearInterval(keepAlive);
    await controller.stop();
    await closePool();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(async error => {
  logger.error({ error }, 'CanalBot failed');
  await closePool().catch(() => {});
  process.exit(1);
});
