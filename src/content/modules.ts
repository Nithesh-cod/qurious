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

/**
 * A topic groups the lesson units that teach one idea, and owns the quiz and badge for it.
 *
 * The layer exists because "module" was doing two jobs: naming a theme and being the unit
 * you finish. Five modules meant five badges across sixteen lessons, so a learner could
 * work for an hour and earn nothing. A topic is small enough to finish in a sitting.
 *
 * `prerequisites` is data rather than prose so the UI can act on it — nudge, order, or
 * soft-lock — instead of hoping the learner read a sentence.
 */
export interface Topic {
  id: string;
  title: string;
  /** One line, plain language. */
  blurb: string;
  /** Lesson ids in teaching order. These are the subtopic / lesson units. */
  lessons: string[];
  /** Concepts this topic's end-of-topic quiz draws from. */
  concepts: string[];
  /** Topic ids that should be finished first. Empty means it is an entry point. */
  prerequisites: string[];
  /** 1 (no background assumed) to 5 (builds on several topics). */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** How many questions the end-of-topic quiz asks, and how many must be right. */
  quiz: { ask: number; pass: number };
  badge: Badge;
  /**
   * Which later topics need this one. Stated on the prerequisite so a learner doing
   * algebra can see what it is for — the commonest reason people abandon Module 0.
   */
  neededFor?: string[];
}

export interface Module {
  id: string;
  title: string;
  /** One line, plain language: what you will be able to do after this. */
  blurb: string;
  /** Topics in teaching order. The lesson list below is derived from these. */
  topics: Topic[];
  /**
   * Lesson ids, in teaching order.
   *
   * Derived from `topics` by `withTopics()` rather than authored twice. Kept on the
   * module because the dashboard, the check and the progress helpers all read it, and
   * a second hand-maintained copy is a guaranteed drift.
   */
  lessons: string[];
  /** Module ids that should come first. */
  prerequisites: string[];
  /** Position in the beginner-to-advanced sequence. Module 0 is the maths. */
  order: number;
  /** Concepts the end-of-module check draws its questions from. */
  concepts: string[];
  /** How many questions the check asks, and how many must be right to pass. */
  check: { ask: number; pass: number };
  badge: Badge;
}

/** Build a module from its topics, deriving the flat lesson and concept lists. */
function withTopics(
  m: Omit<Module, 'lessons' | 'concepts'> & { concepts?: string[] }
): Module {
  const lessons = m.topics.flatMap(t => t.lessons);
  const concepts = m.concepts ?? [...new Set(m.topics.flatMap(t => t.concepts))];
  return { ...m, lessons, concepts };
}

const T = (t: Topic): Topic => t;

