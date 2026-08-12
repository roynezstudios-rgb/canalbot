CREATE TABLE IF NOT EXISTS wa_daily_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  question_text VARCHAR(500) NOT NULL,
  options_json JSON NULL,
  category VARCHAR(120) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  times_used INT UNSIGNED NOT NULL DEFAULT 0,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_daily_questions_active (active, times_used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_daily_question_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  asked_on DATE NOT NULL,
  message_id VARCHAR(180) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_daily_question_history_day (group_jid, asked_on),
  INDEX idx_wa_daily_question_history_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_group_statistics_daily (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  stats_on DATE NOT NULL,
  messages_count INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_count INT UNSIGNED NOT NULL DEFAULT 0,
  stickers_count INT UNSIGNED NOT NULL DEFAULT 0,
  reports_count INT UNSIGNED NOT NULL DEFAULT 0,
  sanctions_count INT UNSIGNED NOT NULL DEFAULT 0,
  stats_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_group_statistics_daily_day (group_jid, stats_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
