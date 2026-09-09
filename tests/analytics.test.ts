/**
 * The instrumentation, and the promises it makes.
 *
 * Two kinds of assertion. The arithmetic ones are ordinary. The ones that matter are the
 * privacy properties, because those are what make this shippable in an app whose pitch is
 * "no account, works offline": it must record nothing without consent, and it must have
 * nowhere to send anything even if it did.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  track, loadEvents, clearEvents, summarise, exportEvents,
  analyticsEnabled, setAnalyticsEnabled, startTiming, endTiming,
} from '../src/core/analytics';

/** A localStorage that exists only for this test file. */
function memoryStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  clearEvents();
});

describe('consent gates everything', () => {
  it('is off until switched on', () => {
    expect(analyticsEnabled()).toBe(false);
  });

  it('records nothing at all while off', () => {
    track('lesson_open', 'qubits');
    track('challenge_pass', 'ch-bell');
    expect(loadEvents()).toEqual([]);
  });

  it('records once switched on', () => {
    setAnalyticsEnabled(true);
    track('lesson_open', 'qubits');
    expect(loadEvents().map(e => e.name)).toEqual(['lesson_open']);
  });

  it('switching off erases what was already collected', () => {
    // Withdrawing consent has to mean the data goes, not that collection merely pauses.
    setAnalyticsEnabled(true);
    track('lesson_open', 'qubits');
    expect(loadEvents()).toHaveLength(1);
    setAnalyticsEnabled(false);
    expect(loadEvents()).toEqual([]);
  });
});

describe('nothing leaves the device', () => {
  it('the module makes no network call of any kind', async () => {
    // The point of local-only analytics is that there is nowhere for data to go. If a
    // fetch, an endpoint or a beacon ever appears in this file, this test should be the
    // thing that objects.
    const src = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../src/core/analytics.ts', import.meta.url), 'utf8'));
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest|sendBeacon|navigator\.connection/);
    expect(src).not.toMatch(/https?:\/\//);
  });

  it('records no free text a learner typed', () => {
    setAnalyticsEnabled(true);
    track('tutor_ask', 'asked');
    const e = loadEvents()[0];
    // Only the event name, a subject id, a duration and a timestamp exist as fields.
    expect(Object.keys(e).sort()).toEqual(['at', 'name', 'subject']);
  });
});

describe('timing', () => {
  it('records a span between start and end', () => {
    setAnalyticsEnabled(true);
    startTiming('l:qubits');
    endTiming('l:qubits', 'lesson_complete', 'qubits');
    const e = loadEvents()[0];
    expect(e.name).toBe('lesson_complete');
    expect(typeof e.ms).toBe('number');
    expect(e.ms).toBeGreaterThanOrEqual(0);
  });

  it('drops an implausibly long span rather than reporting it', () => {
    // A learner who opens a lesson and returns tomorrow did not spend nineteen hours on
    // it, and one such number ruins a median. No data beats wrong data.
    setAnalyticsEnabled(true);
    const realNow = Date.now;
    let t = 1_000_000;
    Date.now = () => t;
    startTiming('l:long');
    t += 5 * 60 * 60 * 1000;
    endTiming('l:long', 'lesson_complete', 'long');
    Date.now = realNow;
    expect(loadEvents()).toEqual([]);
  });

  it('ignores an end with no matching start', () => {
    setAnalyticsEnabled(true);
    endTiming('never-started', 'lesson_complete', 'x');
    expect(loadEvents()).toEqual([]);
  });
});

describe('summary', () => {
  beforeEach(() => setAnalyticsEnabled(true));

  it('is empty and null rather than zero when there is no data', () => {
    const s = summarise([]);
    expect(s.events).toBe(0);
    // Null, not 0 — a completion rate of zero and no data at all are different claims.
    expect(s.lessonCompletionRate).toBeNull();
    expect(s.medianLessonMs).toBeNull();
  });

  it('computes completion and pass rates', () => {
    track('lesson_open', 'a'); track('lesson_open', 'b');
    track('lesson_complete', 'a');
    track('challenge_open', 'c1'); track('challenge_open', 'c2');
    track('challenge_pass', 'c1');
    const s = summarise();
    expect(s.lessonCompletionRate).toBeCloseTo(0.5, 9);
    expect(s.challengePassRate).toBeCloseTo(0.5, 9);
  });

  it('ranks drop-off by the gap between opened and completed', () => {
    for (let i = 0; i < 3; i++) track('lesson_open', 'hard');
    track('lesson_open', 'easy');
    track('lesson_complete', 'easy');
    const s = summarise();
    expect(s.dropOff[0].subject).toBe('hard');
    expect(s.dropOff[0].opened).toBe(3);
    expect(s.dropOff[0].completed).toBe(0);
    // 'easy' was completed as often as it was opened, so it is not a drop-off point.
    expect(s.dropOff.find(d => d.subject === 'easy')).toBeUndefined();
  });

  it('exports valid JSON carrying both the summary and the raw events', () => {
    track('lesson_open', 'a');
    const parsed = JSON.parse(exportEvents());
    expect(parsed.events).toHaveLength(1);
    expect(parsed.summary.events).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
  });
});
