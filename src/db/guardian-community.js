import { getPool } from './pool.js';

export async function dailyXpTotal({ groupJid, userJid }) {
  const [rows] = await getPool().execute(
    `SELECT COALESCE(SUM(points), 0) AS total
       FROM wa_xp_events
      WHERE group_jid = :groupJid
        AND user_jid = :userJid
        AND created_at >= CURRENT_DATE()`,
    { groupJid, userJid }
  );
  return Number(rows[0]?.total || 0);
}

export async function addXpEvent({ groupJid, userJid, sourceKey, points, reason }) {
  const [result] = await getPool().execute(
    `INSERT IGNORE INTO wa_xp_events
      (group_jid, user_jid, source_key, points, reason)
     VALUES
      (:groupJid, :userJid, :sourceKey, :points, :reason)`,
    { groupJid, userJid, sourceKey, points, reason }
  );
  if (result.affectedRows !== 1) return false;

  await getPool().execute(
    `INSERT INTO wa_user_reputation
      (group_jid, user_jid, xp, positive_score, last_xp_at)
     VALUES
      (:groupJid, :userJid, :points, :points, NOW())
     ON DUPLICATE KEY UPDATE
       xp = xp + VALUES(xp),
       positive_score = positive_score + VALUES(positive_score),
       level_key = CASE
         WHEN xp + VALUES(xp) >= 500 THEN 'leyenda'
         WHEN xp + VALUES(xp) >= 250 THEN 'destacado'
         WHEN xp + VALUES(xp) >= 100 THEN 'colaborador'
         WHEN xp + VALUES(xp) >= 25 THEN 'participante'
         ELSE 'nuevo_miembro'
       END,
       last_xp_at = NOW(),
       updated_at = CURRENT_TIMESTAMP`,
    { groupJid, userJid, points }
  );
  return true;
}

export async function getUserReputation({ groupJid, userJid }) {
  const [rows] = await getPool().execute(
    `SELECT group_jid, user_jid, xp, level_key, positive_score, negative_score, last_xp_at
       FROM wa_user_reputation
      WHERE group_jid = :groupJid AND user_jid = :userJid
      LIMIT 1`,
    { groupJid, userJid }
  );
  return rows[0] || null;
}

export async function topReputation({ groupJid, limit = 10 }) {
  const [rows] = await getPool().execute(
    `SELECT r.user_jid, r.xp, r.level_key, u.display_name
       FROM wa_user_reputation r
       LEFT JOIN wa_users u ON u.user_jid = r.user_jid
      WHERE r.group_jid = :groupJid
      ORDER BY r.xp DESC, r.updated_at ASC
      LIMIT :limit`,
    { groupJid, limit }
  );
  return rows;
}

export async function awardEligibleAchievements({ groupJid, userJid }) {
  const reputation = await getUserReputation({ groupJid, userJid });
  if (!reputation) return [];
  const [achievements] = await getPool().query(
    `SELECT achievement_key, name, config_json
       FROM wa_achievements
      WHERE enabled = 1`
  );
  const awarded = [];
  for (const achievement of achievements) {
    const configJson = typeof achievement.config_json === 'string' ? JSON.parse(achievement.config_json) : achievement.config_json;
    const required = Number(configJson?.xp_required || 0);
    if (reputation.xp < required) continue;
    const [result] = await getPool().execute(
      `INSERT IGNORE INTO wa_user_achievements
        (group_jid, user_jid, achievement_key, evidence_json)
       VALUES
        (:groupJid, :userJid, :achievementKey, :evidenceJson)`,
      {
        groupJid,
        userJid,
        achievementKey: achievement.achievement_key,
        evidenceJson: JSON.stringify({ xp: reputation.xp })
      }
    );
    if (result.affectedRows === 1) awarded.push(achievement.name);
  }
  return awarded;
}

export async function listUserAchievements({ groupJid, userJid }) {
  const [rows] = await getPool().execute(
    `SELECT a.achievement_key, a.name, a.description, a.category, a.config_json, ua.awarded_at
       FROM wa_user_achievements ua
       JOIN wa_achievements a ON a.achievement_key = ua.achievement_key
      WHERE ua.group_jid = :groupJid AND ua.user_jid = :userJid
      ORDER BY ua.awarded_at DESC`,
    { groupJid, userJid }
  );
  return rows;
}

