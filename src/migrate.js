import fs from 'node:fs/promises';
import path from 'node:path';
import { getPool, closePool } from './db.js';
import { logger } from './logger.js';

async function main() {
  const sqlDir = path.resolve('sql');
  const files = (await fs.readdir(sqlDir))
    .filter(file => /^\d+_.+\.sql$/.test(file))
    .sort();

  const pool = getPool();
  let statementsCount = 0;
  for (const file of files) {
    const sql = await fs.readFile(path.join(sqlDir, file), 'utf8');
    const statements = sql
      .split(/;\s*(?:\n|$)/)
      .map(s => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await pool.query(statement);
      statementsCount++;
    }
  }
  logger.info({ files, statements: statementsCount }, 'database migration completed');
  await closePool();
}

main().catch(async error => {
  logger.error({ error }, 'database migration failed');
  await closePool().catch(() => {});
  process.exit(1);
});
