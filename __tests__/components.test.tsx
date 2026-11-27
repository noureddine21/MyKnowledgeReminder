import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { InformationCard } from '../src/components/InformationCard';
import { ReminderEditor } from '../src/components/ReminderEditor';
import type { InformationItem } from '../src/models';
import { ThemeProvider } from '../src/theme';

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();

const item: InformationItem = {
  id: 1,
  title: 'Ayat al-Kursi',
  content: 'Allah! There is no deity except Him, the Ever-Living…',
  categoryId: 1,
  source: '2:255',
  createdAt: at(2026, 1, 1),
  updatedAt: at(2026, 1, 1),
  category: { id: 1, name: 'Quran', color: '#0E9F6E', icon: 'book-open-page-variant', isDefault: true, createdAt: 0 },
  reminder: {
    id: 1,
    informationId: 1,
    scheduledAt: at(2026, 1, 11),
    frequency: 'once',
    repeatInterval: 1,
    alarm: false,
    isActive: true,
    notificationId: 'info-1',
    spacedStep: 0,
    spacedBaseAt: null,
    lastReviewedAt: null,
    createdAt: 0,
    updatedAt: 0,
  },
};

function textOf(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe('components', () => {
  it('renders an information card with category and next review', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider mode="dark">
          <InformationCard item={item} now={at(2026, 1, 10, 12)} onPress={jest.fn()} />
        </ThemeProvider>,
      );
    });
    const text = textOf(renderer);
    expect(text).toContain('Ayat al-Kursi');
    expect(text).toContain('Quran');
    expect(text).toContain('Tomorrow, 09:00');
  });

  it('shows smart schedule dates in the reminder editor', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider mode="light">
          <ReminderEditor
            value={{ enabled: true, frequency: 'spaced', scheduledAt: at(2026, 1, 10, 9) }}
            onChange={jest.fn()}
            createdAt={at(2026, 1, 10, 8)}
            intervals={[1, 3, 7, 30]}
            now={at(2026, 1, 10, 12)}
          />
        </ThemeProvider>,
      );
    });
    const text = textOf(renderer);
    expect(text).toContain('11 Jan 2026');
    expect(text).toContain('9 Feb 2026');
  });
});
