CREATE TABLE IF NOT EXISTS wa_user_sanctions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  case_id BIGINT UNSIGNED NULL,
  rule_key VARCHAR(120) NOT NULL,
  sanction_level INT UNSIGNED NOT NULL DEFAULT 1,
  action ENUM('observe','warn','delete','mute','kick','ban') NOT NULL DEFAULT 'observe',
  status ENUM('pending','applied','blocked','cancelled','expired') NOT NULL DEFAULT 'pending',
  reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_user_sanctions_user (group_jid, user_jid, created_at),
  INDEX idx_wa_user_sanctions_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_bad_words (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NULL,
  pattern VARCHAR(500) NOT NULL,
  normalized_pattern VARCHAR(500) NULL,
  match_type ENUM('exact','phrase','word_boundary','regex') NOT NULL DEFAULT 'word_boundary',
  severity ENUM('leve','moderada','grave','discriminatoria','sexual_explicita','amenaza') NOT NULL DEFAULT 'leve',
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  exceptions_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_bad_words_scope (group_jid, enabled, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_bad_words_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  message_id VARCHAR(180) NOT NULL,
  bad_word_id BIGINT UNSIGNED NULL,
  case_id BIGINT UNSIGNED NULL,
  severity VARCHAR(80) NOT NULL,
  evidence_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_bad_words_event_once (group_jid, message_id, bad_word_id),
  INDEX idx_wa_bad_words_events_user (group_jid, user_jid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_allowed_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NULL,
  domain VARCHAR(255) NOT NULL,
  include_subdomains TINYINT(1) NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_allowed_domains_scope (group_jid, domain),
  INDEX idx_wa_allowed_domains_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_spam_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  message_id VARCHAR(180) NOT NULL,
  spam_type VARCHAR(80) NOT NULL,
  case_id BIGINT UNSIGNED NULL,
  window_seconds INT UNSIGNED NOT NULL,
  observed_count INT UNSIGNED NOT NULL,
  threshold_count INT UNSIGNED NOT NULL,
  evidence_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_spam_event_once (group_jid, message_id, spam_type),
  INDEX idx_wa_spam_events_user (group_jid, user_jid, created_at),
  INDEX idx_wa_spam_events_type (spam_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
