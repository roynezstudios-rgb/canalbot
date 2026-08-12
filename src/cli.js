import { closePool, getPool, listQueue } from './db.js';
import { submitControlCommand, waitForControlResponse } from './core/controlCommands.js';

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

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

function limitArg(value, fallback = 10, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function commandStatus() {
  const pool = getPool();
  const [[session]] = await pool.query(
    `SELECT session_name, status, phone_jid, last_seen_at, updated_at
       FROM wa_sessions
      ORDER BY updated_at DESC
      LIMIT 1`
  );
  const [[messageCount]] = await pool.query('SELECT COUNT(*) AS count FROM wa_messages');
  const [[actionCount]] = await pool.query('SELECT COUNT(*) AS count FROM wa_actions_log');
  const [[groupCount]] = await pool.query('SELECT COUNT(*) AS count FROM wa_groups WHERE enabled = 1');
  const [[channelCount]] = await pool.query('SELECT COUNT(*) AS count FROM wa_channels WHERE enabled = 1');
  const [[queuedCount]] = await pool.query("SELECT COUNT(*) AS count FROM wa_channel_queue WHERE status = 'queued'");

  printJson({
    ok: true,
    session: session || null,
    counts: {
      messages: Number(messageCount?.count || 0),
      actions: Number(actionCount?.count || 0),
      enabledGroups: Number(groupCount?.count || 0),
      enabledChannels: Number(channelCount?.count || 0),
      queuedChannelPosts: Number(queuedCount?.count || 0)
    }
  });
}

async function commandChannels(args) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT channel_jid, name, enabled, publish_mode, content_profile, updated_at
       FROM wa_channels
      ORDER BY updated_at DESC, name ASC`
  );
  printJson({ ok: true, channels: rows });
}

async function commandChannelUpsert(args) {
  if (!args.jid) {
    throw new Error('Missing --jid');
  }
  const mode = args.mode || 'dry_run';
  if (!['off', 'dry_run', 'active'].includes(mode)) {
    throw new Error('--mode must be one of: off, dry_run, active');
  }
  const enabled = args.enabled === false || args.enabled === 'false' || args.enabled === '0' ? 0 : 1;
  const pool = getPool();
  await pool.execute(
    `INSERT INTO wa_channels (channel_jid, name, enabled, publish_mode, content_profile)
     VALUES (:jid, :name, :enabled, :mode, :profile)
     ON DUPLICATE KEY UPDATE
       name = COALESCE(VALUES(name), name),
       enabled = VALUES(enabled),
       publish_mode = VALUES(publish_mode),
       content_profile = COALESCE(VALUES(content_profile), content_profile),
       updated_at = CURRENT_TIMESTAMP`,
    {
      jid: args.jid,
      name: args.name || null,
      enabled,
      mode,
      profile: args.profile || null
    }
  );
  printJson({ ok: true, channel: { jid: args.jid, name: args.name || null, enabled: Boolean(enabled), publishMode: mode } });
}

async function commandRecentMessages(args) {
  const pool = getPool();
  const limit = limitArg(args.limit);
  const [rows] = await pool.query(
    `SELECT received_at, chat_jid, sender_jid, message_type, contains_link, media_kind, text_preview
       FROM wa_messages
      ORDER BY received_at DESC
      LIMIT ?`,
    [limit]
  );
  printJson({ ok: true, messages: rows });
}

async function commandRecentActions(args) {
  const pool = getPool();
  const limit = limitArg(args.limit);
  const [rows] = await pool.query(
    `SELECT created_at, action_key, mode, group_jid, target_user_jid, message_id, reason, details_json
       FROM wa_actions_log
      ORDER BY created_at DESC
      LIMIT ?`,
    [limit]
  );
  printJson({ ok: true, actions: rows });
}

async function commandEndCall(args) {
  const waitSeconds = Number(args.wait || 12);
  const waitMs = Number.isFinite(waitSeconds) && waitSeconds > 0
    ? Math.min(waitSeconds * 1000, 60_000)
    : 12_000;
  const command = await submitControlCommand({
    type: 'end_group_call',
    callId: args['call-id'] || args.callId || 'latest',
    callerJid: args['caller-jid'] || args.callerJid || null,
    groupJid: args['group-jid'] || args.groupJid || null,
    requestedBy: 'cli'
  });
  const response = await waitForControlResponse(command.id, { timeoutMs: waitMs });
  printJson({
    command: {
      id: command.id,
      filePath: command.filePath,
      responsePath: command.responsePath
    },
    response
  });
}

async function commandQueue(args) {
  const limit = limitArg(args.limit, 20);
  const rows = await listQueue({ status: args.status === true ? null : args.status, limit });
  printJson({ ok: true, queue: rows });
}

function usage() {
  return `Usage:
  npm run cli -- status
  npm run cli -- channels
  npm run cli -- channel:upsert --jid <jid> [--name <name>] [--mode off|dry_run|active] [--profile <name>]
  npm run cli -- call:end [--call-id latest|<id>] [--caller-jid <jid>] [--group-jid <jid>] [--wait 12]
  npm run cli -- queue [--status queued] [--limit 20]
  npm run cli -- messages --limit 10
  npm run cli -- actions --limit 10`;
}

async function main() {
  const [command = 'status', ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === 'status') return commandStatus(args);
  if (command === 'channels') return commandChannels(args);
  if (command === 'channel:upsert') return commandChannelUpsert(args);
  if (command === 'call:end') return commandEndCall(args);
  if (command === 'queue') return commandQueue(args);
  if (command === 'messages') return commandRecentMessages(args);
  if (command === 'actions') return commandRecentActions(args);
  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
