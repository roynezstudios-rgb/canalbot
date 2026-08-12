import { getDueQueueItems, logAction, markQueueFailed, markQueuePublished, markQueuePublishing } from '../db.js';
import { logger } from '../logger.js';
import { sendOutboundMessage } from '../core/outboundQueue.js';
import { withGlobalPublishGate } from './globalPublishGate.js';

const NEWSLETTER_READBACK_BLOCK = 'BLOCK_NEWSLETTER_READBACK_UNAVAILABLE';

export function shouldBlockNewsletterMediaWithoutReadback(item) {
  // Baileys newsletter-media patch provides the required raw /m1/ upload path.
  return false;
}

export function queueItemContent(item) {
  if (item.media_path) {
    if (item.content_type === 'image') {
      return { image: { url: item.media_path }, mimetype: item.mime_type || 'image/jpeg', caption: item.text_content || '' };
    }
    if (item.content_type === 'video') {
      return { video: { url: item.media_path }, mimetype: item.mime_type || 'video/mp4', caption: item.text_content || '' };
    }
    return {
      document: { url: item.media_path },
      mimetype: item.mime_type || 'application/octet-stream',
      fileName: item.media_path.split('/').pop(),
      caption: item.text_content || ''
    };
  }

  return { text: item.text_content || '' };
}

export async function processDueChannelQueue(sock, { limit = 1 } = {}) {
  const items = await getDueQueueItems(limit);
  for (const item of items) {
    const gate = await withGlobalPublishGate(async () => {
    const claimed = await markQueuePublishing(item.id);
    if (!claimed) {
      logger.warn({ queueId: item.id, channelJid: item.channel_jid }, 'skipping channel queue item already claimed');
      return false;
    }
    try {
      if (shouldBlockNewsletterMediaWithoutReadback(item)) {
        throw new Error(`${NEWSLETTER_READBACK_BLOCK}: newsletter media posts need readback before automatic publish`);
      }

      const result = await sendOutboundMessage(
        sock,
        item.channel_jid,
        queueItemContent(item),
        { priority: 'channel_publish' }
      );
      const messageId = result?.key?.id || null;
      await markQueuePublished({ id: item.id, whatsappMessageId: messageId });
      await logAction({
        actionKey: 'channel_queue_published',
        mode: 'executed',
        groupJid: item.source_chat_jid,
        targetUserJid: item.creator_jid,
        messageId: item.source_message_id,
        reason: 'scheduled_channel_publish',
        details: {
          queueId: item.id,
          channelJid: item.channel_jid,
          whatsappMessageId: messageId,
          contentType: item.content_type,
          visibility: item.channel_jid.endsWith('@newsletter')
            ? 'send accepted by WhatsApp/Baileys; visual confirmation required for media posts'
            : 'standard chat send'
        }
      });
      logger.info({ queueId: item.id, channelJid: item.channel_jid, messageId }, 'channel queue item published');
    } catch (error) {
      await markQueueFailed({ id: item.id, errorText: error.message || String(error) });
      await logAction({
        actionKey: 'channel_queue_failed',
        mode: 'failed',
        groupJid: item.source_chat_jid,
        targetUserJid: item.creator_jid,
        messageId: item.source_message_id,
        reason: 'scheduled_channel_publish_failed',
        details: {
          queueId: item.id,
          channelJid: item.channel_jid,
          error: error.message || String(error)
        }
      });
      logger.error({ error, queueId: item.id, channelJid: item.channel_jid }, 'failed to publish channel queue item');
    }
    return true;
    });
    if (!gate.acquired) {
      logger.debug({ queueId: item.id }, 'global publication gate busy; leaving channel queue item pending');
      break;
    }
  }
  return items.length;
}
