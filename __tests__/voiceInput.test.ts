import { parseTaskList } from '../src/services/dayPlanner';
import { speechToTaskLines } from '../src/services/voiceInput';

describe('voice input → to-do lines', () => {
  it('splits a French sentence into tasks and understands spoken durations', () => {
    const lines = speechToTaskLines("sport une heure puis appeler Ahmed un quart d'heure, réunion à 14h ensuite lire le Coran une demi-heure");
    expect(lines).toEqual(['Sport 1 heure', 'Appeler Ahmed 15 minutes', 'Réunion à 14h', 'Lire le Coran 30 minutes']);
    expect(parseTaskList(lines.join('\n')).map(t => [t.title, t.durationMin, t.fixedStartMin])).toEqual([
      ['Sport', 60, null],
      ['Appeler Ahmed', 15, null],
      ['Réunion', 30, 14 * 60],
      ['Lire le Coran', 30, null],
    ]);
  });

  it('handles English and "important"', () => {
    expect(speechToTaskLines('important: finish the report two hours then gym an hour and a half.')).toEqual([
      '!Finish the report 2 hours',
      'Gym 1h30',
    ]);
  });

  it('ignores empty input', () => {
    expect(speechToTaskLines('  ')).toEqual([]);
  });
});
