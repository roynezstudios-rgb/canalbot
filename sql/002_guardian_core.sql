CREATE TABLE IF NOT EXISTS wa_guardian_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  mode ENUM('off','observe','soft','active') NOT NULL DEFAULT 'observe',
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Mexico_City',
  settings_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_guardian_settings_enabled (enabled, mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_moderation_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NULL,
  reporter_jid VARCHAR(180) NULL,
  source_message_id VARCHAR(180) NULL,
  rule_key VARCHAR(120) NOT NULL,
  severity ENUM('info','low','medium','high','critical') NOT NULL DEFAULT 'low',
  status ENUM('open','reviewing','closed','dismissed') NOT NULL DEFAULT 'open',
  action_taken VARCHAR(120) NOT NULL DEFAULT 'observe',
  evidence_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_moderation_cases_group_status (group_jid, status, created_at),
  INDEX idx_wa_moderation_cases_user (user_jid, group_jid, created_at),
  INDEX idx_wa_moderation_cases_rule (rule_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_command_cooldowns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  command_name VARCHAR(80) NOT NULL,
  window_started_at DATETIME NOT NULL,
  count_used INT UNSIGNED NOT NULL DEFAULT 0,
  last_notice_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_command_cooldown_scope (group_jid, user_jid, command_name),
  INDEX idx_wa_command_cooldowns_window (window_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_outbound_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  target_jid VARCHAR(180) NOT NULL,
  source_module ENUM('canalbot','guardianbot','core') NOT NULL DEFAULT 'core',
  priority TINYINT UNSIGNED NOT NULL DEFAULT 5,
  payload_json JSON NOT NULL,
  status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  whatsapp_message_id VARCHAR(180) NULL,
  error_text VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_outbound_queue_due (status, scheduled_at, priority),
  INDEX idx_wa_outbound_queue_target (target_jid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
