CREATE TABLE IF NOT EXISTS wa_sticker_learning (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_jid VARCHAR(180) NOT NULL,
  creator_jid VARCHAR(180) NULL,
  status ENUM('collecting','closed') NOT NULL DEFAULT 'collecting',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_sticker_learning_chat_status (chat_jid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_sticker_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  learning_id BIGINT UNSIGNED NOT NULL,
  source_message_id VARCHAR(180) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(160) NOT NULL DEFAULT 'image/webp',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_sticker_asset_source (learning_id, source_message_id),
  INDEX idx_wa_sticker_assets_learning (learning_id),
  CONSTRAINT fk_wa_sticker_assets_learning
    FOREIGN KEY (learning_id) REFERENCES wa_sticker_learning(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_sticker_test_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  learning_id BIGINT UNSIGNED NOT NULL,
  sticker_asset_id BIGINT UNSIGNED NOT NULL,
  channel_jid VARCHAR(180) NOT NULL,
  source_chat_jid VARCHAR(180) NOT NULL,
  source_message_id VARCHAR(180) NULL,
  creator_jid VARCHAR(180) NULL,
  status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  scheduled_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  whatsapp_message_id VARCHAR(180) NULL,
  error_text VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_sticker_test_due (status, scheduled_at),
  CONSTRAINT fk_wa_sticker_test_learning
    FOREIGN KEY (learning_id) REFERENCES wa_sticker_learning(id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_sticker_test_asset
    FOREIGN KEY (sticker_asset_id) REFERENCES wa_sticker_assets(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
