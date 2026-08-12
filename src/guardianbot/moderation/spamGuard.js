import { config } from '../../config.js';

const eventsByScope = new Map();

function prune(now, events, maxWindowMs) {
  while (events.length && now - events[0].at > maxWindowMs) events.shift();
}

function pushAndCount({ groupJid, userJid, kind, messageId, windowSeconds }) {
  const now = Date.now();
  const key = `${groupJid}:${userJid}:${kind}`;
  const events = eventsByScope.get(key) || [];
  events.push({ at: now, messageId });
  prune(now, events, windowSeconds * 1000);
  eventsByScope.set(key, events);
  return events.length;
}

export function evaluateStickerSpam({ groupJid, userJid, messageId }) {
  const shortCount = pushAndCount({
    groupJid,
    userJid,
    kind: 'sticker_short',
    messageId,
    windowSeconds: config.guardian.stickerShortWindowSeconds
  });
  const longCount = pushAndCount({
    groupJid,
    userJid,
    kind: 'sticker_long',
    messageId,
    windowSeconds: config.guardian.stickerLongWindowSeconds
  });

  if (shortCount > config.guardian.stickerShortWindowLimit) {
    return {
      matched: true,
      spamType: 'sticker_spam',
      windowSeconds: config.guardian.stickerShortWindowSeconds,
      observedCount: shortCount,
      thresholdCount: config.guardian.stickerShortWindowLimit
    };
  }
  if (longCount > config.guardian.stickerLongWindowLimit) {
    return {
      matched: true,
      spamType: 'sticker_spam',
      windowSeconds: config.guardian.stickerLongWindowSeconds,
      observedCount: longCount,
      thresholdCount: config.guardian.stickerLongWindowLimit
    };
  }
  return null;
}

export function evaluateMediaSpam({ groupJid, userJid, messageId, mediaKind, limit }) {
  if (!mediaKind || mediaKind === 'sticker') return null;
  const threshold = limit || config.guardian.multimediaDefaultLimit;
  const observedCount = pushAndCount({
    groupJid,
    userJid,
    kind: mediaKind,
    messageId,
    windowSeconds: config.guardian.multimediaWindowSeconds
  });
  if (observedCount <= threshold) return null;
  return {
    matched: true,
    spamType: `${mediaKind}_spam`,
    windowSeconds: config.guardian.multimediaWindowSeconds,
    observedCount,
    thresholdCount: threshold
  };
}
