import { getPool } from './pool.js';

function number(value) {
  return Number(value || 0);
}

export async function dashboardSnapshot() {
  const pool = getPool();
  const [
    [sessions],
    [summaryRows],
    [channels],
    [campaigns],
    [queue],
    [actions],
    [controlChats]
  ] = await Promise.all([
    pool.query(
      `SELECT session_name, phone_jid, status, last_error, last_seen_at, updated_at
         FROM wa_sessions ORDER BY updated_at DESC LIMIT 1`
    ),
    pool.query(
      `SELECT
         SUM(status='published') AS published_count,
         SUM(status='queued') AS queued_count,
         SUM(status='failed') AS failed_count,
         MIN(CASE WHEN status='queued' THEN scheduled_at END) AS next_scheduled_at
       FROM wa_channel_queue`
    ),
    pool.query(
      `SELECT channel.channel_jid, channel.name, channel.enabled, channel.publish_mode,
              channel.content_profile, channel.admin_confirmed_at, channel.updated_at,
              SUM(queue.status='queued') AS queued_count,
              SUM(queue.status='published') AS published_count,
              SUM(queue.status='failed') AS failed_count
         FROM wa_channels channel
         LEFT JOIN wa_channel_queue queue ON queue.channel_jid=channel.channel_jid
        GROUP BY channel.channel_jid, channel.name, channel.enabled, channel.publish_mode,
                 channel.content_profile, channel.admin_confirmed_at, channel.updated_at
        ORDER BY channel.enabled DESC, channel.name ASC, channel.updated_at DESC`
    ),
    pool.query(
      `SELECT campaign.id, campaign.chat_jid, campaign.channel_jid, campaign.name,
              campaign.schedule_time, campaign.timezone, campaign.status,
              campaign.last_error, campaign.updated_at,
              SUM(item.status='pending') AS pending_count,
              SUM(item.status='queued') AS queued_count,
              SUM(item.status='published') AS published_count,
              SUM(item.status='failed') AS failed_count,
              SUM(item.content_type='text') AS text_count,
              SUM(item.content_type='image') AS image_count,
              SUM(item.content_type='video') AS video_count,
              COUNT(item.id) AS total_count
         FROM wa_campaigns campaign
         LEFT JOIN wa_campaign_items item ON item.campaign_id=campaign.id
        GROUP BY campaign.id, campaign.chat_jid, campaign.channel_jid, campaign.name,
                 campaign.schedule_time, campaign.timezone, campaign.status,
                 campaign.last_error, campaign.updated_at
        ORDER BY campaign.updated_at DESC`
    ),
    pool.query(
      `SELECT queue.id, queue.channel_jid, channel.name AS channel_name,
              queue.content_type, queue.text_content, queue.media_path, queue.mime_type,
              queue.status, queue.scheduled_at, queue.published_at,
              queue.whatsapp_message_id, queue.error_text, queue.created_at
         FROM wa_channel_queue queue
         LEFT JOIN wa_channels channel ON channel.channel_jid=queue.channel_jid
        ORDER BY
          CASE queue.status WHEN 'failed' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
          queue.scheduled_at ASC, queue.id DESC
        LIMIT 60`
    ),
    pool.query(
      `SELECT action_key, mode, reason, details_json, created_at
         FROM wa_actions_log
        ORDER BY id DESC LIMIT 12`
    ),
    pool.query(
      `SELECT chat_jid, name, active_channel_jid, interval_minutes, updated_at
         FROM wa_control_chats WHERE enabled=1 ORDER BY id ASC LIMIT 1`
    )
  ]);

  const summary = summaryRows[0] || {};
  return {
    session: sessions[0] || null,
    controlChat: controlChats[0] || null,
    summary: {
      published: number(summary.published_count),
      queued: number(summary.queued_count),
      failed: number(summary.failed_count),
      nextScheduledAt: summary.next_scheduled_at || null,
      activeCampaigns: campaigns.filter(item => ['running', 'waiting'].includes(item.status)).length,
      campaignStock: campaigns.reduce((total, item) => total + number(item.pending_count), 0)
    },
    channels: channels.map(item => ({
      ...item,
      enabled: Boolean(item.enabled),
      queued_count: number(item.queued_count),
      published_count: number(item.published_count),
      failed_count: number(item.failed_count)
    })),
    campaigns: campaigns.map(item => ({
      ...item,
      pending_count: number(item.pending_count),
      queued_count: number(item.queued_count),
      published_count: number(item.published_count),
      failed_count: number(item.failed_count),
      text_count: number(item.text_count),
      image_count: number(item.image_count),
      video_count: number(item.video_count),
      total_count: number(item.total_count)
    })),
    queue,
    actions
  };
}

export async function confirmChannelAdmin(channelJid) {
  await getPool().execute(
    `UPDATE wa_channels
        SET admin_confirmed_at=UTC_TIMESTAMP(), updated_at=CURRENT_TIMESTAMP
      WHERE channel_jid=:channelJid`,
    { channelJid }
  );
}

export async function getCampaignById(id) {
  const [rows] = await getPool().execute(
    `SELECT id, chat_jid, channel_jid, name, status FROM wa_campaigns WHERE id=:id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}