export const MODULES: Module[] = [
  // ============================================================ Module 0
  withTopics({
    id: 'prerequisites',
    title: 'Before you start: the maths',
    blurb: 'The four pieces of maths every quantum explanation leans on. Start here if any of it is new.',
    order: 0,
    prerequisites: [],
    check: { ask: 4, pass: 3 },
    badge: {
      id: 'badge-prerequisites', emoji: '🧱', name: 'Groundwork',
      earnedFor: 'You have the maths the rest of the course assumes.',
    },
    topics: [
      T({
        id: 'complex-numbers',
        title: 'Complex numbers',
        blurb: 'A second direction for numbers to point in, and why amplitudes need it.',
        lessons: ['pre-complex'],
        concepts: ['maths-complex'],
        prerequisites: [],
        difficulty: 1,
        quiz: { ask: 2, pass: 2 },
        neededFor: ['superposition-basics', 'phase-basics'],
        badge: {
          id: 'badge-complex', emoji: '🔢', name: 'Two Directions',
          earnedFor: 'You can read a complex number as a length and an angle.',
        },
      }),
      T({
        id: 'vectors',
        title: 'Vectors and vector spaces',
        blurb: 'A quantum state is a list of numbers. This is what the list means.',
        lessons: ['pre-vectors'],
        concepts: ['maths-vectors'],
        prerequisites: ['complex-numbers'],
        difficulty: 1,
        quiz: { ask: 2, pass: 2 },
        neededFor: ['superposition-basics', 'entanglement-basics'],
        badge: {
          id: 'badge-vectors', emoji: '📐', name: 'Vector Sense',
          earnedFor: 'You can say what a basis is and why the inner product matters.',
        },
      }),
      T({
        id: 'matrices',
        title: 'Matrices and unitary operations',
        blurb: 'Every gate is a matrix. Unitary is the property that makes it a legal one.',
        lessons: ['pre-matrices'],
        concepts: ['maths-matrices'],
        prerequisites: ['vectors'],
        difficulty: 2,
        quiz: { ask: 2, pass: 2 },
        neededFor: ['bloch-basics'],
        badge: {
          id: 'badge-matrices', emoji: '🗃', name: 'Operator',
          earnedFor: 'You can explain why every quantum gate must be reversible.',
        },
      }),
      T({
        id: 'probability',
        title: 'Probability and amplitudes',
        blurb: 'Why quantum probabilities are squares of something else — and what that buys.',
        lessons: ['pre-probability'],
        concepts: ['maths-probability'],
        prerequisites: ['complex-numbers'],
        difficulty: 1,
        quiz: { ask: 2, pass: 2 },
        neededFor: ['measurement-basics', 'interference-basics'],
        badge: {
          id: 'badge-probability', emoji: '🎲', name: 'Born Rule',
          earnedFor: 'You know that amplitudes add before they are squared.',
        },
      }),
      T({
        id: 'trigonometry',
        title: 'Angles and trigonometry',
        blurb: 'Optional. Needed to read the Bloch sphere and rotation gates precisely.',
        lessons: ['pre-trig'],
        concepts: ['maths-trig'],
        prerequisites: [],
        difficulty: 1,
        quiz: { ask: 1, pass: 1 },
        neededFor: ['bloch-basics'],
        badge: {
          id: 'badge-trig', emoji: '📏', name: 'Half Angle',
          earnedFor: 'You know why rotation gates use half the angle.',
        },
      }),
    ],
  }),

  // ============================================================ Module 1
  withTopics({
    id: 'foundations',
    title: 'Foundations',
    blurb: 'What a qubit actually is, why measuring changes it, and how to picture one.',
    order: 1,
    prerequisites: ['prerequisites'],
    check: { ask: 4, pass: 3 },
    badge: {
      id: 'badge-foundations', emoji: '🧭', name: 'Orientated',
      earnedFor: 'You can read a quantum state and say what measuring it would give.',
    },
    topics: [
      T({
        id: 'superposition-basics',
        title: 'Qubits and superposition',
        blurb: 'What ket zero and ket one mean, and what being between them really is.',
        lessons: ['qubits', 'superposition'],
        concepts: ['qubit', 'superposition'],
        prerequisites: ['complex-numbers', 'vectors'],
        difficulty: 2,
        quiz: { ask: 3, pass: 2 },
        badge: {
          id: 'badge-superposition', emoji: '🌀', name: 'In Between',
          earnedFor: 'You can explain why superposition is not the same as not knowing.',
        },
      }),
      T({
        id: 'measurement-basics',
        title: 'Measurement and collapse',
        blurb: 'Squaring the amplitude, and why one shot tells you almost nothing.',
        lessons: ['measurement'],
        concepts: ['measurement'],
        prerequisites: ['probability', 'superposition-basics'],
        difficulty: 2,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-measurement', emoji: '👁', name: 'Observer',
          earnedFor: 'You can predict what a run returns and why it takes many shots.',
        },
      }),
      T({
        id: 'bloch-basics',
        title: 'The Bloch sphere',
        blurb: 'One qubit as a point on a ball, and every gate as a rotation of it.',
        lessons: ['bloch'],
        concepts: ['bloch'],
        prerequisites: ['superposition-basics'],
        difficulty: 2,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-bloch', emoji: '🌍', name: 'Sphere Reader',
          earnedFor: 'You can locate a state on the sphere and say what a gate did to it.',
        },
      }),
    ],
  }),

  // ============================================================ Module 2
  withTopics({
    id: 'phase',
    title: 'Phase and interference',
    blurb: 'The part of a quantum state you cannot see — and why every speed-up depends on it.',
    order: 2,
    prerequisites: ['foundations'],
    check: { ask: 4, pass: 3 },
    badge: {
      id: 'badge-phase', emoji: '🌊', name: 'Wave Reader',
      earnedFor: 'You can explain why two paths to the same answer can cancel out.',
    },
    topics: [
      T({
        id: 'phase-basics',
        title: 'Phase',
        blurb: 'A real change that measurement alone cannot see.',
        lessons: ['phase'],
        concepts: ['phase'],
        prerequisites: ['complex-numbers', 'bloch-basics'],
        difficulty: 3,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-phase-topic', emoji: '🌑', name: 'Invisible Turn',
          earnedFor: 'You can say what a Z gate changes and what it does not.',
        },
      }),
      T({
        id: 'interference-basics',
        title: 'Interference',
        blurb: 'Amplitudes cancelling and reinforcing — the engine under every speed-up.',
        lessons: ['interference'],
        concepts: ['interference'],
        prerequisites: ['phase-basics', 'probability'],
        difficulty: 3,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-interference', emoji: '💥', name: 'Canceller',
          earnedFor: 'You can trace how wrong answers destroy each other.',
        },
      }),
    ],
  }),

  // ============================================================ Module 3
  withTopics({
    id: 'entanglement',
    title: 'Two qubits together',
    blurb: 'Controlled gates, Bell states, and correlations neither qubit can explain alone.',
    order: 3,
    prerequisites: ['phase'],
    check: { ask: 3, pass: 2 },
    badge: {
      id: 'badge-entanglement', emoji: '🔗', name: 'Entangler',
      earnedFor: 'You can build a Bell state and say why its qubits have no state of their own.',
    },
    topics: [
      T({
        id: 'entanglement-basics',
        title: 'Entanglement and Bell states',
        blurb: 'Why two qubits can share a state that neither one has.',
        lessons: ['entanglement', 'ghz'],
        concepts: ['entanglement'],
        prerequisites: ['vectors', 'measurement-basics'],
        difficulty: 3,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-bell', emoji: '🤝', name: 'Bell Ringer',
          earnedFor: 'You can build a Bell state and read why the spheres go empty.',
        },
      }),
      T({
        id: 'entanglement-protocols',
        title: 'Using entanglement',
        blurb: 'Superdense coding and teleportation — what entanglement is actually for.',
        lessons: ['superdense', 'teleportation'],
        concepts: ['entanglement'],
        prerequisites: ['entanglement-basics'],
        difficulty: 4,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-protocols', emoji: '📡', name: 'Sender',
          earnedFor: 'You can explain what teleportation moves and what it does not.',
        },
      }),
    ],
  }),

  // ============================================================ Module 4
  withTopics({
    id: 'algorithms',
    title: 'Quantum algorithms',
    blurb: 'Putting it together: how arranging interference turns into a real speed-up.',
    order: 4,
    prerequisites: ['entanglement'],
    check: { ask: 3, pass: 2 },
    badge: {
      id: 'badge-algorithms', emoji: '🎯', name: 'Amplifier',
      earnedFor: 'You can trace how an algorithm pushes amplitude onto the right answer.',
    },
    topics: [
      T({
        id: 'oracles-topic',
        title: 'Oracles and phase kickback',
        blurb: 'The one move every quantum algorithm is built on.',
        lessons: ['oracles', 'deutsch', 'bernstein-vazirani'],
        concepts: ['algorithms'],
        prerequisites: ['interference-basics'],
        difficulty: 4,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-oracles', emoji: '🔮', name: 'Kickback',
          earnedFor: 'You can explain how an answer gets written into a phase.',
        },
      }),
      T({
        id: 'search-topic',
        title: 'Grover search',
        blurb: 'Marking an answer with a phase, then turning phase into probability.',
        lessons: ['grover'],
        concepts: ['algorithms'],
        prerequisites: ['oracles-topic'],
        difficulty: 4,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-grover', emoji: '🔍', name: 'Searcher',
          earnedFor: 'You know why Grover is a quadratic and not an exponential speed-up.',
        },
      }),
    ],
  }),

  // ============================================================ Module 5
  withTopics({
    id: 'fourier',
    title: 'Fourier and phase estimation',
    blurb: 'The machinery underneath factoring, chemistry and linear solvers.',
    order: 5,
    prerequisites: ['algorithms'],
    check: { ask: 3, pass: 2 },
    badge: {
      id: 'badge-fourier', emoji: '🔭', name: 'Phase Finder',
      earnedFor: 'You can explain what phase estimation measures and why precision costs depth.',
    },
    topics: [
      T({
        id: 'qft-topic',
        title: 'The quantum Fourier transform',
        blurb: 'A change of view that turns periods into positions.',
        lessons: ['qft'],
        concepts: ['algorithms'],
        prerequisites: ['search-topic'],
        difficulty: 5,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-qft', emoji: '🎼', name: 'Transformer',
          earnedFor: 'You can say what the Fourier transform moves into the phases.',
        },
      }),
      T({
        id: 'qpe-topic',
        title: 'Phase estimation',
        blurb: 'Measuring an angle — the subroutine under factoring and chemistry.',
        lessons: ['phase-estimation'],
        concepts: ['algorithms', 'phase'],
        prerequisites: ['qft-topic'],
        difficulty: 5,
        quiz: { ask: 2, pass: 2 },
        badge: {
          id: 'badge-qpe', emoji: '📊', name: 'Estimator',
          earnedFor: 'You can explain why more precision costs a longer circuit.',
        },
      }),
    ],
  }),
];

