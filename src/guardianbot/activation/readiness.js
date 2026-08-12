import { config } from '../../config.js';
import {
  createActivationRun,
  getGroupProtectionState,
  getGroupSchedule,
  getGuardianGroupSettings,
  guardianHealthSummary,
  latestActivationRun,
  recordActivationCheck
} from '../../db.js';

export function nextActivationStage(current = 'observe') {
  return {
    observe: 'delete',
    delete: 'mute',
    mute: 'kick',
    kick: 'completed'
  }[current] || 'observe';
}

export function destructiveEnvReady(stage) {
  if (stage === 'observe') return true;
  if (stage === 'delete') return config.guardian.enabled && !config.guardian.observeOnly;
  if (stage === 'mute' || stage === 'kick') {
    return config.guardian.enabled && !config.dryRun && !config.guardian.observeOnly && !config.guardian.dryRun && config.guardian.destructiveActions;
  }
  return false;
}

function check(status, key, details = {}) {
  return { key, status, details };
}

export async function guardianReadiness(groupJid, stage = 'observe') {
  const settings = await getGuardianGroupSettings(groupJid);
  const schedule = await getGroupSchedule(groupJid);
  const protection = await getGroupProtectionState(groupJid);
  const health = await guardianHealthSummary(groupJid);
  const activation = await latestActivationRun(groupJid);

  const checks = [
    check(settings?.enabled ? 'pass' : 'fail', 'guardian_enabled_for_group', { mode: settings?.mode || null }),
    check(config.guardian.enabled ? 'pass' : 'fail', 'guardian_env_enabled', { value: config.guardian.enabled }),
    check(stage === 'observe' || destructiveEnvReady(stage) ? 'pass' : 'fail', 'stage_env_guardrails', {
      stage,
      globalDryRun: config.dryRun,
      dryRun: config.guardian.dryRun,
      observeOnly: config.guardian.observeOnly,
      destructiveActions: config.guardian.destructiveActions
    }),
    check(protection ? 'pass' : 'warn', 'protection_baseline', { captured: Boolean(protection) }),
    check(schedule ? 'pass' : 'warn', 'schedule_configured', { enabled: Boolean(schedule?.enabled) }),
    check(health.openCases === 0 ? 'pass' : 'warn', 'open_cases_reviewed', { openCases: health.openCases }),
    check(health.spam24h < 10 ? 'pass' : 'warn', 'spam_recent_volume', { spam24h: health.spam24h })
  ];

  for (const item of checks) {
    await recordActivationCheck({
      groupJid,
      checkKey: item.key,
      status: item.status,
      details: item.details
    });
  }

  const failed = checks.filter(item => item.status === 'fail');
  const warnings = checks.filter(item => item.status === 'warn');
  return {
    groupJid,
    stage,
    ready: failed.length === 0,
    failed: failed.map(item => item.key),
    warnings: warnings.map(item => item.key),
    checks,
    activation
  };
}

export async function planActivation({ groupJid, stage = 'observe', requestedByJid, notes }) {
  const readiness = await guardianReadiness(groupJid, stage);
  const id = await createActivationRun({
    groupJid,
    stage,
    status: readiness.ready ? 'ready' : 'blocked',
    requestedByJid,
    notes,
    checklist: readiness
  });
  return { id, ...readiness };
}
