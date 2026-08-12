function localParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  return Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function parseCampaignCreate(value = '') {
  const [name = '', time = '', timezone = 'America/Mexico_City'] = String(value).trim().split(/\s+/);
  if (!/^[\p{L}\p{N}_-]{2,60}$/u.test(name) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    return null;
  }
  return { name, time, timezone };
}

export function localDateAndTime(date, timezone) {
  const parts = localParts(date, timezone);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function campaignDueToday(campaign, now = new Date()) {
  const local = localDateAndTime(now, campaign.timezone);
  const lastDueDate = campaign.last_due_date instanceof Date
    ? campaign.last_due_date.toISOString().slice(0, 10)
    : String(campaign.last_due_date || '').slice(0, 10);
  return lastDueDate !== local.date && local.time >= campaign.schedule_time;
}
