/**
 * "Share to My Knowledge Reminder": text or a link shared from another app
 * (Instagram, YouTube, Chrome, WhatsApp...) becomes a pre-filled draft in the Add form.
 *
 * Android side: MainActivity converts the ACTION_SEND intent into an internal
 * myknowledgereminder://share?text=...&subject=... link, received here through Linking.
 * Nothing is saved automatically: the user reviews the draft and taps Save.
 */
import { Linking } from 'react-native';
import { MAX_CONTENT_LENGTH, MAX_SOURCE_LENGTH, MAX_TITLE_LENGTH } from '../constants';
import { openAlarm, openSharedDraft } from '../navigation/navigationRef';
import { recognizeText } from '../native/mkrNative';
import { logError } from '../utils/errors';

export interface SharedDraft {
  title: string;
  content: string;
  source: string | null;
  /** 'image' when the text was read from a shared screenshot (OCR). */
  origin?: 'text' | 'image';
  /** Shared screenshot (content://), kept as the item's photo. */
  imageUri?: string;
}

const SHARE_PREFIX = 'myknowledgereminder://share';
const URL_PATTERN = /https?:\/\/[^\s<>"]+/i;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Reads text/subject from an internal share link; null for any other URL. */
export function parseShareUrl(url: string | null | undefined): { text: string; subject: string | null } | null {
  const shared = parseShareParams(url);
  const text = (shared?.text ?? '').trim();
  return text ? { text, subject: shared?.subject?.trim() || null } : null;
}

/** Image (content:// URI) shared from another app, or null. */
export function parseSharedImage(url: string | null | undefined): string | null {
  const image = parseShareParams(url)?.image?.trim();
  return image && image.startsWith('content://') ? image : null;
}

function parseShareParams(url: string | null | undefined): Record<string, string> | null {
  if (!url || !url.toLowerCase().startsWith(SHARE_PREFIX)) {
    return null;
  }
  const query = url.split('?')[1] ?? '';
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) {
      params[safeDecode(key)] = safeDecode(rest.join('='));
    }
  }
  return params;
}

/** Draft built from the text read in a screenshot. */
export function buildDraftFromImageText(text: string): SharedDraft {
  const cleaned = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) {
    return { title: 'Screenshot', content: '', source: null, origin: 'image' };
  }
  return { ...buildDraftFromShare(cleaned), origin: 'image' };
}

async function openImageDraft(uri: string): Promise<void> {
  try {
    openSharedDraft({ ...buildDraftFromImageText(await recognizeText(uri)), imageUri: uri });
  } catch (error) {
    logError('share:ocr', error);
    openSharedDraft({ title: 'Screenshot', content: '', source: null, origin: 'image', imageUri: uri });
  }
}

function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#:]+)/i.exec(url);
  return match ? match[1].toLowerCase().replace(/^(www|m)\./, '') : '';
}

/** Readable default title from the shared link, e.g. "Instagram reel". */
export function titleFromLink(url: string): string {
  const host = hostOf(url);
  if (host.endsWith('instagram.com')) {
    if (/\/(reel|reels)\//i.test(url)) {
      return 'Instagram reel';
    }
    return 'Instagram post';
  }
  if (host.endsWith('youtube.com') || host === 'youtu.be') {
    return /\/shorts\//i.test(url) ? 'YouTube short' : 'YouTube video';
  }
  if (host.endsWith('tiktok.com')) {
    return 'TikTok video';
  }
  if (host === 'x.com' || host.endsWith('twitter.com')) {
    return 'Post on X';
  }
  if (host.endsWith('facebook.com') || host === 'fb.watch') {
    return 'Facebook post';
  }
  return host ? `Link from ${host}` : 'Shared note';
}

/** Builds the Add-form draft: link → Source, remaining text → Content, best-effort Title. */
export function buildDraftFromShare(text: string, subject: string | null = null): SharedDraft {
  const trimmed = text.trim();
  const match = URL_PATTERN.exec(trimmed);
  // Drop punctuation that commonly sticks to links at the end of a sentence.
  const link = match ? match[0].replace(/[).,;!?'"]+$/, '') : null;
  const source = link && link.length <= MAX_SOURCE_LENGTH ? link : null;

  // Remove the link from the text only when it went to Source.
  const rest = (source ? trimmed.replace(match![0], ' ') : trimmed)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const firstLine = rest.split('\n')[0]?.trim() ?? '';
  const title = subject?.trim() || (firstLine && firstLine.length <= 80 ? firstLine : '') ||
    (link ? titleFromLink(link) : truncate(firstLine, 80)) || 'Shared note';

  return {
    title: truncate(title, MAX_TITLE_LENGTH),
    // If the first line became the title, do not repeat it in the content.
    content: truncate(title === firstLine ? rest.slice(firstLine.length).trim() : rest, MAX_CONTENT_LENGTH),
    source,
  };
}

/** Opens the Add form with a draft when `url` is a share link. Returns true if handled. */
/** myknowledgereminder://alarm?informationId=..&planTaskId=..&alarmId=.. (set by MainActivity). */
export function parseAlarmUrl(
  url: string | null | undefined,
): { informationId?: number; planTaskId?: number; notificationId?: string } | null {
  if (!url || !url.toLowerCase().startsWith('myknowledgereminder://alarm')) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const pair of (url.split('?')[1] ?? '').split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) {
      params[key] = decodeURIComponent(rest.join('='));
    }
  }
  const informationId = Number(params.informationId);
  const planTaskId = Number(params.planTaskId);
  const result = {
    informationId: Number.isInteger(informationId) && informationId > 0 ? informationId : undefined,
    planTaskId: Number.isInteger(planTaskId) && planTaskId > 0 ? planTaskId : undefined,
    notificationId: params.alarmId || undefined,
  };
  return result.informationId || result.planTaskId || result.notificationId ? result : null;
}

export function handleIncomingUrl(url: string | null | undefined): boolean {
  const alarm = parseAlarmUrl(url);
  if (alarm) {
    openAlarm(alarm);
    return true;
  }
  const image = parseSharedImage(url);
  if (image) {
    openImageDraft(image);
    return true;
  }
  const shared = parseShareUrl(url);
  if (!shared) {
    return false;
  }
  openSharedDraft(buildDraftFromShare(shared.text, shared.subject));
  return true;
}

/** Handles a share that launched the app, then listens for shares while it runs. */
export function subscribeToSharedContent(): () => void {
  Linking.getInitialURL()
    .then(handleIncomingUrl)
    .catch(error => logError('share:initial', error));
  const subscription = Linking.addEventListener('url', ({ url }) => {
    try {
      handleIncomingUrl(url);
    } catch (error) {
      logError('share:url', error);
    }
  });
  return () => subscription.remove();
}
