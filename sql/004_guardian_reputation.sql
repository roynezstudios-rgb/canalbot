CREATE TABLE IF NOT EXISTS wa_user_reputation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  xp INT NOT NULL DEFAULT 0,
  level_key VARCHAR(80) NOT NULL DEFAULT 'nuevo_miembro',
  positive_score INT NOT NULL DEFAULT 0,
  negative_score INT NOT NULL DEFAULT 0,
  last_xp_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_user_reputation_scope (group_jid, user_jid),
  INDEX idx_wa_user_reputation_top (group_jid, xp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_xp_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  source_key VARCHAR(220) NOT NULL,
  points INT NOT NULL,
  reason VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_xp_events_source (group_jid, user_jid, source_key),
  INDEX idx_wa_xp_events_user_date (group_jid, user_jid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
