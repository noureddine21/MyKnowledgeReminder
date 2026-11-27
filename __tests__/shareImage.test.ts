import { openSharedDraft } from '../src/navigation/navigationRef';
import { recognizeText } from '../src/native/mkrNative';
import { buildDraftFromImageText, handleIncomingUrl, parseSharedImage } from '../src/services/shareIntake';

jest.mock('../src/navigation/navigationRef', () => ({ openSharedDraft: jest.fn() }));
jest.mock('../src/native/mkrNative', () => ({ recognizeText: jest.fn() }));

const imageUrl = (uri: string) => `myknowledgereminder://share?image=${encodeURIComponent(uri)}`;
const flush = () => new Promise<void>(resolve => setImmediate(() => resolve()));

describe('shared screenshots (OCR)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only accepts content:// images', () => {
    expect(parseSharedImage(imageUrl('content://media/external/images/1'))).toBe('content://media/external/images/1');
    expect(parseSharedImage(imageUrl('file:///sdcard/x.png'))).toBeNull();
    expect(parseSharedImage('myknowledgereminder://share?text=hi')).toBeNull();
  });

  it('builds a draft from the recognized text', () => {
    expect(buildDraftFromImageText('3 tips for Azure DevOps\nUse feeds\nUse   upstream sources\n\n\n\nEnd')).toEqual({
      title: '3 tips for Azure DevOps',
      content: 'Use feeds\nUse upstream sources\n\nEnd',
      source: null,
      origin: 'image',
    });
    expect(buildDraftFromImageText('   ')).toEqual({ title: 'Screenshot', content: '', source: null, origin: 'image' });
  });

  it('reads the image and opens a pre-filled form', async () => {
    (recognizeText as jest.Mock).mockResolvedValue('Bonjour = Hello\nMerci = Thank you');
    expect(handleIncomingUrl(imageUrl('content://media/1'))).toBe(true);
    await flush();
    expect(recognizeText).toHaveBeenCalledWith('content://media/1');
    expect(openSharedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Bonjour = Hello', content: 'Merci = Thank you', origin: 'image' }),
    );
  });

  it('still opens the form when the text cannot be read', async () => {
    (recognizeText as jest.Mock).mockRejectedValue(new Error('no model'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    handleIncomingUrl(imageUrl('content://media/2'));
    await flush();
    expect(openSharedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Screenshot', content: '', source: null, origin: 'image', imageUri: expect.any(String) }),
    );
  });
});
