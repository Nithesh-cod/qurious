/**
 * Modules — the structure the Learn page is organised around.
 *
 * A flat list of lessons tells a learner nothing about where they are or what comes
 * next. A module is a small, finishable unit: a handful of lessons on one idea, then a
 * short check, then a badge. Finishing something is what keeps people going, so the
 * badge is only awarded when both halves are done — every lesson read, and the check
 * passed. Reading alone does not earn it.
 *
 * Like the lessons themselves this is data, not code. Adding a module is adding an
 * entry here; no component needs to change.
 */

import { ALL_LESSONS, QUIZZES, type Lesson, type QuizItem } from './curriculum';

export interface Badge {
  id: string;
  /** Shown on the badge itself. Kept to one or two glyphs so it reads at 40px. */
  emoji: string;
  name: string;
  /** What the learner actually proved by earning it. */
  earnedFor: string;
}

export interface Module {
  id: string;
  title: string;
  /** One line, plain language: what you will be able to do after this. */
  blurb: string;
  /** Lesson ids, in teaching order. */
  lessons: string[];
  /** Concepts the end-of-module check draws its questions from. */
  concepts: string[];
  /** How many questions the check asks, and how many must be right to pass. */
  check: { ask: number; pass: number };
  badge: Badge;
}

export const MODULES: Module[] = [
  {
    id: 'foundations',
    title: 'Foundations',
    blurb: 'What a qubit actually is, why measuring changes it, and how to picture one.',
    lessons: ['qubits', 'superposition', 'measurement', 'bloch'],
    concepts: ['qubit', 'superposition', 'measurement', 'bloch'],
    check: { ask: 4, pass: 3 },
    badge: {
      id: 'badge-foundations', emoji: '🧭', name: 'Orientated',
      earnedFor: 'You can read a quantum state and say what measuring it would give.',
    },
  },
  {
    id: 'phase',
    title: 'Phase and interference',
    blurb: 'The part of a quantum state you cannot see — and why every speed-up depends on it.',
    lessons: ['phase', 'interference'],
    concepts: ['phase', 'interference'],
    check: { ask: 4, pass: 3 },
    badge: {
      id: 'badge-phase', emoji: '🌊', name: 'Wave Reader',
      earnedFor: 'You can explain why two paths to the same answer can cancel out.',
    },
  },
  {
    id: 'entanglement',
    title: 'Two qubits together',
    blurb: 'Controlled gates, Bell states, and correlations neither qubit can explain alone.',
    lessons: ['entanglement', 'ghz', 'superdense', 'teleportation'],
    concepts: ['entanglement'],
    check: { ask: 3, pass: 2 },
    badge: {
      id: 'badge-entanglement', emoji: '🔗', name: 'Entangler',
      earnedFor: 'You can build a Bell state and say why its qubits have no state of their own.',
    },
  },
  {
    id: 'algorithms',
    title: 'Quantum algorithms',
    blurb: 'Putting it together: how arranging interference turns into a real speed-up.',
    lessons: ['oracles', 'deutsch', 'bernstein-vazirani', 'grover'],
    concepts: ['algorithms'],
    check: { ask: 3, pass: 2 },
    badge: {
      id: 'badge-algorithms', emoji: '🎯', name: 'Amplifier',
      earnedFor: 'You can trace how an algorithm pushes amplitude onto the right answer.',
    },
  },
  {
    id: 'fourier',
    title: 'Fourier and phase estimation',
    blurb: 'The machinery underneath factoring, chemistry and linear solvers.',
    lessons: ['qft', 'phase-estimation'],
    concepts: ['algorithms', 'phase'],
    check: { ask: 3, pass: 2 },
    badge: {
      id: 'badge-fourier', emoji: '🔭', name: 'Phase Finder',
      earnedFor: 'You can explain what phase estimation measures and why precision costs depth.',
    },
  },
];

/** Lessons in a module, in order, skipping ids that no longer exist. */
export function lessonsOf(m: Module): Lesson[] {
  return m.lessons
    .map(id => ALL_LESSONS.find(l => l.id === id))
    .filter((l): l is Lesson => !!l);
}

/** The pool the end-of-module check draws from. */
export function checkPool(m: Module): QuizItem[] {
  return QUIZZES.filter(q => m.concepts.includes(q.concept));
}

/**
 * Deterministic per-module question set: the same learner sees the same check, so a
 * retry is the same test rather than an easier one.
 */
export function checkQuestions(m: Module): QuizItem[] {
  return checkPool(m).slice(0, m.check.ask);
}

export const moduleOf = (lessonId: string): Module | undefined =>
  MODULES.find(m => m.lessons.includes(lessonId));

export interface ModuleProgress {
  lessonsDone: number;
  lessonsTotal: number;
  /** Right answers on this module's check questions. */
  checkRight: number;
  checkTotal: number;
  checkPassed: boolean;
  /** Both halves done. */
  earned: boolean;
  /** 0..1, weighted so lessons are most of it and the check completes it. */
  percent: number;
}

export function moduleProgress(
  m: Module,
  lessonsDone: string[],
  quizAnswers: Record<string, boolean>
): ModuleProgress {
  const lessons = lessonsOf(m);
  const doneCount = lessons.filter(l => lessonsDone.includes(l.id)).length;
  const qs = checkQuestions(m);
  const right = qs.filter(q => quizAnswers[q.id] === true).length;
  const allRead = lessons.length > 0 && doneCount === lessons.length;
  const passed = qs.length > 0 && right >= Math.min(m.check.pass, qs.length);
  const lessonPart = lessons.length ? doneCount / lessons.length : 0;
  const checkPart = qs.length ? right / qs.length : 0;
  return {
    lessonsDone: doneCount,
    lessonsTotal: lessons.length,
    checkRight: right,
    checkTotal: qs.length,
    checkPassed: passed,
    earned: allRead && passed,
    percent: Math.round((lessonPart * 0.7 + checkPart * 0.3) * 100),
  };
}

export function earnedBadges(
  lessonsDone: string[],
  quizAnswers: Record<string, boolean>
): Badge[] {
  return MODULES
    .filter(m => moduleProgress(m, lessonsDone, quizAnswers).earned)
    .map(m => m.badge);
}

/** Lessons that belong to no module yet — shown separately so nothing goes missing. */
export function unmoduledLessons(): Lesson[] {
  const claimed = new Set(MODULES.flatMap(m => m.lessons));
  return ALL_LESSONS.filter(l => !claimed.has(l.id));
}
