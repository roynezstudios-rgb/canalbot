CREATE TABLE IF NOT EXISTS wa_creator_mention_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  channel_jid VARCHAR(180) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('active','failed') NOT NULL DEFAULT 'active',
  mention_count INT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_publish_at DATETIME NOT NULL,
  queued_at DATETIME NULL,
  last_queue_id BIGINT UNSIGNED NULL,
  last_published_at DATETIME NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_creator_mention_due (enabled, status, next_publish_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE wa_channel_queue
  ADD COLUMN IF NOT EXISTS creator_mention_schedule_id BIGINT UNSIGNED NULL,
  ADD INDEX IF NOT EXISTS idx_wa_channel_queue_creator_mention (creator_mention_schedule_id);