/** Every topic across every module, in teaching order. */
export const TOPICS: Topic[] = MODULES.flatMap(m => m.topics);

export const topicById = (id: string): Topic | undefined => TOPICS.find(t => t.id === id);

export const topicOf = (lessonId: string): Topic | undefined =>
  TOPICS.find(t => t.lessons.includes(lessonId));

export const moduleOfTopic = (topicId: string): Module | undefined =>
  MODULES.find(m => m.topics.some(t => t.id === topicId));

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

// ================================================================ topic progress

/** Lessons in a topic, in order, skipping ids that no longer exist. */
export function lessonsOfTopic(t: Topic): Lesson[] {
  return t.lessons
    .map(id => ALL_LESSONS.find(l => l.id === id))
    .filter((l): l is Lesson => !!l);
}

/**
 * The end-of-topic quiz.
 *
 * Deterministic, like the module check: the same learner sees the same questions, so a
 * retry is the same test rather than an easier one.
 */
export function topicQuestions(t: Topic): QuizItem[] {
  return QUIZZES.filter(q => t.concepts.includes(q.concept)).slice(0, t.quiz.ask);
}

export interface TopicProgress {
  lessonsDone: number;
  lessonsTotal: number;
  quizRight: number;
  quizTotal: number;
  quizPassed: boolean;
  /** Both halves done — every lesson read and the quiz passed. */
  earned: boolean;
  percent: number;
}

