/**
 * Bayesian Knowledge Tracing.
 *
 * Chosen over a deep model deliberately: it is interpretable, it trains on almost no
 * data, and we can tell a teacher exactly why a lesson was recommended. Deep knowledge
 * tracing needs a usage history we will not have on day one.
 *
 * Corbett & Anderson (1994). Four parameters per concept:
 *   init    P(the learner already knows it)
 *   learn   P(they learn it from one attempt)
 *   slip    P(they know it but answer wrong)
 *   guess   P(they do not know it but answer right)
 */

export interface ConceptParams {
  init: number;
  learn: number;
  slip: number;
  guess: number;
}

export const DEFAULT_PARAMS: ConceptParams = { init: 0.15, learn: 0.25, slip: 0.1, guess: 0.2 };

export interface Concept {
  id: string;
  name: string;
  /** Concepts that should be mastered first. */
  requires: string[];
  blurb: string;
}

/** The concept graph the learner walks. Order matters: earlier concepts unlock later ones. */
export const CONCEPTS: Concept[] = [
  { id: 'qubit', name: 'Qubits and basis states', requires: [], blurb: 'What |0⟩ and |1⟩ mean, and how a register of qubits is indexed.' },
  { id: 'superposition', name: 'Superposition', requires: ['qubit'], blurb: 'The Hadamard gate, even superpositions, and why measurement gives a random outcome.' },
  { id: 'phase', name: 'Phase', requires: ['superposition'], blurb: 'Relative phase, the Z, S and T gates, and why phase is invisible until it interferes.' },
  { id: 'bloch', name: 'The Bloch sphere', requires: ['superposition'], blurb: 'Reading a single-qubit state as a point on a sphere, and rotations as movement on it.' },
  { id: 'entanglement', name: 'Entanglement', requires: ['superposition'], blurb: 'CNOT, Bell states, and correlations that cannot be explained by either qubit alone.' },
  { id: 'interference', name: 'Interference', requires: ['phase', 'superposition'], blurb: 'Amplitudes cancelling and reinforcing — the engine underneath every quantum speed-up.' },
  { id: 'measurement', name: 'Measurement', requires: ['superposition'], blurb: 'Collapse, probabilities from amplitudes, and what repeated shots tell you.' },
  { id: 'algorithms', name: 'Quantum algorithms', requires: ['interference', 'entanglement'], blurb: 'Putting it together: Deutsch–Jozsa, Grover, and how amplitude amplification works.' },
];

export type Mastery = Record<string, number>;

export function initialMastery(params: Partial<Record<string, ConceptParams>> = {}): Mastery {
  const m: Mastery = {};
  for (const c of CONCEPTS) m[c.id] = (params[c.id] ?? DEFAULT_PARAMS).init;
  return m;
}

/** One BKT update for a single observation. */
export function update(prior: number, correct: boolean, p: ConceptParams = DEFAULT_PARAMS): number {
  const { learn, slip, guess } = p;
  const posterior = correct
    ? (prior * (1 - slip)) / (prior * (1 - slip) + (1 - prior) * guess)
    : (prior * slip) / (prior * slip + (1 - prior) * (1 - guess));
  const safe = Number.isFinite(posterior) ? posterior : prior;
  return safe + (1 - safe) * learn;
}

export function observe(mastery: Mastery, conceptId: string, correct: boolean, p?: ConceptParams): Mastery {
  const prior = mastery[conceptId] ?? DEFAULT_PARAMS.init;
  return { ...mastery, [conceptId]: clamp(update(prior, correct, p)) };
}

const clamp = (v: number) => Math.max(0.001, Math.min(0.999, v));

export const MASTERED = 0.85;

export function isMastered(mastery: Mastery, id: string): boolean {
  return (mastery[id] ?? 0) >= MASTERED;
}

/** A concept is available once everything it requires is mastered. */
export function isUnlocked(mastery: Mastery, id: string): boolean {
  const c = CONCEPTS.find(x => x.id === id);
  if (!c) return false;
  return c.requires.every(r => isMastered(mastery, r));
}

export interface Recommendation {
  conceptId: string;
  reason: string;
}

/**
 * Pick what the learner should do next: the weakest unlocked concept that is not yet
 * mastered. The reason string is shown to the learner and to the instructor, because
 * a recommendation nobody can explain is not worth acting on.
 */
export function recommend(mastery: Mastery): Recommendation {
  const unlocked = CONCEPTS.filter(c => isUnlocked(mastery, c.id) && !isMastered(mastery, c.id));
  if (!unlocked.length) {
    const weakest = [...CONCEPTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0))[0];
    return { conceptId: weakest.id, reason: 'Everything is mastered — this is the one to keep warm.' };
  }
  const target = unlocked.sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0))[0];
  const pct = Math.round((mastery[target.id] ?? 0) * 100);
  const blocked = CONCEPTS.filter(c => c.requires.includes(target.id) && !isUnlocked(mastery, c.id));
  const reason = blocked.length
    ? `You are at ${pct}% on ${target.name}, and it unlocks ${blocked.map(b => b.name).join(' and ')}.`
    : `${target.name} is your weakest available concept at ${pct}%.`;
  return { conceptId: target.id, reason };
}

/** Aggregate view for the instructor dashboard. */
export function cohortWeakest(all: Mastery[]): { conceptId: string; average: number }[] {
  return CONCEPTS.map(c => ({
    conceptId: c.id,
    average: all.length ? all.reduce((s, m) => s + (m[c.id] ?? 0), 0) / all.length : 0,
  })).sort((a, b) => a.average - b.average);
}
