CREATE TABLE IF NOT EXISTS wa_message_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  reported_message_id VARCHAR(180) NOT NULL,
  reported_user_jid VARCHAR(180) NULL,
  reporter_jid VARCHAR(180) NOT NULL,
  case_id BIGINT UNSIGNED NULL,
  status ENUM('open','counted','expired','dismissed','actioned') NOT NULL DEFAULT 'open',
  evidence_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_message_reports_once (group_jid, reported_message_id, reporter_jid),
  INDEX idx_wa_message_reports_threshold (group_jid, reported_message_id, status),
  INDEX idx_wa_message_reports_reporter (reporter_jid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_user_mutes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  case_id BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NULL,
  starts_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  attempts_during_mute INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_user_mutes_active (group_jid, user_jid, status, expires_at),
  INDEX idx_wa_user_mutes_expiry (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_community_bans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_jid VARCHAR(180) NOT NULL UNIQUE,
  reason VARCHAR(500) NULL,
  source_group_jid VARCHAR(180) NULL,
  source_case_id BIGINT UNSIGNED NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_community_bans_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
