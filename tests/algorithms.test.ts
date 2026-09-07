/**
 * The algorithm lessons say what their circuits do. This checks they are telling the
 * truth — every claim in the prose is asserted here against the simulator.
 *
 * Content that lies about its own physics fails the build. That is the only mechanism
 * that keeps "we never teach wrong physics" true as the lesson count grows.
 */

import { describe, expect, it } from 'vitest';
import { run, type Statevector } from '../src/core/simulator';
import {
  ALGORITHM_LESSONS, BV_101, DJ_BALANCED, DJ_CONSTANT, GHZ3, GROVER_11,
  QFT3, QPE_T, SUPERDENSE_11, TELEPORT,
} from '../src/content/algorithms';
import { ALL_LESSONS } from '../src/content/curriculum';
import { MODULES } from '../src/content/modules';

/** Probability that `qubit` reads 1. */
const p1 = (sv: Statevector, qubit: number) => sv.probabilityOfOne(qubit);

/** Probability of a whole bitstring, given little-endian (q0 is the rightmost digit). */
function pOf(sv: Statevector, bits: string): number {
  const idx = parseInt(bits, 2);
  const probs = sv.probabilities();
  return probs[idx];
}

describe('Deutsch–Jozsa', () => {
  it('a constant oracle leaves the input qubit at 0 with certainty', () => {
    const sv = run(DJ_CONSTANT).state;
    expect(p1(sv, 0)).toBeCloseTo(0, 12);
  });

  it('a balanced oracle drives the input qubit to 1 with certainty', () => {
    const sv = run(DJ_BALANCED).state;
    expect(p1(sv, 0)).toBeCloseTo(1, 12);
  });

  it('the two cases are perfectly distinguishable — no averaging needed', () => {
    const c = p1(run(DJ_CONSTANT).state, 0);
    const b = p1(run(DJ_BALANCED).state, 0);
    expect(Math.abs(b - c)).toBeCloseTo(1, 12);
  });
});

describe('Bernstein–Vazirani', () => {
  it('reads the hidden string 101 off qubits 0..2 in one query', () => {
    const sv = run(BV_101).state;
    expect(p1(sv, 0)).toBeCloseTo(1, 12); // s0 = 1
    expect(p1(sv, 1)).toBeCloseTo(0, 12); // s1 = 0
    expect(p1(sv, 2)).toBeCloseTo(1, 12); // s2 = 1
  });
});

describe('Superdense coding', () => {
  it('delivers the bits 11 with certainty', () => {
    const sv = run(SUPERDENSE_11).state;
    expect(pOf(sv, '11')).toBeCloseTo(1, 12);
  });
});

describe('Teleportation', () => {
  it('moves the state onto qubit 2', () => {
    const sv = run(TELEPORT).state;
    // RY(pi/3) on |0> gives cos(pi/6)|0> + sin(pi/6)|1>, so P(1) = sin^2(pi/6) = 0.25.
    const b2 = sv.bloch(2);
    expect(b2.z).toBeCloseTo(Math.cos(Math.PI / 3), 10);
    expect(b2.x).toBeCloseTo(Math.sin(Math.PI / 3), 10);
    expect(b2.purity).toBeCloseTo(1, 10);
  });

  it('destroys the original — qubit 0 no longer holds the state', () => {
    const sv = run(TELEPORT).state;
    const b0 = sv.bloch(0);
    const started = { z: Math.cos(Math.PI / 3), x: Math.sin(Math.PI / 3) };
    const same = Math.abs(b0.z - started.z) < 1e-6 && Math.abs(b0.x - started.x) < 1e-6;
    expect(same).toBe(false);
  });
});

describe('Quantum Fourier transform', () => {
  it('turns the all-zero state into an even spread over all eight outcomes', () => {
    const probs = run(QFT3).state.probabilities();
    expect(probs).toHaveLength(8);
    for (const p of probs) expect(p).toBeCloseTo(1 / 8, 12);
  });

  it('preserves total probability', () => {
    expect(run(QFT3).state.norm()).toBeCloseTo(1, 12);
  });
});

describe('Phase estimation', () => {
  it('estimates the T gate phase as the number 1, which is one eighth', () => {
    const sv = run(QPE_T).state;
    // The counting register q0..q2 holds m with m / 8 = phi. phi = 1/8, so m = 1,
    // and 1 has its bit in q0 — see tests/qpe-ordering.test.ts for the sweep that
    // established this against theory rather than against the implementation.
    expect(p1(sv, 0)).toBeCloseTo(1, 10);
    expect(p1(sv, 1)).toBeCloseTo(0, 10);
    expect(p1(sv, 2)).toBeCloseTo(0, 10);
    expect(p1(sv, 3)).toBeCloseTo(1, 10);  // eigenstate untouched
  });
});

describe('Grover', () => {
  it('one iteration on two qubits lands on the marked state exactly', () => {
    const sv = run(GROVER_11).state;
    expect(pOf(sv, '11')).toBeCloseTo(1, 12);
  });
});

describe('GHZ', () => {
  it('produces only the all-zero and all-one outcomes', () => {
    const probs = run(GHZ3).state.probabilities();
    expect(probs[0]).toBeCloseTo(0.5, 12);
    expect(probs[7]).toBeCloseTo(0.5, 12);
    for (let i = 1; i < 7; i++) expect(probs[i]).toBeCloseTo(0, 12);
  });

  it('leaves every single qubit with no state of its own', () => {
    const sv = run(GHZ3).state;
    for (const q of [0, 1, 2]) expect(sv.bloch(q).purity).toBeCloseTo(0, 12);
  });
});

describe('lesson integrity', () => {
  it('every algorithm lesson circuit runs and stays normalised', () => {
    for (const lesson of ALGORITHM_LESSONS) {
      for (const step of lesson.steps) {
        if (!step.circuit) continue;
        const sv = run(step.circuit).state;
        expect(sv.norm(), `${lesson.id} / ${step.heading}`).toBeCloseTo(1, 10);
      }
    }
  });

  it('every lesson id is unique', () => {
    const ids = ALL_LESSONS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every module references lessons that exist', () => {
    const ids = new Set(ALL_LESSONS.map(l => l.id));
    for (const m of MODULES) {
      for (const id of m.lessons) {
        expect(ids.has(id), `module ${m.id} references missing lesson ${id}`).toBe(true);
      }
    }
  });

  it('every module has enough questions to run its check', () => {
    for (const m of MODULES) {
      expect(m.check.pass, `module ${m.id}`).toBeLessThanOrEqual(m.check.ask);
    }
  });
});
