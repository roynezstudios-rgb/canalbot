import { config } from '../config.js';
import { advanceGroupWelcomeCounter, getGuardianGroupSettings, logAction } from '../db.js';
import { sendOutboundMessage } from '../core/outboundQueue.js';
import { logger } from '../logger.js';

export const WELCOME_BLOCK_SIZE = 50;

export function guardianWelcomeText({ preview = false, joinedCount = WELCOME_BLOCK_SIZE } = {}) {
  const title = preview
    ? 'Ejemplo de bienvenida automática'
    : 'Bienvenida al grupo';

  return [
    `✨ ${title}`,
    `Este aviso aparece cada ${WELCOME_BLOCK_SIZE} nuevos integrantes para que nadie llegue perdido.`,
    '',
    `👋 Bienvenidas y bienvenidos. Ya se sumaron ${joinedCount} personas nuevas al grupo.`,
    '',
    'Soy GuardianBot: ayudo a cuidar el grupo, reconocer la buena participación y dar herramientas rápidas a la comunidad.',
    '',
    '🏆 XP',
    'Ganas XP participando de forma real: mensajes útiles, respuestas y actividad sana. Sirve para subir de nivel y aparecer en el ranking del grupo.',
    '',
    '🎯 Misiones',
    'Son pequeñas dinámicas para animar la conversación. Cuando estén activas, puedes verlas con !misiones.',
    '',
    '🚩 Reportes',
    'Si ves spam, insultos o algo fuera de lugar, responde a ese mensaje con !report. Si 3 personas reportan el mismo mensaje, GuardianBot lo elimina y registra infracción.',
    '',
    '🛡️ Administración',
    'GuardianBot cuida spam, links raros, reportes y actividad del grupo según el modo configurado por admins.',
    '',
    '📌 Comandos útiles',
    '!hola',
    '!xp',
    '!perfil o !yo',
    '!top o !ranking',
    '!insignias',
    '!misiones',
    '!report respondiendo a un mensaje',
    '!parametros',
    '!comandos',
    '',
    'Tip: usa !comandos cuando quieras ver la lista rápida.'
  ].join('\n');
}

export async function handleWelcomeParticipantsUpdate({ sock, event }) {
  const groupJid = event?.id;
  const participants = event?.participants || [];
  if (!sock || !groupJid || event?.action !== 'add' || !participants.length) return false;

  const settings = await getGuardianGroupSettings(groupJid);
  if (!config.guardian.enabled || !settings?.enabled) return false;

  const state = await advanceGroupWelcomeCounter({
    groupJid,
    joinedCount: participants.length,
    threshold: WELCOME_BLOCK_SIZE
  });

  if (!state.shouldSend) return false;

  const text = guardianWelcomeText({
    joinedCount: state.threshold
  });

  try {
    await sendOutboundMessage(sock, groupJid, { text }, { priority: 'community' });
    await logAction({
      actionKey: 'guardian_welcome_block_sent',
      mode: 'dry_run',
      groupJid,
      reason: 'guardian_welcome_every_50_members',
      details: {
        threshold: state.threshold,
        totalJoined: state.totalJoined,
        joinedSinceLastMessage: state.joinedSinceLastMessage
      }
    });
    return true;
  } catch (error) {
    logger.error({ error, groupJid }, 'failed sending GuardianBot welcome block');
    await logAction({
      actionKey: 'guardian_welcome_block_failed',
      mode: 'dry_run',
      groupJid,
      reason: 'guardian_welcome_every_50_members',
      details: {
        error: String(error?.message || error),
        threshold: state.threshold,
        totalJoined: state.totalJoined
      }
    });
    return false;
  }
}
