CREATE TABLE IF NOT EXISTS wa_achievements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  achievement_key VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'community',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  config_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_achievements_enabled (enabled, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_user_achievements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  achievement_key VARCHAR(120) NOT NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evidence_json JSON NULL,
  UNIQUE KEY uq_wa_user_achievement_once (group_jid, user_jid, achievement_key),
  INDEX idx_wa_user_achievements_user (group_jid, user_jid, awarded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_missions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mission_key VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  mission_type ENUM('individual','community') NOT NULL DEFAULT 'individual',
  target_count INT UNSIGNED NOT NULL DEFAULT 1,
  xp_reward INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  config_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_missions_enabled (enabled, mission_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_mission_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NULL,
  mission_key VARCHAR(120) NOT NULL,
  progress_count INT UNSIGNED NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  evidence_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_mission_progress_scope (group_jid, user_jid, mission_key),
  INDEX idx_wa_mission_progress_group (group_jid, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_daily_question_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  user_jid VARCHAR(180) NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  answer_text VARCHAR(1000) NOT NULL,
  message_id VARCHAR(180) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_daily_question_answer_once (group_jid, user_jid, question_id),
  INDEX idx_wa_daily_question_answers_group (group_jid, question_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO wa_achievements (achievement_key, name, description, category, enabled, config_json)
VALUES
  ('primer_paso', 'Primer paso', 'Primer aporte valido registrado por GuardianBot.', 'participation', 1, JSON_OBJECT('xp_required', 1)),
  ('participante_constante', 'Participante constante', 'Alcanzo 50 XP en el grupo.', 'participation', 1, JSON_OBJECT('xp_required', 50)),
  ('colaborador_activo', 'Colaborador activo', 'Alcanzo 150 XP en el grupo.', 'collaboration', 1, JSON_OBJECT('xp_required', 150))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  enabled = VALUES(enabled),
  config_json = VALUES(config_json),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO wa_missions (mission_key, name, description, mission_type, target_count, xp_reward, enabled, config_json)
VALUES
  ('participa_5', 'Participa 5 veces', 'Registra 5 mensajes validos sin spam.', 'individual', 5, 5, 1, JSON_OBJECT('event', 'valid_message')),
  ('responde_3', 'Responde 3 veces', 'Responde directamente a otros miembros 3 veces.', 'individual', 3, 6, 1, JSON_OBJECT('event', 'reply_message')),
  ('grupo_sano_1d', 'Dia tranquilo', 'Mantener el grupo sin eventos graves durante el dia.', 'community', 1, 10, 1, JSON_OBJECT('event', 'healthy_day'))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  target_count = VALUES(target_count),
  xp_reward = VALUES(xp_reward),
  enabled = VALUES(enabled),
  config_json = VALUES(config_json),
  updated_at = CURRENT_TIMESTAMP;
