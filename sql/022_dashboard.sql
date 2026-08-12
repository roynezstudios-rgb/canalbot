ALTER TABLE wa_channels
  ADD COLUMN IF NOT EXISTS admin_confirmed_at DATETIME NULL AFTER content_profile;
