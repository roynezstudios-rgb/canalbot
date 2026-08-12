import {
  addCampaignItem,
  closeCampaignCapture,
  createCampaign,
  getCampaign,
  getOpenCampaignCapture,
  getOpenPublicationCapture,
  getControlChat,
  listCampaigns,
  setCampaignStatus,
  startCampaignCapture
} from '../db.js';
import { parseCampaignCreate } from './policy.js';
import { config } from '../config.js';

function splitArgs(args = '') {
  const [first = '', ...rest] = String(args).trim().split(/\s+/);
  return { first, rest: rest.join(' ') };
}

export async function handleCampaignCommand({ sock, msg, chatJid, senderJid, args, reply }) {
  const { first: option = '', rest } = splitArgs(args.toLowerCase());
  const control = await getControlChat(chatJid);
  const channelJid = control?.active_channel_jid;
  if (!channelJid) {
    await reply(sock, msg, 'Primero elige un canal con: !ca <nombre o jid>');
    return true;
  }
  if (option === 'crear') {
    const parsed = parseCampaignCreate(rest);
    if (!parsed) {
      await reply(sock, msg, 'Uso: !camp crear <NombreSinEspacios> <HH:MM> [ZonaHoraria]. Ejemplo: !camp crear FraseDelDia 09:00 America/Mexico_City');
      return true;
    }
    const campaign = await createCampaign({ chatJid, channelJid, name: parsed.name, scheduleTime: parsed.time, timezone: parsed.timezone });
    await reply(sock, msg, `Campaña ${campaign.name} creada y pausada. Hora diaria: ${campaign.schedule_time} (${campaign.timezone}). Añade contenido con: !camp iniciar ${campaign.name}`);
    return true;
  }
  if (option === 'iniciar') {
    const campaign = await getCampaign({ chatJid, channelJid, name: rest.trim() });
    if (!campaign) {
      await reply(sock, msg, 'No encontré esa campaña en el canal activo. Crea una con: !camp crear Nombre 09:00');
      return true;
    }
    if (await getOpenPublicationCapture(chatJid)) {
      await reply(sock, msg, 'Primero cierra la captura de cola normal con: !pub fin');
      return true;
    }
    await startCampaignCapture({ campaignId: campaign.id, creatorJid: senderJid });
    await reply(sock, msg, `Captura iniciada para ${campaign.name}. Envía textos, imágenes y videos en orden. Termina con: !camp fin`);
    return true;
  }
  if (option === 'fin') {
    const closed = await closeCampaignCapture(chatJid);
    if (!closed.capture) {
      await reply(sock, msg, 'No hay una captura de campaña abierta. Usa: !camp iniciar Nombre');
      return true;
    }
    await reply(sock, msg, `Campaña ${closed.capture.name}: ${closed.count} contenido${closed.count === 1 ? '' : 's'} en secuencia. Conserva su horario y retomará en la próxima hora diaria.`);
    return true;
  }
  if (option === 'activar' || option === 'pausar' || option === 'estado') {
    const name = rest.trim();
    if (option === 'estado' && !name) {
      const campaigns = await listCampaigns({ chatJid, channelJid });
      await reply(sock, msg, campaigns.length ? campaigns.map(c => `${c.name}: ${c.status}, ${c.schedule_time} ${c.timezone}, pendientes: ${c.pending_count}`).join('\n') : 'No hay campañas para este canal.');
      return true;
    }
    const campaign = await getCampaign({ chatJid, channelJid, name });
    if (!campaign) {
      await reply(sock, msg, `No encontré esa campaña. Usa: !camp ${option} Nombre`);
      return true;
    }
    if (option === 'activar') {
      await setCampaignStatus({ campaignId: campaign.id, status: campaign.pending_count ? 'running' : 'waiting' });
      await reply(sock, msg, `Campaña ${campaign.name} activada. Publicará 1 contenido cada día a las ${campaign.schedule_time} (${campaign.timezone}).`);
      return true;
    }
    if (option === 'pausar') {
      await setCampaignStatus({ campaignId: campaign.id, status: 'paused' });
      await reply(sock, msg, `Campaña ${campaign.name} pausada. Su secuencia se conserva.`);
      return true;
    }
    await reply(sock, msg, [`Campaña: ${campaign.name}`, `Horario: ${campaign.schedule_time} (${campaign.timezone})`, `Estado: ${campaign.status}`, `Pendientes: ${campaign.pending_count}`, `Último turno: ${campaign.last_due_date || 'aún ninguno'}`, campaign.last_error ? `Error: ${campaign.last_error}` : 'Sin errores.'].join('\n'));
    return true;
  }
  await reply(sock, msg, 'Uso: !camp crear Nombre 09:00 [ZonaHoraria] | iniciar Nombre | fin | activar Nombre | pausar Nombre | estado [Nombre]');
  return true;
}

export async function collectCampaignIfCapturing({ sock, msg, chatJid, senderJid, text, isSticker, mediaInfo, downloadMedia }) {
  if (isSticker(msg.message)) return false;
  const capture = await getOpenCampaignCapture(chatJid);
  if (!capture || capture.creator_jid !== senderJid) return false;
  const info = mediaInfo(msg.message);
  if (info && !['image', 'video'].includes(info.type)) return false;
  if (!info && !text.trim()) return false;
  const mediaPath = info ? await downloadMedia({ sock, msg, info }) : null;
  await addCampaignItem({ campaignId: capture.campaign_id, sourceMessageId: msg.key.id, contentType: info?.type || 'text', textContent: text || null, mediaPath, mimeType: info?.mimeType || null, maxItems: config.canalbot.maxCaptureItems });
  return true;
}
