import { openSharedDraft } from '../src/navigation/navigationRef';
import {
  buildDraftFromShare,
  handleIncomingUrl,
  parseShareUrl,
  titleFromLink,
} from '../src/services/shareIntake';

jest.mock('../src/navigation/navigationRef', () => ({ openSharedDraft: jest.fn() }));

const shareUrl = (text: string, subject?: string) =>
  `myknowledgereminder://share?text=${encodeURIComponent(text)}` +
  (subject ? `&subject=${encodeURIComponent(subject)}` : '');

describe('share from other apps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parses the internal share link built by MainActivity', () => {
    expect(parseShareUrl(shareUrl('Hello & welcome = 100%', 'Title'))).toEqual({
      text: 'Hello & welcome = 100%',
      subject: 'Title',
    });
    expect(parseShareUrl('https://instagram.com/reel/abc')).toBeNull();
    expect(parseShareUrl('myknowledgereminder://share?text=')).toBeNull();
    expect(parseShareUrl(null)).toBeNull();
  });

  it('turns an Instagram reel link into a draft with the link as source', () => {
    expect(buildDraftFromShare('https://www.instagram.com/reel/C9xYz123/?igsh=MTc4')).toEqual({
      title: 'Instagram reel',
      content: '',
      source: 'https://www.instagram.com/reel/C9xYz123/?igsh=MTc4',
    });
  });

  it('uses the shared text: first line as title, the rest as content', () => {
    const draft = buildDraftFromShare(
      'Ayat al-Kursi benefits\nRead it after every prayer.\nhttps://youtu.be/abc123.',
    );
    expect(draft).toEqual({
      title: 'Ayat al-Kursi benefits',
      content: 'Read it after every prayer.',
      source: 'https://youtu.be/abc123',
    });
  });

  it('prefers the subject (e.g. page title from Chrome) as title', () => {
    expect(buildDraftFromShare('https://learn.microsoft.com/azure/devops/artifacts', 'Azure Artifacts docs')).toEqual({
      title: 'Azure Artifacts docs',
      content: '',
      source: 'https://learn.microsoft.com/azure/devops/artifacts',
    });
  });

  it('names common platforms', () => {
    expect(titleFromLink('https://www.instagram.com/p/xyz/')).toBe('Instagram post');
    expect(titleFromLink('https://youtube.com/shorts/xyz')).toBe('YouTube short');
    expect(titleFromLink('https://vm.tiktok.com/xyz')).toBe('TikTok video');
    expect(titleFromLink('https://m.example.org/a')).toBe('Link from example.org');
  });

  it('keeps plain text without a link as a note', () => {
    expect(buildDraftFromShare('Bonjour = hello')).toEqual({
      title: 'Bonjour = hello',
      content: '',
      source: null,
    });
  });

  it('opens the Add form only for share links', () => {
    expect(handleIncomingUrl('https://example.com')).toBe(false);
    expect(handleIncomingUrl(shareUrl('https://www.instagram.com/reel/abc/'))).toBe(true);
    expect(openSharedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Instagram reel', source: 'https://www.instagram.com/reel/abc/' }),
    );
  });
});
