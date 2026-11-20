/**
 * Builds human friendly notification texts for a reminder.
 */

export interface NotificationMessage {
  title: string;
  body: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function buildReminderMessage(itemTitle: string, categoryName: string | null): NotificationMessage {
  const title = truncate(itemTitle.trim(), 80);
  const category = categoryName?.trim().toLowerCase();

  switch (category) {
    case 'quran':
      return { title: 'Time to review!', body: `Time to review your saved Quran verse: ${title}` };
    case 'hadith':
      return { title: 'Time to review!', body: `Time to review your saved Hadith: ${title}` };
    case 'french':
      return { title: 'Time to review!', body: `Practice your French: ${title}` };
    case 'technology':
      return { title: 'Time to review!', body: `Remember your ${title} notes.` };
    default:
      return { title: 'Time to review!', body: `Remember: ${title}` };
  }
}

export function notificationIdFor(informationId: number): string {
  return `info-${informationId}`;
}

/** Extracts the information id from notification data, or null if absent/invalid. */
export function informationIdFromData(data: Record<string, unknown> | undefined): number | null {
  const raw = data?.informationId;
  const id = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}
