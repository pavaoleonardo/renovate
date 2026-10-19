/**
 * The company's face in the app chrome. Both helpers are pure so the nav can be
 * decided without a session, a network call or the database.
 */

/** Legal forms that never deserve an initial: "Reformas Líder S.L." → RL. */
const LEGAL_FORMS = new Set([
  'SL',
  'SA',
  'SLU',
  'SAU',
  'SLL',
  'SRL',
  'SLNE',
  'SC',
  'SCP',
  'CB',
  'SOCIEDAD',
  'LIMITADA',
  'UNIPERSONAL',
]);

/** Words that would turn the initials into nonsense: "Áridos y Hormigones" → ÁH. */
const STOP_WORDS = new Set(['Y', 'E', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'EN', 'PARA']);

/**
 * Two initials for the logo tile: the first letters of the two first meaningful
 * words, or the two first letters when the name is a single word. Returns an
 * empty string when nothing usable is left, so the caller can fall back instead
 * of painting punctuation.
 */
export function companyInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    // Dots and slashes would otherwise survive as their own "words":
    // "S.L." becomes "S L" and both letters are dropped by the length rule below.
    .replace(/[.,/()[\]-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toUpperCase())
    .filter((word) => word.length > 1 && !LEGAL_FORMS.has(word) && !STOP_WORDS.has(word));

  if (words.length === 0) return '';

  const [first, second] = words;
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}

/**
 * A logo URL the browser can actually paint. Anything that is not http(s) — an
 * empty column, a pasted `javascript:` — is treated as "no logo", which the tile
 * then draws with initials.
 */
export function usableLogoUrl(url: string | null | undefined): string | null {
  const candidate = (url ?? '').trim();
  return /^https?:\/\//i.test(candidate) ? candidate : null;
}
