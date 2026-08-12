ALTER TABLE wa_sticker_learning
  ADD COLUMN IF NOT EXISTS channel_jid VARCHAR(180) NULL AFTER chat_jid,
  ADD INDEX IF NOT EXISTS idx_wa_sticker_learning_channel (chat_jid, channel_jid, status);

UPDATE wa_sticker_learning AS learning
JOIN wa_control_chats AS control ON control.chat_jid = learning.chat_jid AND control.enabled = 1
SET learning.channel_jid = control.active_channel_jid
WHERE learning.channel_jid IS NULL;

ALTER TABLE wa_sticker_stock_settings
  DROP INDEX IF EXISTS uq_wa_sticker_stock_chat,
  ADD UNIQUE INDEX IF NOT EXISTS uq_wa_sticker_stock_chat_channel (chat_jid, channel_jid);
