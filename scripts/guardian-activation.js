import { closePool } from '../src/db.js';
import { guardianReadiness, nextActivationStage, planActivation } from '../src/guardianbot/activation/readiness.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index++;
    }
  }
  return args;
}

function usage() {
  return `Usage:
  npm run guardian:activation -- readiness --group <group_jid> [--stage observe|delete|mute|kick]
  npm run guardian:activation -- plan --group <group_jid> [--stage observe|delete|mute|kick] [--notes "..."]
  npm run guardian:activation -- next --stage observe|delete|mute|kick`;
}

async function main() {
  const [command = 'readiness', ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === 'next') {
    console.log(JSON.stringify({ ok: true, next: nextActivationStage(args.stage || 'observe') }, null, 2));
    return;
  }
  if (!args.group) throw new Error(`Missing --group\n${usage()}`);
  const stage = args.stage || 'observe';
  const result = command === 'plan'
    ? await planActivation({ groupJid: args.group, stage, notes: args.notes || null })
    : await guardianReadiness(args.group, stage);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
