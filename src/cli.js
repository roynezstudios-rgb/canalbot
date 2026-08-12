import { closePool, getPool, listQueue } from './db.js';

function print(value) { console.log(JSON.stringify(value, null, 2)); }
function limit(value, fallback = 20) { return Math.min(100, Math.max(1, Number(value) || fallback)); }

async function main() {
  const [command = 'status', ...args] = process.argv.slice(2);
  const pool = getPool();
  if (command === 'status') {
    const [[session]] = await pool.query('SELECT session_name, status, phone_jid, last_seen_at FROM wa_sessions ORDER BY updated_at DESC LIMIT 1');
    const [[channels]] = await pool.query('SELECT COUNT(*) AS count FROM wa_channels WHERE enabled=1');
    const [[queued]] = await pool.query("SELECT COUNT(*) AS count FROM wa_channel_queue WHERE status='queued'");
    print({ ok: true, session: session || null, enabledChannels: Number(channels.count), queuedPosts: Number(queued.count) });
  } else if (command === 'channels') {
    const [rows] = await pool.query('SELECT channel_jid, name, enabled, publish_mode, updated_at FROM wa_channels ORDER BY updated_at DESC');
    print({ ok: true, channels: rows });
  } else if (command === 'queue') {
    print({ ok: true, queue: await listQueue({ status: args[0] || null, limit: limit(args[1]) }) });
  } else {
    console.log('Uso: npm run cli -- status | channels | queue [estado] [limite]');
  }
  await closePool();
}

main().catch(async error => { console.error(error.message || error); await closePool().catch(() => {}); process.exit(1); });
