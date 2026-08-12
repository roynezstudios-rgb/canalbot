ALTER TABLE wa_sessions
  ADD COLUMN IF NOT EXISTS last_error VARCHAR(1000) NULL AFTER phone_label;
