CREATE TABLE IF NOT EXISTS wa_publication_capture_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_jid VARCHAR(180) NOT NULL,
  channel_jid VARCHAR(180) NOT NULL,
  creator_jid VARCHAR(180) NULL,
  status ENUM('collecting','closed') NOT NULL DEFAULT 'collecting',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  INDEX idx_wa_publication_capture_open (chat_jid, status),
  INDEX idx_wa_publication_capture_channel (chat_jid, channel_jid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_publication_capture_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  source_message_id VARCHAR(180) NOT NULL,
  sort_order INT UNSIGNED NOT NULL,
  content_type ENUM('text','image','video') NOT NULL,
  text_content TEXT NULL,
  media_path VARCHAR(1000) NULL,
  mime_type VARCHAR(160) NULL,
  status ENUM('pending','scheduled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_publication_capture_source (session_id, source_message_id),
  UNIQUE KEY uq_wa_publication_capture_order (session_id, sort_order),
  INDEX idx_wa_publication_capture_pending (status, session_id, sort_order),
  CONSTRAINT fk_wa_publication_capture_item_session
    FOREIGN KEY (session_id) REFERENCES wa_publication_capture_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_publication_schedule_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_jid VARCHAR(180) NOT NULL,
  channel_jid VARCHAR(180) NOT NULL,
  interval_seconds INT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('paused','running') NOT NULL DEFAULT 'paused',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_publication_schedule_channel (chat_jid, channel_jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
