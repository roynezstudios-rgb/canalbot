CREATE TABLE IF NOT EXISTS wa_sticker_stock_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_jid VARCHAR(180) NOT NULL,
  learning_id BIGINT UNSIGNED NOT NULL,
  channel_jid VARCHAR(180) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  mode ENUM('individual','block') NOT NULL DEFAULT 'individual',
  individual_interval_seconds INT UNSIGNED NOT NULL DEFAULT 3600,
  block_size TINYINT UNSIGNED NOT NULL DEFAULT 5,
  in_block_delay_seconds INT UNSIGNED NOT NULL DEFAULT 15,
  block_interval_seconds INT UNSIGNED NOT NULL DEFAULT 3600,
  next_run_at DATETIME NULL,
  status ENUM('paused','running','exhausted','failed') NOT NULL DEFAULT 'paused',
  last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_sticker_stock_chat (chat_jid),
  CONSTRAINT fk_wa_sticker_stock_learning
    FOREIGN KEY (learning_id) REFERENCES wa_sticker_learning(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_sticker_stock_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  setting_id BIGINT UNSIGNED NOT NULL,
  sticker_asset_id BIGINT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  sent_at DATETIME NULL,
  whatsapp_message_id VARCHAR(180) NULL,
  error_text VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_sticker_stock_asset (setting_id, sticker_asset_id),
  INDEX idx_wa_sticker_stock_due (status, scheduled_at),
  CONSTRAINT fk_wa_sticker_stock_job_setting
    FOREIGN KEY (setting_id) REFERENCES wa_sticker_stock_settings(id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_sticker_stock_job_asset
    FOREIGN KEY (sticker_asset_id) REFERENCES wa_sticker_assets(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
