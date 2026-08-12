import { getPool } from './pool.js';

export async function advanceGroupWelcomeCounter({ groupJid, joinedCount = 1, threshold = 50 }) {
  const count = Math.max(0, Number(joinedCount) || 0);
  const blockSize = Math.max(1, Number(threshold) || 50);
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO wa_group_welcome_state
        (group_jid, joined_since_last_message, total_joined)
       VALUES
        (:groupJid, :count, :count)
       ON DUPLICATE KEY UPDATE
        joined_since_last_message = joined_since_last_message + VALUES(joined_since_last_message),
        total_joined = total_joined + VALUES(total_joined),
        updated_at = CURRENT_TIMESTAMP`,
      { groupJid, count }
    );

    const [rows] = await connection.execute(
      `SELECT group_jid, joined_since_last_message, total_joined, last_message_at
         FROM wa_group_welcome_state
        WHERE group_jid = :groupJid
        FOR UPDATE`,
      { groupJid }
    );
    const row = rows[0] || {};
    const joinedSinceLastMessage = Number(row.joined_since_last_message || 0);
    const totalJoined = Number(row.total_joined || 0);
    const shouldSend = joinedSinceLastMessage >= blockSize;
    const remaining = shouldSend ? joinedSinceLastMessage - blockSize : joinedSinceLastMessage;

    if (shouldSend) {
      await connection.execute(
        `UPDATE wa_group_welcome_state
            SET joined_since_last_message = :remaining,
                last_message_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE group_jid = :groupJid`,
        { groupJid, remaining }
      );
    }

    await connection.commit();
    return {
      shouldSend,
      threshold: blockSize,
      joinedSinceLastMessage: remaining,
      totalJoined,
      lastMessageAt: row.last_message_at || null
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
