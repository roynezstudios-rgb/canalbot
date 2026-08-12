CREATE TABLE IF NOT EXISTS wa_group_magazine_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  magazine_type ENUM('weekly','monthly','mesaniversario') NOT NULL,
  period_key VARCHAR(40) NOT NULL,
  status ENUM('generated','queued','sent','failed','blocked') NOT NULL DEFAULT 'generated',
  content_text TEXT NOT NULL,
  scheduled_at DATETIME NULL,
  sent_at DATETIME NULL,
  whatsapp_message_id VARCHAR(180) NULL,
  error_text VARCHAR(1000) NULL,
  stats_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_group_magazine_run_once (group_jid, magazine_type, period_key),
  INDEX idx_wa_group_magazine_runs_due (status, scheduled_at),
  INDEX idx_wa_group_magazine_runs_group (group_jid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_group_magazine_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  cache_key VARCHAR(120) NOT NULL,
  content_text TEXT NOT NULL,
  stats_json JSON NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_group_magazine_cache_key (group_jid, cache_key),
  INDEX idx_wa_group_magazine_cache_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
