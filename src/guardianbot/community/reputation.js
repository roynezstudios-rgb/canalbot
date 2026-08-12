import { config } from '../../config.js';
import { getQuotedMessageKey } from '../../core/messageUtils.js';
import {
  addXpEvent,
  awardEligibleAchievements,
  dailyXpTotal,
  getDailyQuestionByMessage,
  incrementMissionProgress,
  recordDailyQuestionAnswer
} from '../../db.js';
import { normalizeText } from '../moderation/normalizer.js';

const LEVELS = [
  ['nuevo_miembro', 'Nuevo miembro', 0],
  ['participante', 'Participante', 25],
  ['colaborador', 'Colaborador', 100],
  ['destacado', 'Destacado', 250],
  ['leyenda', 'Leyenda', 500]
];

const ACHIEVEMENT_EMOJIS = new Map(Object.entries({
  primer_paso: '🌱',
  participante_constante: '🔥',
  colaborador_activo: '🤝'
}));

const ACHIEVEMENT_CATEGORY_EMOJIS = new Map(Object.entries({
  participation: '🌟',
  collaboration: '🤝',
  community: '🏡'
}));

function isEligibleText(text = '') {
  const normalized = normalizeText(text);
  if (normalized.length < config.guardian.xpMessageMinLength) return false;
  if (/^(jaja|jeje|ok|si|no|hola|gracias){1,3}$/i.test(normalized.replace(/\s+/g, ''))) return false;
  return true;
}

function achievementConfig(item = {}) {
  if (!item.config_json) return {};
  if (typeof item.config_json === 'string') {
    try {
      return JSON.parse(item.config_json);
    } catch {
      return {};
    }
  }
  return item.config_json;
}

export function achievementEmoji(item = {}) {
  return ACHIEVEMENT_EMOJIS.get(item.achievement_key)
    || ACHIEVEMENT_CATEGORY_EMOJIS.get(item.category)
    || '🏅';
}

function achievementRequirementText(item = {}) {
  const requiredXp = Number(achievementConfig(item)?.xp_required || 0);
  return requiredXp > 0 ? ` Requisito: ${requiredXp} XP.` : '';
}

function achievementLine(item = {}, { includeDescription = true } = {}) {
  const description = includeDescription && item.description ? `: ${item.description}` : '';
  return `${achievementEmoji(item)} ${item.name}${description}${achievementRequirementText(item)}`;
}

export function levelLabel(levelKey = 'nuevo_miembro') {
  return LEVELS.find(([key]) => key === levelKey)?.[1] || levelKey;
}

export function xpHelpText() {
  const replyTotal = config.guardian.xpValidMessage + config.guardian.xpReplyBonus;
  const levels = LEVELS.map(([, label, xp]) => `• ${label}: ${xp} XP`).join('\n');
  return [
    'XP GuardianBot',
    '',
    'Ganas XP participando de forma real en el grupo:',
    `• Mensaje valido: +${config.guardian.xpValidMessage} XP.`,
    `• Respuesta directa: +${replyTotal} XP total (+${config.guardian.xpValidMessage} base +${config.guardian.xpReplyBonus} extra).`,
    `• Pregunta diaria: +${config.guardian.xpQuestionAnswer} XP extra al responder directamente la pregunta del dia.`,
    '',
    `Para contar, el mensaje debe tener al menos ${config.guardian.xpMessageMinLength} caracteres y no ser spam, saludo repetido o texto demasiado corto.`,
    `Limite diario: ${config.guardian.xpDailyCap} XP por persona.`,
    '',
    'Niveles:',
    levels,
    '',
    'Usa !perfil para ver tu XP y !top para ver el ranking.'
  ].join('\n');
}

export function achievementHelpText({ available = [], earned = [] } = {}) {
  const availableLines = available.length
    ? available.map(item => `• ${achievementLine(item)}`).join('\n')
    : '• Aun no hay insignias activas configuradas.';
  const earnedLines = earned.length
    ? earned.map(item => `• ${achievementLine(item, { includeDescription: false })}`).join('\n')
    : 'Todavia no tienes insignias en este grupo.';

  return [
    'Insignias GuardianBot',
    '',
    'Funcionan como reconocimientos del grupo:',
    '• Se ganan automaticamente al cumplir metas sanas de participacion.',
    '• Cada insignia se entrega una sola vez por grupo.',
    '• Se quedan en tu perfil de ese grupo y ayudan a reconocer aportes reales.',
    '• No se compran ni se piden manualmente.',
    '',
    'Disponibles:',
    availableLines,
    '',
    'Tus insignias:',
    earnedLines
  ].join('\n');
}

export async function observeCommunityActivity({ msg, groupJid, senderJid, text }) {
  if (!isEligibleText(text)) return { awarded: false, points: 0 };

  const currentTotal = await dailyXpTotal({ groupJid, userJid: senderJid });
  if (currentTotal >= config.guardian.xpDailyCap) return { awarded: false, points: 0, reason: 'daily_cap' };

  const quoted = getQuotedMessageKey(msg);
  const dailyQuestion = quoted
    ? await getDailyQuestionByMessage({ groupJid, messageId: quoted.messageId })
    : null;
  const dailyQuestionAnswered = dailyQuestion
    ? await recordDailyQuestionAnswer({
      groupJid,
      userJid: senderJid,
      questionId: dailyQuestion.question_id,
      answerText: text,
      messageId: msg.key.id
    })
    : false;
  const basePoints = config.guardian.xpValidMessage + (quoted ? config.guardian.xpReplyBonus : 0);
  const dailyQuestionBonus = dailyQuestionAnswered ? config.guardian.xpQuestionAnswer : 0;
  const points = Math.min(basePoints + dailyQuestionBonus, config.guardian.xpDailyCap - currentTotal);
  const sourceKey = `message:${msg.key.id}`;
  const inserted = await addXpEvent({
    groupJid,
    userJid: senderJid,
    sourceKey,
    points,
    reason: dailyQuestionAnswered ? 'daily_question_answer' : quoted ? 'reply_message' : 'valid_message'
  });
  if (!inserted) return { awarded: false, points: 0, reason: 'duplicate' };

  await incrementMissionProgress({
    groupJid,
    userJid: senderJid,
    missionKey: 'participa_5',
    amount: 1,
    targetCount: 5,
    evidence: { sourceKey }
  });
  if (quoted) {
    await incrementMissionProgress({
      groupJid,
      userJid: senderJid,
      missionKey: 'responde_3',
      amount: 1,
      targetCount: 3,
      evidence: { sourceKey, quoted }
    });
  }
  const achievements = await awardEligibleAchievements({ groupJid, userJid: senderJid });
  return { awarded: true, points, achievements };
}
