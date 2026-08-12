import { getPool, logAction } from '../db.js';
import { sendOutboundMessage } from '../core/outboundQueue.js';
import { logger } from '../logger.js';
import { withGlobalPublishGate } from '../queue/globalPublishGate.js';

export async function processStickerStockJobs(sock) {
  const pool = getPool();
  const [settings] = await pool.query(`SELECT * FROM wa_sticker_stock_settings WHERE enabled=1 AND status='running' AND next_run_at <= UTC_TIMESTAMP()`);
  for (const setting of settings) {
    const count = setting.mode === 'block' ? setting.block_size : 1;
    const [assets] = await pool.execute(
      `SELECT asset.id, asset.file_path, asset.mime_type FROM wa_sticker_assets asset
       LEFT JOIN wa_sticker_stock_jobs job ON job.setting_id=:settingId AND job.sticker_asset_id=asset.id
       WHERE asset.learning_id=:learningId AND job.id IS NULL ORDER BY asset.id ASC LIMIT :limit`,
      { settingId: setting.id, learningId: setting.learning_id, limit: count }
    );
    if (!assets.length) {
      await pool.execute(`UPDATE wa_sticker_stock_settings SET enabled=0,status='exhausted',next_run_at=NULL WHERE id=:id`, { id: setting.id });
      continue;
    }
    const now = Date.now();
    for (let i = 0; i < assets.length; i++) {
      await pool.execute(`INSERT INTO wa_sticker_stock_jobs (setting_id,sticker_asset_id,scheduled_at) VALUES (:settingId,:assetId,:scheduledAt)`, {
        settingId: setting.id, assetId: assets[i].id, scheduledAt: new Date(now + i * setting.in_block_delay_seconds * 1000)
      });
    }
    const nextSeconds = setting.mode === 'block' ? setting.block_interval_seconds : setting.individual_interval_seconds;
    await pool.execute(`UPDATE wa_sticker_stock_settings SET next_run_at=:nextRun WHERE id=:id`, { id: setting.id, nextRun: new Date(now + nextSeconds * 1000) });
  }
  const [jobs] = await pool.query(`SELECT job.*, asset.file_path, asset.mime_type, setting.channel_jid FROM wa_sticker_stock_jobs job JOIN wa_sticker_assets asset ON asset.id=job.sticker_asset_id JOIN wa_sticker_stock_settings setting ON setting.id=job.setting_id WHERE job.status='queued' AND job.scheduled_at <= UTC_TIMESTAMP() AND setting.enabled=1 ORDER BY job.scheduled_at ASC LIMIT 5`);
  for (const job of jobs) {
    const gate = await withGlobalPublishGate(async () => {
    const [claim] = await pool.execute(`UPDATE wa_sticker_stock_jobs SET status='sending' WHERE id=:id AND status='queued'`, { id: job.id });
    if (!claim.affectedRows) return false;
    try {
      const result = await sendOutboundMessage(sock, job.channel_jid, { sticker: { url: job.file_path }, mimetype: job.mime_type || 'image/webp' }, { priority: 'sticker_stock' });
      await pool.execute(`UPDATE wa_sticker_stock_jobs SET status='sent',sent_at=UTC_TIMESTAMP(),whatsapp_message_id=:messageId WHERE id=:id`, { id: job.id, messageId: result?.key?.id || null });
    } catch (error) {
      const errorText = String(error?.message || error).slice(0, 1000);
      await pool.execute(`UPDATE wa_sticker_stock_jobs SET status='failed',error_text=:errorText WHERE id=:id`, { id: job.id, errorText });
      await pool.execute(`UPDATE wa_sticker_stock_settings SET enabled=0,status='failed',last_error=:errorText,next_run_at=NULL WHERE id=:id`, { id: job.setting_id, errorText });
      await pool.execute(`UPDATE wa_sticker_stock_jobs SET status='cancelled' WHERE setting_id=:settingId AND status='queued'`, { settingId: job.setting_id });
      await logAction({ actionKey:'sticker_stock_paused_after_failure', mode:'failed', reason:'sticker_send_failed_no_retry', details:{ jobId:job.id, error:errorText } });
      logger.error({ error, jobId: job.id }, 'sticker stock paused after failed send');
    }
    return true;
    });
    if (!gate.acquired) break;
  }
}
