import { config } from './config.js';
import { getPool, closePool } from './db.js';
import { evaluateLinkGuard } from './rules/linkGuard.js';

async function main() {
  const [rows] = await getPool().query('SELECT VERSION() AS version');
  const sample = evaluateLinkGuard({
    text: 'visita https://spam.example ahora',
    senderIsAdmin: false,
    whitelistDomains: ['deformitos.com', 'datotips.com']
  });

  console.log(JSON.stringify({
    ok: true,
    dryRun: config.dryRun,
    enableConnect: config.enableConnect,
    sessionName: config.sessionName,
    canalbotEnabled: config.canalbot.enabled,
    guardianEnabled: config.guardian.enabled,
    database: config.mysql.database,
    dbVersion: rows[0]?.version,
    linkGuardSample: sample
  }, null, 2));
  await closePool();
}

main().catch(async error => {
  console.error(error);
  await closePool().catch(() => {});
  process.exit(1);
});
