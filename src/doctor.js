import { config } from './config.js';
import { getPool, closePool } from './db.js';

async function main() {
  const [rows] = await getPool().query('SELECT VERSION() AS version');
  console.log(JSON.stringify({
    ok: true,
    dryRun: config.dryRun,
    enableConnect: config.enableConnect,
    sessionName: config.sessionName,
    canalbotEnabled: config.canalbot.enabled,
    database: config.mysql.database,
    dbVersion: rows[0]?.version
  }, null, 2));
  await closePool();
}

main().catch(async error => {
  console.error(error);
  await closePool().catch(() => {});
  process.exit(1);
});