export async function listActiveAchievements() {
  const [rows] = await getPool().query(
    `SELECT achievement_key, name, description, category, config_json
       FROM wa_achievements
      WHERE enabled = 1
      ORDER BY category ASC, id ASC`
  );
  return rows;
}

export async function listActiveMissions() {
  const [rows] = await getPool().query(
    `SELECT mission_key, name, description, mission_type, target_count, xp_reward
       FROM wa_missions
      WHERE enabled = 1
      ORDER BY mission_type ASC, id ASC`
  );
  return rows;
}

export async function incrementMissionProgress({ groupJid, userJid, missionKey, amount = 1, targetCount = 1, evidence = {} }) {
  await getPool().execute(
    `INSERT INTO wa_mission_progress
      (group_jid, user_jid, mission_key, progress_count, completed_at, evidence_json)
     VALUES
      (:groupJid, :userJid, :missionKey, :amount, IF(:amount >= :targetCount, NOW(), NULL), :evidenceJson)
     ON DUPLICATE KEY UPDATE
       progress_count = progress_count + VALUES(progress_count),
       completed_at = IF(completed_at IS NULL AND progress_count + VALUES(progress_count) >= :targetCount, NOW(), completed_at),
       evidence_json = JSON_MERGE_PATCH(COALESCE(evidence_json, JSON_OBJECT()), VALUES(evidence_json)),
       updated_at = CURRENT_TIMESTAMP`,
    {
      groupJid,
      userJid: userJid || null,
      missionKey,
      amount,
      targetCount,
      evidenceJson: JSON.stringify(evidence)
    }
  );
}

export async function getDailyQuestionHistory({ groupJid, askedOn }) {
  const [rows] = await getPool().execute(
    `SELECT h.id, h.group_jid, h.question_id, h.asked_on, h.message_id,
            q.question_text, q.options_json, q.category
       FROM wa_daily_question_history h
       JOIN wa_daily_questions q ON q.id = h.question_id
      WHERE h.group_jid = :groupJid
        AND h.asked_on = :askedOn
      LIMIT 1`,
    { groupJid, askedOn }
  );
  return rows[0] || null;
}

export async function selectNextDailyQuestion() {
  const [rows] = await getPool().query(
    `SELECT id, question_text, options_json, category, times_used
       FROM wa_daily_questions
      WHERE active = 1
      ORDER BY times_used ASC, COALESCE(last_used_at, '1970-01-01') ASC, id ASC
      LIMIT 1`
  );
  return rows[0] || null;
}

export async function recordDailyQuestionSent({ groupJid, questionId, askedOn, messageId }) {
  const [result] = await getPool().execute(
    `INSERT IGNORE INTO wa_daily_question_history
      (group_jid, question_id, asked_on, message_id)
     VALUES
      (:groupJid, :questionId, :askedOn, :messageId)`,
    { groupJid, questionId, askedOn, messageId: messageId || null }
  );
  if (result.affectedRows !== 1) return false;
  await getPool().execute(
    `UPDATE wa_daily_questions
        SET times_used = times_used + 1,
            last_used_at = NOW(),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = :questionId`,
    { questionId }
  );
  return true;
}

export async function getDailyQuestionByMessage({ groupJid, messageId }) {
  const [rows] = await getPool().execute(
    `SELECT h.id AS history_id, h.group_jid, h.question_id, h.asked_on, h.message_id,
            q.question_text, q.options_json, q.category
       FROM wa_daily_question_history h
       JOIN wa_daily_questions q ON q.id = h.question_id
      WHERE h.group_jid = :groupJid
        AND h.message_id = :messageId
      ORDER BY h.created_at DESC
      LIMIT 1`,
    { groupJid, messageId }
  );
  return rows[0] || null;
}

export async function recordDailyQuestionAnswer({ groupJid, userJid, questionId, answerText, messageId }) {
  const [result] = await getPool().execute(
    `INSERT IGNORE INTO wa_daily_question_answers
      (group_jid, user_jid, question_id, answer_text, message_id)
     VALUES
      (:groupJid, :userJid, :questionId, :answerText, :messageId)`,
    {
      groupJid,
      userJid,
      questionId,
      answerText: String(answerText || '').slice(0, 1000),
      messageId: messageId || null
    }
  );
  return result.affectedRows === 1;
}
