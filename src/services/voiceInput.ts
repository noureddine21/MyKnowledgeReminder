/**
 * Turns a dictated sentence into to-do lines the planner understands:
 *   "sport une heure puis appeler Ahmed un quart d'heure, réunion à 14h"
 *   → ["sport 1 heure", "appeler Ahmed 15 minutes", "réunion à 14h"]
 */

const NUMBER_WORDS: [RegExp, string][] = [
  [/\bune demi[- ]heure\b/gi, '30 minutes'],
  [/\bdemi[- ]heure\b/gi, '30 minutes'],
  [/\bun quart d'?\s?heure\b/gi, '15 minutes'],
  [/\btrois quarts d'?\s?heure\b/gi, '45 minutes'],
  [/\bune heure et demie\b/gi, '1h30'],
  [/\b(\d+) heures? et demie\b/gi, '$1h30'],
  [/\bune heure\b/gi, '1 heure'],
  [/\bdeux heures\b/gi, '2 heures'],
  [/\btrois heures\b/gi, '3 heures'],
  [/\bhalf an hour\b/gi, '30 minutes'],
  [/\ba quarter of an hour\b/gi, '15 minutes'],
  [/\ban hour and a half\b/gi, '1h30'],
  [/\b(an|one) hour\b/gi, '1 hour'],
  [/\btwo hours\b/gi, '2 hours'],
];

const SEPARATORS = /\s*(?:,|;|\bpuis\b|\bensuite\b|\bet après\b|\bet apres\b|\baprès ça\b|\bthen\b|\band then\b|\bnext\b)\s*/i;

const IMPORTANT = /^(?:important|urgent)\s*:?\s+/i;

export function speechToTaskLines(text: string): string[] {
  let normalized = text.trim();
  for (const [pattern, replacement] of NUMBER_WORDS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized
    .split(SEPARATORS)
    .map(part => part.trim().replace(/[.!?]+$/, ''))
    .filter(part => part.length > 0)
    .map(part => {
      const line = part.charAt(0).toUpperCase() + part.slice(1);
      // "important: finish the report" -> "!Finish the report"
      return IMPORTANT.test(line) ? `!${line.replace(IMPORTANT, '').replace(/^./, c => c.toUpperCase())}` : line;
    });
}
