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
import { openSharedDraft } from '../navigation/navigationRef';
import { logError } from '../utils/errors';

export interface SharedDraft {
  title: string;
  content: string;
  source: string | null;
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
  const text = (params.text ?? '').trim();
  if (!text) {
    return null;
  }
  return { text, subject: params.subject?.trim() || null };
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
export function handleIncomingUrl(url: string | null | undefined): boolean {
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
