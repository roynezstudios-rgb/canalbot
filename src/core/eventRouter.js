import { logAction } from '../db.js';
import { logger } from '../logger.js';
import { observeGroupUpdate, observeParticipantsUpdate } from '../guardianbot/admin/protection.js';
import { handleGuardianCallEvents } from '../guardianbot/moderation/groupCalls.js';
import { handleWelcomeParticipantsUpdate } from '../guardianbot/welcome.js';
import { handleMessagesUpsert } from '../wa/messages.js';

export async function routeMessagesUpsert({ sock, event }) {
  return handleMessagesUpsert({ sock, event });
}

export async function routeGroupParticipantsUpdate({ sock, event }) {
  await observeParticipantsUpdate(event);
  await handleWelcomeParticipantsUpdate({ sock, event });
  await logAction({
    actionKey: 'group_participants_update_seen',
    mode: 'dry_run',
    groupJid: event?.id || null,
    reason: 'guardian_observe_event',
    details: {
      action: event?.action || null,
      participants: event?.participants || []
    }
  });
}

export async function routeGroupsUpdate({ events }) {
  for (const event of events || []) {
    await observeGroupUpdate(event);
    await logAction({
      actionKey: 'groups_update_seen',
      mode: 'dry_run',
      groupJid: event?.id || null,
      reason: 'guardian_observe_event',
      details: event
    });
  }
}

export async function routeCallEvents({ sock, calls }) {
  for (const call of calls || []) {
    await logAction({
      actionKey: 'whatsapp_call_event_seen',
      mode: 'dry_run',
      groupJid: call?.groupJid || (call?.isGroup ? call?.chatId : null) || null,
      targetUserJid: call?.from || call?.callerPn || null,
      messageId: call?.id || null,
      reason: 'raw_call_event',
      details: {
        id: call?.id || null,
        chatId: call?.chatId || null,
        from: call?.from || null,
        callerPn: call?.callerPn || null,
        status: call?.status || null,
        isGroup: Boolean(call?.isGroup),
        groupJid: call?.groupJid || null,
        isVideo: Boolean(call?.isVideo),
        offline: Boolean(call?.offline),
        date: call?.date || null
      }
    });
  }
  return handleGuardianCallEvents({ sock, calls });
}

export function attachEventRouter(sock) {
  sock.ev.on('messages.upsert', event => {
    routeMessagesUpsert({ sock, event }).catch(error => {
      logger.error({ error }, 'failed to route messages.upsert');
    });
  });

  sock.ev.on('group-participants.update', event => {
    routeGroupParticipantsUpdate({ sock, event }).catch(error => {
      logger.error({ error }, 'failed to route group-participants.update');
    });
  });

  sock.ev.on('groups.update', events => {
    routeGroupsUpdate({ events }).catch(error => {
      logger.error({ error }, 'failed to route groups.update');
    });
  });

  sock.ev.on('call', calls => {
    routeCallEvents({ sock, calls }).catch(error => {
      logger.error({ error }, 'failed to route call');
    });
  });
}
