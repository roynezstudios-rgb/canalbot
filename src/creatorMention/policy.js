const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_CREATOR_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vak94drFcow5j1OfZ31F';

export function creatorMentionMessage(channelUrl = DEFAULT_CREATOR_CHANNEL_URL) {
  return `¿Te está sirviendo CanalBot? Únete al canal del creador para seguir el proyecto:\n${channelUrl}`;
}

export function nextCreatorMentionAt({ mentionCount = 0, from = new Date() } = {}) {
  const base = new Date(from);
  const delays = [1, 2, 7, 14];
  const days = delays[Number(mentionCount)];
  if (days) return new Date(base.getTime() + days * DAY_MS);

  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}
