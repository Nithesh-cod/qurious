/**
 * Noise simulation — what a real quantum computer actually gives you.
 *
 * Every teaching tool surveyed for this project shows ideal quantum mechanics: perfect
 * gates, perfect measurement, states that stay coherent forever. That is a comfortable
 * lie. A learner who moves from a textbook simulator to real hardware meets a wall of
 * decoherence and readout error with no intuition for any of it.
 *
 * This runs the same circuit the way a real machine would, so a learner can put the
 * ideal and the noisy result side by side and watch a Bell state stop being perfect.
 *
 * Method: Monte Carlo quantum trajectories. Rather than propagating a density matrix —
 * which costs 4^n memory and would not fit on a phone — each shot runs the statevector
 * once with randomly sampled errors, and the distribution is built from many shots.
 * This is the same technique real noisy simulators use at scale, and it keeps the cost
 * at 2^n exactly like the ideal path.
 *
 * The approximations are deliberate and documented:
 *  - Gate errors are modelled as a depolarising channel (a random Pauli), not the full
 *    process matrix of a specific device.
 *  - Amplitude damping is applied as a quantum jump to ket 0, which is the correct
 *    trajectory unravelling of T1 decay.
 *  - Dephasing is a random Z, the trajectory form of T2.
 * They are the right shape to build intuition; they are not a device simulator.
 */

import { toMoments, type Circuit, type GateOp } from './ir';
import { applyOp, rng, Statevector } from './simulator';

export interface NoiseModel {
  id: string;
  label: string;
  blurb: string;
  /** Depolarising probability after each single-qubit gate. */
  gate1: number;
  /** Depolarising probability after each two-qubit gate. Always the dominant term. */
  gate2: number;
  /** Probability a measured bit is reported flipped. */
  readout: number;
  /** Probability per moment that an idle qubit decays toward ket 0 (T1). */
  damping: number;
  /** Probability per moment that a qubit picks up a random phase (T2). */
  dephasing: number;
}

export const IDEAL: NoiseModel = {
  id: 'ideal', label: 'Ideal',
  blurb: 'Perfect gates, perfect measurement, no decoherence. This is what every textbook shows you.',
  gate1: 0, gate2: 0, readout: 0, damping: 0, dephasing: 0,
};

/**
 * Presets chosen to sit in the right order of magnitude for each class of machine.
 * They are illustrative, not a claim about any specific device — real calibration data
 * changes daily and is published per backend.
 */
export const NOISE_MODELS: NoiseModel[] = [
  IDEAL,
  {
    id: 'trapped-ion', label: 'Trapped ion',
    blurb: 'The most accurate machines available. Slow gates, but long coherence and very low error — you have to look hard to see the damage.',
    gate1: 0.0002, gate2: 0.003, readout: 0.004, damping: 0.0008, dephasing: 0.0015,
  },
  {
    id: 'nisq', label: "Today's superconducting",
    blurb: 'Roughly what a current IBM-class machine looks like. Two-qubit gates are ten times worse than single-qubit ones, which is why circuit depth is the enemy.',
    gate1: 0.001, gate2: 0.012, readout: 0.02, damping: 0.004, dephasing: 0.006,
  },
  {
    id: 'early', label: 'Early hardware',
    blurb: 'What the field looked like a few years ago. Useful for seeing an algorithm degrade into noise entirely.',
    gate1: 0.006, gate2: 0.06, readout: 0.06, damping: 0.02, dephasing: 0.03,
  },
];

export function modelById(id: string): NoiseModel {
  return NOISE_MODELS.find(m => m.id === id) ?? IDEAL;
}

const PAULIS = ['x', 'y', 'z'] as const;

/** Apply a uniformly random non-identity Pauli to one qubit. */
function randomPauli(sv: Statevector, qubit: number, r: number): void {
  const name = PAULIS[Math.min(2, Math.floor(r * 3))];
  applyOp(sv, { id: 'noise', name, qubits: [qubit] });
}

/**
 * Amplitude damping as a quantum jump: with the given probability the qubit relaxes to
 * ket 0. Implemented by projecting and renormalising, which is what actually happens to
 * a single trajectory when a photon is emitted.
 */
