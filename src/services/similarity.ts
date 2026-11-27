/**
 * Duplicate detection: "A similar information already exists".
 * Compares normalized titles and the words of the contents (works for Arabic too).
 */

/** Lower case, no accents, no tashkeel, no punctuation, single spaces. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics and tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    // Latin letters, digits and Arabic letters only (no Unicode property escapes: Hermes-safe).
    .replace(/[^0-9a-zß-ɏء-ي٠-٩کگی]+/g, ' ')
    .trim();
}

function words(text: string): Set<string> {
  return new Set(normalizeText(text).split(' ').filter(w => w.length > 1));
}

/** Jaccard similarity of the word sets, 0…1. */
export function textSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) {
    return 0;
  }
  let common = 0;
  for (const w of wa) {
    if (wb.has(w)) {
      common += 1;
    }
  }
  return common / (wa.size + wb.size - common);
}

export interface SimilarCandidate {
  id: number;
  title: string;
  content: string;
}

export const SIMILARITY_THRESHOLD = 0.7;

/** The most similar existing item, or null. Same title, or very similar content (≥ 70 %). */
export function findMostSimilar<T extends SimilarCandidate>(
  input: { title: string; content: string },
  items: T[],
  excludeId?: number,
): T | null {
  const title = normalizeText(input.title);
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    if (item.id === excludeId) {
      continue;
    }
    const score =
      title && normalizeText(item.title) === title
        ? 1
        : input.content.trim().length >= 15
          ? textSimilarity(input.content, item.content)
          : 0;
    if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}
