/**
 * Quick templates for the Add form: a verse, a hadith, a quote or a vocabulary word.
 * The user fills a few small fields; the template writes the title, source,
 * flashcard question (and content for a word) in a consistent way.
 */

export type TemplateId = 'free' | 'verse' | 'hadith' | 'quote' | 'word';

export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
  keyboard?: 'default' | 'numbers-and-punctuation';
}

export interface TemplateDef {
  id: TemplateId;
  label: string;
  icon: string;
  /** Default category name, selected when it exists. */
  category: string | null;
  fields: TemplateField[];
  contentLabel: string;
  contentPlaceholder: string;
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'free', label: 'Free', icon: 'text-box-outline', category: null, fields: [], contentLabel: 'Content', contentPlaceholder: 'Write the information you want to remember' },
  {
    id: 'verse',
    label: 'Verse',
    icon: 'book-open-page-variant',
    category: 'Quran',
    fields: [
      { key: 'surah', label: 'Surah', placeholder: 'e.g. Al-Baqarah' },
      { key: 'ayah', label: 'Verse number(s)', placeholder: 'e.g. 255 or 1-5', keyboard: 'numbers-and-punctuation' },
    ],
    contentLabel: 'Text of the verse',
    contentPlaceholder: 'Arabic text, and its meaning if you want',
  },
  {
    id: 'hadith',
    label: 'Hadith',
    icon: 'script-text-outline',
    category: 'Hadith',
    fields: [
      { key: 'narrator', label: 'Narrator', placeholder: 'e.g. Abu Hurayra' },
      { key: 'book', label: 'Collection', placeholder: 'e.g. Bukhari, Muslim' },
      { key: 'number', label: 'Number', placeholder: 'e.g. 1', keyboard: 'numbers-and-punctuation' },
    ],
    contentLabel: 'Text of the hadith',
    contentPlaceholder: 'The words of the hadith',
  },
  {
    id: 'quote',
    label: 'Quote',
    icon: 'format-quote-open',
    category: null,
    fields: [{ key: 'author', label: 'Author', placeholder: 'e.g. Ibn al-Qayyim' }],
    contentLabel: 'Quote',
    contentPlaceholder: 'The exact words',
  },
  {
    id: 'word',
    label: 'Word',
    icon: 'alphabetical-variant',
    category: 'French',
    fields: [
      { key: 'word', label: 'Word', placeholder: 'e.g. éphémère' },
      { key: 'translation', label: 'Meaning / translation', placeholder: 'e.g. short-lived' },
      { key: 'example', label: 'Example sentence', placeholder: 'e.g. Un bonheur éphémère.' },
    ],
    contentLabel: 'Notes (optional)',
    contentPlaceholder: 'Extra notes, synonyms…',
  },
];

export function templateById(id: TemplateId): TemplateDef {
  return TEMPLATES.find(t => t.id === id) ?? TEMPLATES[0];
}

export interface TemplateResult {
  title?: string;
  source?: string;
  question?: string;
  /** Only for templates that build the content (word). */
  content?: string;
}

const clean = (v: string | undefined) => (v ?? '').trim();

/**
 * Fields written by the template. `t` translates the fixed words
 * ("Surah", "What does … mean?"), so the result follows the app language.
 */
export function applyTemplate(
  id: TemplateId,
  values: Record<string, string>,
  notes: string,
  t: (text: string, vars?: Record<string, string>) => string = (s, v) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => v?.[k] ?? ''),
): TemplateResult {
  switch (id) {
    case 'verse': {
      const surah = clean(values.surah);
      const ayah = clean(values.ayah);
      if (!surah) {
        return {};
      }
      const ref = ayah ? `${surah} ${ayah}` : surah;
      return {
        title: t('Surah {ref}', { ref }),
        source: t('Surah {ref}', { ref }),
        question: t('Recite Surah {ref}', { ref }),
      };
    }
    case 'hadith': {
      const narrator = clean(values.narrator);
      const book = clean(values.book);
      const number = clean(values.number);
      const ref = [book, number].filter(Boolean).join(' ');
      const source = [narrator && t('Narrated by {name}', { name: narrator }), ref].filter(Boolean).join(' · ');
      return {
        ...(ref ? { title: t('Hadith — {ref}', { ref }) } : {}),
        ...(source ? { source } : {}),
      };
    }
    case 'quote': {
      const author = clean(values.author);
      return author
        ? { title: t('Quote — {author}', { author }), source: author, question: t('What did {author} say?', { author }) }
        : {};
    }
    case 'word': {
      const word = clean(values.word);
      const translation = clean(values.translation);
      const example = clean(values.example);
      if (!word) {
        return {};
      }
      const parts = [translation, example && `${t('Example')}: ${example}`, notes.trim()].filter(Boolean);
      return {
        title: word,
        question: t('What does "{word}" mean?', { word }),
        content: parts.join('\n\n'),
      };
    }
    default:
      return {};
  }
}
