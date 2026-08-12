CREATE TABLE IF NOT EXISTS wa_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_jid VARCHAR(180) NOT NULL,
  channel_jid VARCHAR(180) NOT NULL,
  name VARCHAR(80) NOT NULL,
  schedule_time CHAR(5) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Mexico_City',
  status ENUM('paused','running','waiting','failed') NOT NULL DEFAULT 'paused',
  last_due_date DATE NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_campaign_channel_name (chat_jid, channel_jid, name),
  INDEX idx_wa_campaign_due (status, channel_jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_campaign_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  source_message_id VARCHAR(180) NOT NULL,
  sort_order INT UNSIGNED NOT NULL,
  content_type ENUM('text','image','video') NOT NULL,
  text_content TEXT NULL,
  media_path VARCHAR(1000) NULL,
  mime_type VARCHAR(160) NULL,
  status ENUM('pending','queued','published','failed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  UNIQUE KEY uq_wa_campaign_item_source (campaign_id, source_message_id),
  UNIQUE KEY uq_wa_campaign_item_order (campaign_id, sort_order),
  INDEX idx_wa_campaign_item_pending (campaign_id, status, sort_order),
  CONSTRAINT fk_wa_campaign_item_campaign
    FOREIGN KEY (campaign_id) REFERENCES wa_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_campaign_capture_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  creator_jid VARCHAR(180) NULL,
  status ENUM('collecting','closed') NOT NULL DEFAULT 'collecting',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  INDEX idx_wa_campaign_capture_open (campaign_id, status),
  CONSTRAINT fk_wa_campaign_capture_campaign
    FOREIGN KEY (campaign_id) REFERENCES wa_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE wa_channel_queue
  ADD COLUMN IF NOT EXISTS campaign_item_id BIGINT UNSIGNED NULL,
  ADD INDEX IF NOT EXISTS idx_wa_channel_queue_campaign_item (campaign_item_id);
