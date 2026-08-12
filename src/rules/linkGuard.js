const URL_RE = /(?:https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/|t\.me\/|(?:[a-z0-9-]+\.)+[a-z]{2,})([^\s<>"')]*)/ig;

function normalizeLinkText(text = '') {
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+punto\s+/g, '.')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s+/g, ' ');
}

export function detectLinks(text = '') {
  return candidateDomains(text).length > 0;
}

function domainFromCandidate(candidate = '') {
  const raw = candidate.replace(/[.,;:!?]+$/g, '');
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeAllowedDomain(domain = '') {
  return domainFromCandidate(domain) || domain.toLowerCase().replace(/^www\./, '').split('/')[0];
}

function candidateDomains(text = '') {
  const normalized = normalizeLinkText(text);
  return [...normalized.matchAll(URL_RE)]
    .map(match => domainFromCandidate(match[0]))
    .filter(Boolean);
}

function isWhitelistedDomain(domain, whitelistDomains) {
  return whitelistDomains.some(item => {
    const allowed = normalizeAllowedDomain(item);
    return allowed && (domain === allowed || domain.endsWith(`.${allowed}`));
  });
}

export function evaluateLinkGuard({ text, senderIsAdmin = false, whitelistDomains = [] }) {
  const domains = candidateDomains(text);
  if (!domains.length) return { matched: false };

  const whitelisted = domains.every(domain => isWhitelistedDomain(domain, whitelistDomains));
  if (whitelisted) {
    return { matched: true, allowed: true, reason: 'whitelisted-link' };
  }

  if (senderIsAdmin) {
    return { matched: true, allowed: true, reason: 'admin-link' };
  }

  return {
    matched: true,
    allowed: false,
    reason: 'unauthorized-link',
    recommendedAction: 'delete'
  };
}
