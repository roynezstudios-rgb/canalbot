CREATE TABLE IF NOT EXISTS wa_guardian_activation_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  stage ENUM('observe','delete','mute','kick') NOT NULL DEFAULT 'observe',
  status ENUM('planned','ready','active','blocked','rolled_back','completed') NOT NULL DEFAULT 'planned',
  requested_by_jid VARCHAR(180) NULL,
  approved_by_jid VARCHAR(180) NULL,
  notes VARCHAR(1000) NULL,
  checklist_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_guardian_activation_group (group_jid, status, stage),
  INDEX idx_wa_guardian_activation_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_guardian_activation_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_jid VARCHAR(180) NOT NULL,
  check_key VARCHAR(120) NOT NULL,
  status ENUM('pass','warn','fail') NOT NULL,
  details_json JSON NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_guardian_activation_checks_group (group_jid, checked_at),
  INDEX idx_wa_guardian_activation_checks_status (status, checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
