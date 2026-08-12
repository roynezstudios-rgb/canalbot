CREATE TABLE IF NOT EXISTS wa_group_protection_state (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL UNIQUE,
  subject VARCHAR(255) NULL,
  description_text TEXT NULL,
  announce TINYINT(1) NULL,
  restrict_settings TINYINT(1) NULL,
  invite_code VARCHAR(255) NULL,
  authorized_admins_json JSON NULL,
  baseline_json JSON NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_group_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_time TIME NOT NULL DEFAULT '08:00:00',
  close_time TIME NOT NULL DEFAULT '22:00:00',
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Mexico_City',
  active_days VARCHAR(32) NOT NULL DEFAULT '1,2,3,4,5,6,7',
  open_message VARCHAR(1000) NULL,
  close_message VARCHAR(1000) NULL,
  expected_state ENUM('open','closed','unknown') NOT NULL DEFAULT 'unknown',
  last_close_warning_key VARCHAR(32) NULL,
  last_checked_at DATETIME NULL,
  last_transition_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_group_schedules_enabled (enabled, last_checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_group_admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  actor_jid VARCHAR(180) NULL,
  command_name VARCHAR(80) NULL,
  event_type VARCHAR(120) NOT NULL,
  status ENUM('observed','blocked','executed','failed') NOT NULL DEFAULT 'observed',
  details_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_group_admin_audit_group (group_jid, created_at),
  INDEX idx_wa_group_admin_audit_event (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