export function topicProgress(
  t: Topic,
  lessonsDone: string[],
  quizAnswers: Record<string, boolean>
): TopicProgress {
  const lessons = lessonsOfTopic(t);
  const doneCount = lessons.filter(l => lessonsDone.includes(l.id)).length;
  const qs = topicQuestions(t);
  const right = qs.filter(q => quizAnswers[q.id] === true).length;
  const allRead = lessons.length > 0 && doneCount === lessons.length;
  const passed = qs.length > 0 && right >= Math.min(t.quiz.pass, qs.length);
  const lessonPart = lessons.length ? doneCount / lessons.length : 0;
  const quizPart = qs.length ? right / qs.length : 0;
  return {
    lessonsDone: doneCount,
    lessonsTotal: lessons.length,
    quizRight: right,
    quizTotal: qs.length,
    quizPassed: passed,
    earned: allRead && passed,
    percent: Math.round((lessonPart * 0.7 + quizPart * 0.3) * 100),
  };
}

/** Every badge the learner has earned, topic badges and module badges together. */
export function earnedTopicBadges(
  lessonsDone: string[],
  quizAnswers: Record<string, boolean>
): Badge[] {
  return TOPICS
    .filter(t => topicProgress(t, lessonsDone, quizAnswers).earned)
    .map(t => t.badge);
}

// ================================================================ prerequisites

export interface Readiness {
  /** True when every prerequisite topic has been earned. */
  ready: boolean;
  /** Prerequisite topics not yet earned, in teaching order. */
  missing: Topic[];
}

/**
 * Whether a topic's prerequisites are met.
 *
 * This is a nudge, never a wall. A learner who already knows linear algebra should not
 * be made to sit through it, so the UI shows what is missing and lets them proceed —
 * soft-locking, not locking. Hard gates punish the confident and teach nobody.
 */
export function topicReadiness(
  t: Topic,
  lessonsDone: string[],
  quizAnswers: Record<string, boolean>
): Readiness {
  const missing = t.prerequisites
    .map(id => topicById(id))
    .filter((p): p is Topic => !!p)
    .filter(p => !topicProgress(p, lessonsDone, quizAnswers).earned);
  return { ready: missing.length === 0, missing };
}

/** The next topic worth doing: the first not-yet-earned topic whose prerequisites are met. */
export function nextTopic(
  lessonsDone: string[],
  quizAnswers: Record<string, boolean>
): Topic | undefined {
  const unearned = TOPICS.filter(t => !topicProgress(t, lessonsDone, quizAnswers).earned);
  return unearned.find(t => topicReadiness(t, lessonsDone, quizAnswers).ready) ?? unearned[0];
}

/** Topics that list this one as a prerequisite — "what this unlocks". */
export function unlockedBy(t: Topic): Topic[] {
  return TOPICS.filter(x => x.prerequisites.includes(t.id));
}
