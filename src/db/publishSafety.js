import crypto from 'node:crypto';
import { getPool } from './pool.js';

const GATE_KEY = 'channel-publication';

export async function claimGlobalPublishGate({ leaseSeconds = 60 } = {}) {
  const token = crypto.randomUUID();
  const [result] = await getPool().execute(
    `UPDATE wa_publish_gate
        SET token=:token,
            locked_until=DATE_ADD(UTC_TIMESTAMP(), INTERVAL :leaseSeconds SECOND)
      WHERE gate_key=:gateKey
        AND (locked_until IS NULL OR locked_until <= UTC_TIMESTAMP())`,
    { token, leaseSeconds: Math.max(10, Number(leaseSeconds) || 60), gateKey: GATE_KEY }
  );
  return result.affectedRows === 1 ? token : null;
}

export async function releaseGlobalPublishGate(token) {
  if (!token) return false;
  const [result] = await getPool().execute(
    `UPDATE wa_publish_gate
        SET token=NULL, locked_until=NULL, last_released_at=UTC_TIMESTAMP()
      WHERE gate_key=:gateKey AND token=:token`,
    { gateKey: GATE_KEY, token }
  );
  return result.affectedRows === 1;
}

export async function recoverInterruptedPublishes() {
  const pool = getPool();
  const [channel] = await pool.execute(
    `UPDATE wa_channel_queue
        SET status='failed', error_text='RECOVERY_REQUIRED: interrupted while publishing; review before retry', updated_at=CURRENT_TIMESTAMP
      WHERE status='publishing'`
  );
  if (channel.affectedRows) {
    // A normal queue has no automatic retry path after an interrupted upload.
    // Pause only the schedules whose own item needs review.
    await pool.query(
      `UPDATE wa_publication_schedule_settings setting
       JOIN wa_channel_queue queue_item
         ON queue_item.source_chat_jid=setting.chat_jid
        AND queue_item.channel_jid=setting.channel_jid
       SET setting.enabled=0, setting.status='paused'
       WHERE queue_item.status='failed'
         AND queue_item.campaign_item_id IS NULL
         AND queue_item.error_text LIKE 'RECOVERY_REQUIRED:%'`
    );
    await pool.query(
      `UPDATE wa_campaign_items item
       JOIN wa_channel_queue queue_item ON queue_item.campaign_item_id=item.id
       JOIN wa_campaigns campaign ON campaign.id=item.campaign_id
       SET item.status='failed', campaign.status='failed',
           campaign.last_error='RECOVERY_REQUIRED: interrupted campaign send'
       WHERE queue_item.status='failed'
         AND queue_item.error_text LIKE 'RECOVERY_REQUIRED:%'`
    );
  }
  const [stickerStock] = await pool.execute(
    `UPDATE wa_sticker_stock_jobs
        SET status='failed', error_text='RECOVERY_REQUIRED: interrupted while sending; stock paused for review'
      WHERE status='sending'`
  );
  if (stickerStock.affectedRows) {
    await pool.query(
      `UPDATE wa_sticker_stock_settings setting
       JOIN wa_sticker_stock_jobs job ON job.setting_id=setting.id
       SET setting.enabled=0, setting.status='failed', setting.next_run_at=NULL,
           setting.last_error='RECOVERY_REQUIRED: interrupted sticker send'
       WHERE job.status='failed' AND job.error_text LIKE 'RECOVERY_REQUIRED:%'`
    );
  }
  const [stickerTests] = await pool.execute(
    `UPDATE wa_sticker_test_jobs
        SET status='failed', error_text='RECOVERY_REQUIRED: interrupted test send; review before retry'
      WHERE status='sending'`
  );
  await pool.execute(
    `UPDATE wa_publish_gate SET token=NULL, locked_until=NULL
      WHERE gate_key=:gateKey AND locked_until <= UTC_TIMESTAMP()`,
    { gateKey: GATE_KEY }
  );
  return {
    channelQueue: channel.affectedRows,
    stickerStock: stickerStock.affectedRows,
    stickerTests: stickerTests.affectedRows
  };
}
