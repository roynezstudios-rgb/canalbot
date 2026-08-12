import { getPool } from './pool.js';
import { nextCreatorMentionAt } from '../creatorMention/policy.js';

export async function ensureCreatorMentionSchedules() {
  await getPool().query(
    `INSERT INTO wa_creator_mention_schedules (channel_jid, next_publish_at)
     SELECT channel_jid, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY)
       FROM wa_channels
      WHERE enabled=1 AND publish_mode='active'
     ON DUPLICATE KEY UPDATE channel_jid=VALUES(channel_jid)`
  );
}

export async function claimDueCreatorMentionSchedules(limit = 3) {
  const pool = getPool();
  const [due] = await pool.execute(
    `SELECT * FROM wa_creator_mention_schedules
      WHERE enabled=1 AND status='active' AND queued_at IS NULL
        AND next_publish_at <= UTC_TIMESTAMP()
      ORDER BY next_publish_at ASC, id ASC
      LIMIT ?`,
    [limit]
  );
  const claimed = [];
  for (const schedule of due) {
    const [result] = await pool.execute(
      `UPDATE wa_creator_mention_schedules
          SET queued_at=UTC_TIMESTAMP(), updated_at=CURRENT_TIMESTAMP
        WHERE id=:id AND enabled=1 AND status='active' AND queued_at IS NULL
          AND next_publish_at <= UTC_TIMESTAMP()`,
      { id: schedule.id }
    );
    if (result.affectedRows === 1) claimed.push(schedule);
  }
  return claimed;
}

export async function setCreatorMentionQueued({ scheduleId, queueId }) {
  await getPool().execute(
    `UPDATE wa_creator_mention_schedules
        SET last_queue_id=:queueId, updated_at=CURRENT_TIMESTAMP
      WHERE id=:scheduleId`,
    { scheduleId, queueId }
  );
}

export async function markCreatorMentionPublished(scheduleId, publishedAt = new Date()) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT mention_count FROM wa_creator_mention_schedules WHERE id=:scheduleId LIMIT 1`,
    { scheduleId }
  );
  if (!rows[0]) return false;
  // The next delay is chosen after recording the mention that just went out.
  const nextPublishAt = nextCreatorMentionAt({ mentionCount: Number(rows[0].mention_count) + 1, from: publishedAt });
  const [result] = await pool.execute(
    `UPDATE wa_creator_mention_schedules
        SET mention_count=mention_count+1,
            queued_at=NULL,
            next_publish_at=:nextPublishAt,
            last_published_at=:publishedAt,
            last_error=NULL,
            updated_at=CURRENT_TIMESTAMP
      WHERE id=:scheduleId`,
    { scheduleId, nextPublishAt, publishedAt }
  );
  return result.affectedRows === 1;
}

export async function markCreatorMentionFailed({ scheduleId, errorText }) {
  const [result] = await getPool().execute(
    `UPDATE wa_creator_mention_schedules
        SET enabled=0, status='failed', queued_at=NULL,
            last_error=:errorText, updated_at=CURRENT_TIMESTAMP
      WHERE id=:scheduleId`,
    { scheduleId, errorText: String(errorText || '').slice(0, 1000) }
  );
  return result.affectedRows === 1;
}
