/**
 * Points, streaks and tiers.
 *
 * The scoring is derived from progress rather than stored, which removes a whole class
 * of drift but makes the derivation itself the thing that has to be right. Streak
 * arithmetic in particular is easy to get subtly wrong around midnight and month
 * boundaries, and nobody notices until a learner loses a streak they had earned.
 */

import { describe, expect, it } from 'vitest';
import {
  POINTS, STREAK_CAP, tierOf, challengePoints, TIER_LABEL,
  streakLength, recordPractice, today, computeScore, levelFor, LEVELS,
} from '../src/core/points';
import { CHALLENGES } from '../src/content/curriculum';

describe('difficulty tiers', () => {
  it('gives every challenge a tier with a label', () => {
    for (const c of CHALLENGES) {
      const t = tierOf(c);
      expect(t, `${c.id} tier out of range`).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(4);
      expect(TIER_LABEL[t]).toBeTruthy();
    }
  });

  it('rates a one-gate exercise below a four-qubit one', () => {
    const flip = CHALLENGES.find(c => c.id === 'ch-flip');
    const ghz4 = CHALLENGES.find(c => c.id === 'ch-ghz4');
    if (flip && ghz4) expect(tierOf(flip)).toBeLessThan(tierOf(ghz4));
  });

  it('uses the whole range rather than collapsing to one tier', () => {
    const seen = new Set(CHALLENGES.map(tierOf));
    expect(seen.size, 'tiers should discriminate between challenges').toBeGreaterThanOrEqual(3);
  });

  it('pays more for a harder challenge', () => {
    const byTier = [...CHALLENGES].sort((a, b) => tierOf(a) - tierOf(b));
    expect(challengePoints(byTier[byTier.length - 1])).toBeGreaterThan(challengePoints(byTier[0]));
  });
});

describe('streaks', () => {
  const day = (iso: string) => iso;

  it('counts consecutive days ending today', () => {
    expect(streakLength([day('2026-03-01'), day('2026-03-02'), day('2026-03-03')], '2026-03-03')).toBe(3);
  });

  it('still counts a run that ended yesterday', () => {
    // A learner who has not practised yet today has not lost the streak they are about
    // to continue. Ending it at midnight punishes a day still in progress.
    expect(streakLength([day('2026-03-01'), day('2026-03-02')], '2026-03-03')).toBe(2);
  });

  it('breaks after a missed day', () => {
    expect(streakLength([day('2026-03-01'), day('2026-03-03')], '2026-03-05')).toBe(0);
    expect(streakLength([day('2026-03-01'), day('2026-03-03')], '2026-03-03')).toBe(1);
  });

  it('handles a month boundary', () => {
    expect(streakLength([day('2026-02-27'), day('2026-02-28'), day('2026-03-01')], '2026-03-01')).toBe(3);
  });

  it('handles a leap day', () => {
    // 2028 is a leap year, so 29 February exists and the run must cross it.
    expect(streakLength([day('2028-02-28'), day('2028-02-29'), day('2028-03-01')], '2028-03-01')).toBe(3);
  });

  it('is empty when nothing has been done', () => {
    expect(streakLength([], '2026-03-03')).toBe(0);
  });

  it('records a day once, however many times it is called', () => {
    const a = recordPractice([], '2026-03-03');
    const b = recordPractice(a, '2026-03-03');
    expect(b).toEqual(['2026-03-03']);
  });

  it('produces a sane stamp for the real clock', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the score', () => {
  const base = {
    lessonsDone: [] as string[],
    quizAnswers: {} as Record<string, boolean>,
    solved: [] as string[],
    practiceDays: [] as string[],
    challenges: CHALLENGES,
    topicBadges: 0,
    moduleBadges: 0,
  };

  it('is zero for a learner who has done nothing', () => {
    expect(computeScore(base, '2026-03-03').total).toBe(0);
  });

  it('counts only correct quiz answers', () => {
    const s = computeScore({ ...base, quizAnswers: { a: true, b: false, c: true } }, '2026-03-03');
    expect(s.total).toBe(2 * POINTS.quizAnswer);
  });

  it('adds up every source', () => {
    const s = computeScore({
      ...base,
      lessonsDone: ['x', 'y'],
      quizAnswers: { a: true },
      topicBadges: 1,
      moduleBadges: 1,
      practiceDays: ['2026-03-02', '2026-03-03'],
    }, '2026-03-03');
    const expected =
      2 * POINTS.lesson + POINTS.quizAnswer + POINTS.topicBadge + POINTS.moduleBadge
      + 2 * POINTS.streakDay;
    expect(s.total).toBe(expected);
    expect(s.streak).toBe(2);
    expect(s.breakdown.reduce((n, b) => n + b.points, 0)).toBe(s.total);
  });

  it('caps the streak bonus so it cannot run away', () => {
    const days: string[] = [];
    for (let d = 1; d <= 28; d++) days.push(`2026-03-${String(d).padStart(2, '0')}`);
    const s = computeScore({ ...base, practiceDays: days }, '2026-03-28');
    expect(s.streak).toBe(28);
    const streakLine = s.breakdown.find(b => b.label === 'Practice streak')!;
    expect(streakLine.points).toBe(STREAK_CAP * POINTS.streakDay);
  });

  it('scores solved challenges by their tier', () => {
    const hard = [...CHALLENGES].sort((a, b) => tierOf(b) - tierOf(a))[0];
    const easy = [...CHALLENGES].sort((a, b) => tierOf(a) - tierOf(b))[0];
    const hardScore = computeScore({ ...base, solved: [hard.id] }, '2026-03-03').total;
    const easyScore = computeScore({ ...base, solved: [easy.id] }, '2026-03-03').total;
    expect(hardScore).toBeGreaterThan(easyScore);
  });
});

describe('levels', () => {
  it('starts at the first level and never goes backwards', () => {
    expect(levelFor(0).level.name).toBe(LEVELS[0].name);
    let last = -1;
    for (const total of [0, 100, 200, 600, 1200, 2500, 9999]) {
      const idx = LEVELS.findIndex(l => l.name === levelFor(total).level.name);
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });

  it('reports progress towards the next level, and tops out at the last', () => {
    const mid = levelFor(Math.round((LEVELS[0].at + LEVELS[1].at) / 2));
    expect(mid.progress).toBeGreaterThan(0);
    expect(mid.progress).toBeLessThan(1);
    const top = levelFor(999999);
    expect(top.next).toBeUndefined();
    expect(top.progress).toBe(1);
  });
});
