ALTER TABLE wa_group_schedules
  ADD COLUMN IF NOT EXISTS last_close_warning_key VARCHAR(32) NULL AFTER expected_state;