function dampToZero(sv: Statevector, qubit: number): void {
  const bit = 1 << qubit;
  let norm = 0;
  for (let i = 0; i < sv.size; i++) {
    if (i & bit) {
      // Move the amplitude of |...1...> onto its |...0...> partner.
      const j = i & ~bit;
      sv.re[j] += sv.re[i];
      sv.im[j] += sv.im[i];
      sv.re[i] = 0;
      sv.im[i] = 0;
    }
  }
  for (let i = 0; i < sv.size; i++) norm += sv.re[i] * sv.re[i] + sv.im[i] * sv.im[i];
  const k = norm > 1e-12 ? 1 / Math.sqrt(norm) : 1;
  for (let i = 0; i < sv.size; i++) { sv.re[i] *= k; sv.im[i] *= k; }
}

export interface NoisyResult {
  counts: Record<string, number>;
  shots: number;
  /** How many shots suffered at least one error. Shown to the learner as a headline. */
  shotsWithError: number;
  model: NoiseModel;
}

/**
 * Run a circuit `shots` times with noise, returning measurement counts.
 *
 * Seeded, so a lesson or a screenshot reproduces exactly.
 */
export function runNoisy(
  circuit: Circuit,
  model: NoiseModel,
  shots = 1024,
  seed = 20260920
): NoisyResult {
  const next = rng(seed);
  const counts: Record<string, number> = {};
  const moments = toMoments(circuit);
  const n = circuit.qubits;
  let shotsWithError = 0;

  for (let s = 0; s < shots; s++) {
    const sv = new Statevector(n);
    let errored = false;

    for (const moment of moments) {
      const touched = new Set<number>();

      for (const op of moment) {
        applyOp(sv, op as GateOp);
        if (op.name === 'barrier' || op.name === 'measure') continue;

        const acting = op.qubits;
        acting.forEach(q => touched.add(q));

        // Depolarising error after the gate. Two-qubit gates are the dominant source.
        const p = acting.length >= 2 ? model.gate2 : model.gate1;
        if (p > 0) {
          for (const q of acting) {
            if (next() < p) { randomPauli(sv, q, next()); errored = true; }
          }
        }
      }

      // Idle qubits decohere too — that is why depth costs you even when nothing acts.
      for (let q = 0; q < n; q++) {
        if (model.damping > 0 && next() < model.damping) { dampToZero(sv, q); errored = true; }
        if (model.dephasing > 0 && next() < model.dephasing) {
          applyOp(sv, { id: 'noise', name: 'z', qubits: [q] });
          errored = true;
        }
        touched.delete(q);
      }
    }

    // Collapse to one outcome, then corrupt the classical bits on the way out.
    const probs = sv.probabilities();
    let acc = 0;
    const r = next();
    let outcome = probs.length - 1;
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i];
      if (r <= acc) { outcome = i; break; }
    }

    if (model.readout > 0) {
      for (let q = 0; q < n; q++) {
        if (next() < model.readout) { outcome ^= 1 << q; errored = true; }
      }
    }

    const key = outcome.toString(2).padStart(n, '0');
    counts[key] = (counts[key] ?? 0) + 1;
    if (errored) shotsWithError++;
  }

  return { counts, shots, shotsWithError, model };
}

/**
 * How close the noisy outcome distribution is to the ideal one, from 0 to 1.
 *
 * This is the number the learner watches fall as they add gates — the single clearest
 * demonstration of why circuit depth is the constraint on real hardware.
 */
export function distributionFidelity(
  ideal: Record<string, number>,
  noisy: Record<string, number>
): number {
  const keys = new Set([...Object.keys(ideal), ...Object.keys(noisy)]);
  const ni = Object.values(ideal).reduce((a, b) => a + b, 0) || 1;
  const nn = Object.values(noisy).reduce((a, b) => a + b, 0) || 1;
  // Bhattacharyya coefficient: sum of sqrt(p*q), 1 when the distributions match.
  let overlap = 0;
  for (const k of keys) {
    overlap += Math.sqrt(((ideal[k] ?? 0) / ni) * ((noisy[k] ?? 0) / nn));
  }
  return Math.min(1, overlap);
}

/** Outcomes that are impossible ideally but appear under noise — the visible damage. */
export function spuriousOutcomes(
  ideal: Record<string, number>,
  noisy: Record<string, number>
): { key: string; count: number }[] {
  return Object.entries(noisy)
    .filter(([k]) => !(k in ideal))
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
