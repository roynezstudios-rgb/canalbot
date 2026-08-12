import { config } from '../config.js';

export function guardianModeFromSettings(settings) {
  if (!config.guardian.enabled) return 'off';
  if (config.guardian.observeOnly || config.guardian.dryRun || !config.guardian.destructiveActions) {
    return 'observe';
  }
  return settings?.mode || 'observe';
}
