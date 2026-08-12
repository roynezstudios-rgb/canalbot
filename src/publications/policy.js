export function publicationCommand(text = '') {
  const match = text.trim().match(/^!pub(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const [name = '', ...rest] = (match[1] || '').trim().toLowerCase().split(/\s+/);
  return { name, args: rest.join(' ') };
}

export function parsePublicationInterval(value = '') {
  const match = String(value).trim().toLowerCase().match(/^(\d+)([mhd])$/);
  if (!match) return null;
  const unitSeconds = { m: 60, h: 3600, d: 86400 };
  const intervalSeconds = Number(match[1]) * unitSeconds[match[2]];
  if (intervalSeconds < 5 * 60) return null;
  return { intervalSeconds, label: `${Number(match[1])}${match[2]}` };
}
