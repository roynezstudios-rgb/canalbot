export function stickerCommand(text = '') {
  const match = text.trim().match(/^!st(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const [name = '', ...rest] = (match[1] || '').trim().toLowerCase().split(/\s+/);
  if (!name) return { name: '', args: '' };
  return { name, args: rest.join(' ') };
}

export function stickerTestSchedule(now = new Date()) {
  return new Date(now.getTime() + 60_000);
}

function duration(value, allowedUnits) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)([smhd])$/);
  if (!match || !allowedUnits.includes(match[2])) return null;
  const unitSeconds = { s: 1, m: 60, h: 3600, d: 86400 };
  return { seconds: Number(match[1]) * unitSeconds[match[2]], label: `${Number(match[1])}${match[2]}` };
}

export function parseIndividualSchedule(value) {
  const parsed = duration(value, ['m', 'h', 'd']);
  return parsed && parsed.seconds >= 60 ? { intervalSeconds: parsed.seconds, label: parsed.label } : null;
}

export function parseBlockSchedule(value) {
  const [count, delay, interval] = String(value || '').trim().split(/\s+/);
  const blockSize = Number(count);
  const parsedDelay = duration(delay, ['s']);
  const parsedInterval = duration(interval, ['m', 'h', 'd']);
  if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > 5 || !parsedDelay || !parsedInterval) return null;
  if (parsedDelay.seconds < 10 || parsedInterval.seconds < 3600) return null;
  if (parsedInterval.seconds < (blockSize - 1) * parsedDelay.seconds) return null;
  return {
    blockSize,
    inBlockDelaySeconds: parsedDelay.seconds,
    blockIntervalSeconds: parsedInterval.seconds,
    label: `${blockSize} sticker${blockSize === 1 ? '' : 's'}, ${parsedDelay.label} entre cada uno, cada ${parsedInterval.label}`
  };
}
