import { listAllowedDomains } from '../../db.js';
import { normalizeText } from './normalizer.js';

const LINK_RE = /(?:https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/|t\.me\/|(?:[a-z0-9-]+\.)+[a-z]{2,})([^\s]*)/ig;
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'is.gd', 'ow.ly', 'rebrand.ly']);

function cleanDomain(candidate = '') {
  return candidate
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function allowedByDomain(domain, allowedDomains) {
  return allowedDomains.some(item => {
    const allowed = item.domain.toLowerCase().replace(/^www\./, '');
    return domain === allowed || (item.includeSubdomains && domain.endsWith(`.${allowed}`));
  });
}

export async function evaluateGuardianLinkGuard({ groupJid, text, senderIsAdmin = false, allowAdmins = true }) {
  if (!text?.trim()) return null;

  const normalized = normalizeText(text)
    .replace(/\s+punto\s+/g, '.')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s+/g, ' ');
  const candidates = [...normalized.matchAll(LINK_RE)].map(match => match[0]);
  if (!candidates.length) return null;

  const allowedDomains = await listAllowedDomains(groupJid);
  const blocked = candidates.find(candidate => {
    const domain = cleanDomain(candidate);
    if (!domain) return false;
    if (allowAdmins && senderIsAdmin) return false;
    if (allowedByDomain(domain, allowedDomains)) return false;
    return true;
  });

  if (!blocked) {
    return { matched: true, allowed: true, evidence: { candidates } };
  }

  const domain = cleanDomain(blocked);
  return {
    matched: true,
    allowed: false,
    severity: SHORTENERS.has(domain) || domain === 'chat.whatsapp.com' ? 'high' : 'medium',
    evidence: {
      candidates,
      blockedDomain: domain,
      shortener: SHORTENERS.has(domain)
    }
  };
}
