const LEET_MAP = new Map(Object.entries({
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '1': 'i',
  '0': 'o',
  '5': 's',
  '7': 't'
}));

export function normalizeText(input = '') {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[@431057]/g, char => LEET_MAP.get(char) || char)
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/[^\p{L}\p{N}\s./:-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordBoundaryRegex(pattern) {
  return new RegExp(`(^|\\s)${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
}
