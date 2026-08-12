CREATE TABLE IF NOT EXISTS wa_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_name VARCHAR(80) NOT NULL UNIQUE,
  status ENUM('created','qr_pending','connected','disconnected','blocked','error') NOT NULL DEFAULT 'created',
  phone_jid VARCHAR(120) NULL,
  phone_label VARCHAR(160) NULL,
  last_error VARCHAR(1000) NULL,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(160) NOT NULL UNIQUE,
  community_jid VARCHAR(160) NULL,
  name VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  bot_is_admin TINYINT(1) NOT NULL DEFAULT 0,
  moderation_mode ENUM('off','observe','soft','active') NOT NULL DEFAULT 'observe',
  open_time TIME NULL,
  close_time TIME NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Mexico_City',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_groups_enabled (enabled),
  INDEX idx_wa_groups_community (community_jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_channels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  channel_jid VARCHAR(180) NOT NULL UNIQUE,
  name VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  publish_mode ENUM('off','dry_run','active') NOT NULL DEFAULT 'dry_run',
  content_profile VARCHAR(80) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_channels_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_control_chats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_jid VARCHAR(180) NOT NULL UNIQUE,
  name VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  active_channel_jid VARCHAR(180) NULL,
  interval_minutes INT UNSIGNED NOT NULL DEFAULT 90,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_control_enabled (enabled),
  INDEX idx_wa_control_channel (active_channel_jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_channel_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  channel_jid VARCHAR(180) NOT NULL,
  source_chat_jid VARCHAR(180) NOT NULL,
  source_message_id VARCHAR(180) NULL,
  creator_jid VARCHAR(180) NULL,
  content_type ENUM('text','image','video','document') NOT NULL DEFAULT 'text',
  text_content TEXT NULL,
  media_path VARCHAR(1000) NULL,
  mime_type VARCHAR(160) NULL,
  status ENUM('queued','publishing','published','failed','cancelled') NOT NULL DEFAULT 'queued',
  scheduled_at DATETIME NOT NULL,
  published_at DATETIME NULL,
  whatsapp_message_id VARCHAR(180) NULL,
  error_text VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_channel_queue_source (source_chat_jid, source_message_id),
  INDEX idx_wa_channel_queue_due (status, scheduled_at),
  INDEX idx_wa_channel_queue_channel_status (channel_jid, status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_jid VARCHAR(160) NOT NULL UNIQUE,
  display_name VARCHAR(255) NULL,
  trust_level ENUM('unknown','new','normal','trusted','admin','blocked') NOT NULL DEFAULT 'unknown',
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_users_trust (trust_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(180) NOT NULL,
  chat_jid VARCHAR(180) NOT NULL,
  sender_jid VARCHAR(180) NULL,
  message_type VARCHAR(60) NULL,
  text_preview VARCHAR(1000) NULL,
  contains_link TINYINT(1) NOT NULL DEFAULT 0,
  media_kind VARCHAR(60) NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_message_chat_id (chat_jid, message_id),
  INDEX idx_wa_messages_chat_received (chat_jid, received_at),
  INDEX idx_wa_messages_sender_received (sender_jid, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  reported_user_jid VARCHAR(180) NOT NULL,
  reporter_jid VARCHAR(180) NOT NULL,
  reason VARCHAR(500) NULL,
  weight DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  status ENUM('open','reviewed','dismissed','actioned') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_reports_user_status (reported_user_jid, status),
  INDEX idx_wa_reports_group_status (group_jid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_strikes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  rule_key VARCHAR(120) NOT NULL,
  points DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  reason VARCHAR(500) NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_strikes_user_group (user_jid, group_jid),
  INDEX idx_wa_strikes_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_key VARCHAR(120) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  action ENUM('observe','warn','delete','strike','review','kick') NOT NULL DEFAULT 'observe',
  config_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_rules_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_media_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(180) NULL,
  chat_jid VARCHAR(180) NULL,
  sender_jid VARCHAR(180) NULL,
  file_path VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(160) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  cleanup_after DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_media_cleanup (cleanup_after, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_actions_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  action_key VARCHAR(120) NOT NULL,
  mode ENUM('dry_run','executed','blocked','failed') NOT NULL DEFAULT 'dry_run',
  group_jid VARCHAR(180) NULL,
  target_user_jid VARCHAR(180) NULL,
  message_id VARCHAR(180) NULL,
  reason VARCHAR(500) NULL,
  details_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_actions_created (created_at),
  INDEX idx_wa_actions_group (group_jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO wa_rules (rule_key, enabled, action, config_json)
VALUES
  ('link_guard', 1, 'observe', JSON_OBJECT(
    'patterns', JSON_ARRAY('http://', 'https://', 'www.'),
    'shorteners', JSON_ARRAY('bit.ly', 'tinyurl.com', 't.co', 'wa.me'),
    'whitelist_domains', JSON_ARRAY('deformitos.com', 'datotips.com'),
    'strike_points', 1
  )),
  ('media_cleanup', 1, 'observe', JSON_OBJECT(
    'retention_hours', 48
  )),
  ('group_schedule', 0, 'observe', JSON_OBJECT(
    'timezone', 'America/Mexico_City'
  ))
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled),
  action = VALUES(action),
  config_json = VALUES(config_json),
  updated_at = CURRENT_TIMESTAMP;
