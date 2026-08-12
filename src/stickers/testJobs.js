import {
  getDueStickerTestJobs,
  logAction,
  markStickerTestFailed,
  markStickerTestSending,
  markStickerTestSent
} from '../db.js';
import { logger } from '../logger.js';
import { sendOutboundMessage } from '../core/outboundQueue.js';
import { withGlobalPublishGate } from '../queue/globalPublishGate.js';

export async function runStickerTestSend(send, { timeoutMs = 45_000 } = {}) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve().then(send),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Sticker test send timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function processDueStickerTestJobs(sock, { limit = 3 } = {}) {
  const jobs = await getDueStickerTestJobs(limit);
  for (const job of jobs) {
    const gate = await withGlobalPublishGate(async () => {
    if (!await markStickerTestSending(job.id)) return false;
    try {
      const result = await runStickerTestSend(
        () => sendOutboundMessage(
          sock,
          job.channel_jid,
          { sticker: { url: job.file_path }, mimetype: job.mime_type || 'image/webp' },
          { priority: 'sticker_test' }
        )
      );
      const whatsappMessageId = result?.key?.id || null;
      await markStickerTestSent({ id: job.id, whatsappMessageId });
      await logAction({
        actionKey: 'sticker_test_sent',
        mode: 'executed',
        groupJid: job.source_chat_jid,
        targetUserJid: job.creator_jid,
        messageId: job.source_message_id,
        reason: 'one_minute_sticker_test',
        details: { jobId: job.id, channelJid: job.channel_jid, whatsappMessageId }
      });
    } catch (error) {
      const errorText = error.message || String(error);
      await markStickerTestFailed({ id: job.id, errorText });
      await logAction({
        actionKey: 'sticker_test_failed',
        mode: 'failed',
        groupJid: job.source_chat_jid,
        targetUserJid: job.creator_jid,
        messageId: job.source_message_id,
        reason: 'one_minute_sticker_test_failed',
        details: { jobId: job.id, channelJid: job.channel_jid, error: errorText }
      });
      logger.error({ error, jobId: job.id, channelJid: job.channel_jid }, 'sticker test failed');
    }
    return true;
    });
    if (!gate.acquired) break;
  }
  return jobs.length;
}
