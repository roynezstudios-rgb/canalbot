CREATE TABLE IF NOT EXISTS wa_publish_gate (
  gate_key VARCHAR(80) NOT NULL PRIMARY KEY,
  token CHAR(36) NULL,
  locked_until DATETIME NULL,
  last_released_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO wa_publish_gate (gate_key, token, locked_until)
VALUES ('channel-publication', NULL, NULL);
