import { getPool } from './pool.js';

export async function getGuardianGroupSettings(groupJid) {
  const [rows] = await getPool().execute(
    `SELECT group_jid, enabled, mode, timezone, settings_json
       FROM wa_guardian_settings
      WHERE group_jid = :groupJid
      LIMIT 1`,
    { groupJid }
  );
  const row = rows[0];
  if (!row) return null;
  return {
    groupJid: row.group_jid,
    enabled: Boolean(row.enabled),
    mode: row.mode,
    timezone: row.timezone,
    settings: typeof row.settings_json === 'string' ? JSON.parse(row.settings_json) : row.settings_json
  };
}

export async function upsertGuardianGroupSettings({ groupJid, enabled, mode = 'observe', timezone, settings = {} }) {
  await getPool().execute(
    `INSERT INTO wa_guardian_settings
      (group_jid, enabled, mode, timezone, settings_json)
     VALUES
      (:groupJid, :enabled, :mode, :timezone, :settingsJson)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       mode = VALUES(mode),
       timezone = COALESCE(VALUES(timezone), timezone),
       settings_json = JSON_MERGE_PATCH(settings_json, VALUES(settings_json)),
       updated_at = CURRENT_TIMESTAMP`,
    {
      groupJid,
      enabled: enabled ? 1 : 0,
      mode,
      timezone: timezone || null,
      settingsJson: JSON.stringify(settings)
    }
  );
}
