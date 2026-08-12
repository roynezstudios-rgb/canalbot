import { listEnabledBadWords } from '../../db.js';
import { normalizeText, wordBoundaryRegex } from './normalizer.js';

function matchRule(rule, normalizedText, originalText) {
  const pattern = rule.normalizedPattern || normalizeText(rule.pattern);
  const exceptions = Array.isArray(rule.exceptions) ? rule.exceptions.map(normalizeText) : [];
  if (exceptions.some(exception => exception && normalizedText.includes(exception))) {
    return false;
  }

  if (rule.matchType === 'exact') return normalizedText === pattern;
  if (rule.matchType === 'phrase') return normalizedText.includes(pattern);
  if (rule.matchType === 'regex') {
    try {
      return new RegExp(rule.pattern, 'iu').test(originalText);
    } catch {
      return false;
    }
  }
  return wordBoundaryRegex(pattern).test(normalizedText);
}

export function badWordMatchTypeForPattern(normalizedPattern = '') {
  return /\s/.test(normalizedPattern.trim()) ? 'phrase' : 'word_boundary';
}

export function evaluateBadWordsWithRules({ rules = [], text }) {
  if (!text?.trim() || !rules.length) return null;

  const normalizedText = normalizeText(text);
  const matched = rules.find(rule => matchRule(rule, normalizedText, text));
  if (!matched) return null;

  return {
    matched: true,
    ruleId: matched.id,
    severity: matched.severity,
    evidence: {
      matchType: matched.matchType,
      patternPreview: matched.pattern.slice(0, 80),
      normalizedPreview: normalizedText.slice(0, 160)
    }
  };
}

export async function evaluateBadWords({ groupJid, text }) {
  const rules = await listEnabledBadWords(groupJid);
  return evaluateBadWordsWithRules({ rules, text });
}

export function guardianBadWordWarningText() {
  return [
    '⚠️ GuardianBot detectó lenguaje fuera de tono.',
    'Por ahora lo dejo registrado en observación; no borro mensajes ni sanciono automáticamente.',
    'Intentemos mantener el grupo cómodo para todos.'
  ].join('\n');
}
