import { config } from '../config.js';
import { enqueueChannelPost } from '../db/channels.js';
import {
  claimDueCreatorMentionSchedules,
  ensureCreatorMentionSchedules,
  markCreatorMentionFailed,
  setCreatorMentionQueued
} from '../db/creatorMentions.js';
import { logAction } from '../db/core.js';
import { creatorMentionMessage } from './policy.js';
import { logger } from '../logger.js';

const CREATOR_MENTION_SOURCE_CHAT = 'canalbot:creator-mention';

export function creatorMentionSourceMessageId(schedule) {
  return `creator-mention:${schedule.id}:${Number(schedule.mention_count) + 1}`;
}

export async function processDueCreatorMentions() {
  if (!config.canalbot.creatorMentionsEnabled) return 0;
  await ensureCreatorMentionSchedules();
  const schedules = await claimDueCreatorMentionSchedules();
  for (const schedule of schedules) {
    try {
      const queueId = await enqueueChannelPost({
        channelJid: schedule.channel_jid,
        sourceChatJid: CREATOR_MENTION_SOURCE_CHAT,
        sourceMessageId: creatorMentionSourceMessageId(schedule),
        creatorJid: null,
        contentType: 'text',
        textContent: creatorMentionMessage(config.canalbot.creatorMentionChannelUrl),
        mediaPath: null,
        mimeType: null,
        scheduledAt: new Date(),
        creatorMentionScheduleId: schedule.id
      });
      await setCreatorMentionQueued({ scheduleId: schedule.id, queueId });
      await logAction({
        actionKey: 'creator_mention_queued',
        mode: 'executed',
        reason: 'creator_attribution_due',
        details: { scheduleId: schedule.id, queueId, channelJid: schedule.channel_jid }
      });
    } catch (error) {
      const errorText = error.message || String(error);
      await markCreatorMentionFailed({ scheduleId: schedule.id, errorText });
      logger.error({ error, scheduleId: schedule.id }, 'failed to queue creator mention; schedule paused');
    }
  }
  return schedules.length;
}
