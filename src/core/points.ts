/**
 * Points, streaks and difficulty tiers.
 *
 * Deliberately *derived* rather than stored. The app already knows which lessons were
 * read, which quiz items were answered correctly and which challenges were solved; a
 * separate points ledger would be a second source of truth for the same facts, and the
 * two would drift the first time a write was missed. So the score is computed from the
 * progress that already exists, and the only thing actually recorded is the set of days
 * the learner practised — which nothing else knows.
 *
 * That choice has a real consequence worth stating: points cannot be awarded for
 * something the learner model does not already track. If a new activity should score,
 * it has to be recorded as progress first. That is the right way round.
 */

import type { Challenge } from './grade';

/** What each thing is worth. Kept in one place so the economy can be read at a glance. */
export const POINTS = {
  lesson: 10,
  quizAnswer: 15,
  topicBadge: 50,
  moduleBadge: 120,
  /** Per challenge, multiplied by its tier. */
  challengeBase: 25,
  /** Added per day of the current streak, capped by STREAK_CAP. */
  streakDay: 5,
} as const;

export const STREAK_CAP = 14;

// ---------------------------------------------------------------- difficulty tiers

export type Tier = 1 | 2 | 3 | 4;

export const TIER_LABEL: Record<Tier, string> = {
  1: 'Warm-up',
  2: 'Core',
  3: 'Stretch',
  4: 'Hard',
};

/**
 * A challenge's tier, derived from what it actually demands.
 *
 * Authored tiers go stale the moment a challenge is edited, and nobody remembers to
 * update them. Reading the tier from the solution's own shape — how many qubits, how
 * many gates, whether it needs entanglement or a parametric angle — means the label
 * cannot disagree with the exercise.
 */
export function tierOf(c: Challenge): Tier {
  const ops = c.solution.ops;
  const qubits = c.solution.qubits;
  const gates = ops.length;
  const multi = ops.some(o => o.qubits.length > 1);
  const parametric = ops.some(o => (o.params?.length ?? 0) > 0);

  let score = 0;
  if (qubits >= 3) score += 1;
  if (qubits >= 4) score += 1;
  if (gates >= 5) score += 1;
  if (gates >= 9) score += 1;
  if (multi) score += 1;
  if (parametric) score += 1;

  if (score <= 1) return 1;
  if (score <= 3) return 2;
  if (score <= 4) return 3;
  return 4;
}

export const challengePoints = (c: Challenge): number => POINTS.challengeBase * tierOf(c);

// ---------------------------------------------------------------- streaks

/** An ISO day stamp, local time — the unit a streak is counted in. */
export const today = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dayBefore = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - 1);
  return today(t);
};

/**
 * Length of the run of consecutive days ending today or yesterday.
 *
 * Ending *yesterday* still counts, so a learner who has not practised yet today has not
 * already lost the streak they are about to continue. Punishing someone at midnight for
 * a day that is still in progress is how streaks stop motivating anyone.
 */
export function streakLength(days: string[], now = today()): number {
  if (!days.length) return 0;
  const set = new Set(days);
  let cursor = set.has(now) ? now : dayBefore(now);
  if (!set.has(cursor)) return 0;
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = dayBefore(cursor);
  }
  return n;
}

/** Record that the learner did something today. Idempotent. */
export function recordPractice(days: string[], now = today()): string[] {
  return days.includes(now) ? days : [...days, now];
}

// ---------------------------------------------------------------- the score

export interface ScoreInput {
  lessonsDone: string[];
  quizAnswers: Record<string, boolean>;
  solved: string[];
  practiceDays: string[];
  challenges: Challenge[];
  topicBadges: number;
  moduleBadges: number;
}

export interface Score {
  total: number;
  streak: number;
  breakdown: { label: string; points: number; detail: string }[];
}

export function computeScore(i: ScoreInput, now = today()): Score {
  const rightAnswers = Object.values(i.quizAnswers).filter(Boolean).length;
  const solvedChallenges = i.challenges.filter(c => i.solved.includes(c.id));
  const challengeTotal = solvedChallenges.reduce((sum, c) => sum + challengePoints(c), 0);
  const streak = streakLength(i.practiceDays, now);
  const streakPoints = Math.min(streak, STREAK_CAP) * POINTS.streakDay;

  const breakdown = [
    {
      label: 'Lessons read',
      points: i.lessonsDone.length * POINTS.lesson,
      detail: `${i.lessonsDone.length} × ${POINTS.lesson}`,
    },
    {
      label: 'Quiz answers right',
      points: rightAnswers * POINTS.quizAnswer,
      detail: `${rightAnswers} × ${POINTS.quizAnswer}`,
    },
    {
      label: 'Challenges solved',
      points: challengeTotal,
      detail: `${solvedChallenges.length} solved, scored by tier`,
    },
    {
      label: 'Topic badges',
      points: i.topicBadges * POINTS.topicBadge,
      detail: `${i.topicBadges} × ${POINTS.topicBadge}`,
    },
    {
      label: 'Module badges',
      points: i.moduleBadges * POINTS.moduleBadge,
      detail: `${i.moduleBadges} × ${POINTS.moduleBadge}`,
    },
    {
      label: 'Practice streak',
      points: streakPoints,
      detail: streak > 0 ? `${streak} day${streak === 1 ? '' : 's'} running` : 'no streak yet',
    },
  ];

  return {
    total: breakdown.reduce((sum, b) => sum + b.points, 0),
    streak,
    breakdown,
  };
}

// ---------------------------------------------------------------- levels

export interface Level { name: string; at: number }

/**
 * Named levels, so a number has a meaning attached to it.
 *
 * Thresholds are spaced so the first two arrive quickly — a learner who finishes one
 * topic should already have moved — and later ones take real work.
 */
export const LEVELS: Level[] = [
  { name: 'Curious', at: 0 },
  { name: 'Apprentice', at: 150 },
  { name: 'Circuit Builder', at: 500 },
  { name: 'Interferer', at: 1000 },
  { name: 'Algorithmist', at: 2000 },
  { name: 'Quantum Native', at: 3500 },
];

export function levelFor(total: number): { level: Level; next?: Level; progress: number } {
  let index = 0;
  for (let k = 0; k < LEVELS.length; k++) if (total >= LEVELS[k].at) index = k;
  const level = LEVELS[index];
  const next = LEVELS[index + 1];
  const progress = next
    ? Math.min(1, (total - level.at) / (next.at - level.at))
    : 1;
  return { level, next, progress };
}
