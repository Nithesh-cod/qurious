/**
 * Every algorithm challenge claims an outcome in its brief. This checks the claim.
 *
 * The grader compares a learner's circuit against the challenge's `solution`, so a
 * wrong solution would silently teach the wrong answer and mark correct work as failed.
 * These assertions are written from the brief, not from the circuit — if the two ever
 * disagree the build stops.
 */

import { describe, expect, it } from 'vitest';
import { run, type Statevector } from '../src/core/simulator';
import { ALGORITHM_CHALLENGES } from '../src/content/algorithmChallenges';
import { CHALLENGES } from '../src/content/curriculum';
import { grade } from '../src/core/grade';
import type { Challenge } from '../src/core/grade';

const byId = (id: string): Challenge => {
  const c = ALGORITHM_CHALLENGES.find(x => x.id === id);
  if (!c) throw new Error(`no challenge ${id}`);
  return c;
};
const solved = (id: string): Statevector => run(byId(id).solution).state;

/** Probability of a bitstring written with q0 as the rightmost digit. */
const pOf = (sv: Statevector, bits: string) => sv.probabilities()[parseInt(bits, 2)];

/** Length of a qubit's Bloch vector: 1 for a state of its own, 0 for fully entangled. */
const purity = (sv: Statevector, q: number) => sv.bloch(q).purity;

describe('phase kickback', () => {
  it('leaves both qubits in |−⟩, so the CNOT changed the control', () => {
    const sv = solved('ch-kickback');
    // |−⟩ is Bloch x = −1 on both qubits.
    expect(sv.bloch(0).x).toBeCloseTo(-1, 9);
    expect(sv.bloch(1).x).toBeCloseTo(-1, 9);
  });
});

describe('Deutsch–Jozsa with f(x) = NOT x', () => {
  it('reads 1 on qubit 0 with certainty, the balanced verdict', () => {
    expect(solved('ch-dj-notx').probabilityOfOne(0)).toBeCloseTo(1, 9);
  });
});

describe('Bernstein–Vazirani, hidden string 110', () => {
  it('leaves q2 = 1, q1 = 1, q0 = 0 with certainty', () => {
    const sv = solved('ch-bv-110');
    expect(sv.probabilityOfOne(0)).toBeCloseTo(0, 9);
    expect(sv.probabilityOfOne(1)).toBeCloseTo(1, 9);
    expect(sv.probabilityOfOne(2)).toBeCloseTo(1, 9);
  });
});

describe('superdense coding of 01', () => {
  it('the register reads 01 with certainty', () => {
    expect(pOf(solved('ch-superdense-01'), '01')).toBeCloseTo(1, 9);
  });
});

describe('teleportation', () => {
  it('moves the state onto qubit 2', () => {
    const sv = solved('ch-teleport');
    const sent = run({
      version: 1, name: 'ref', qubits: 1,
      ops: [{ id: 'a', name: 'ry', qubits: [0], params: [Math.PI / 3] }],
    }).state;
    expect(sv.bloch(2).x).toBeCloseTo(sent.bloch(0).x, 9);
    expect(sv.bloch(2).z).toBeCloseTo(sent.bloch(0).z, 9);
  });

  it('destroys the original — what q0 ends up holding does not depend on what was sent', () => {
    // The sharper statement of no-cloning. Teleport two different states and compare
    // the sender's qubit: if any trace of the message survived on q0, these would
    // differ. (q0 in fact lands on |+> both times; the point is that it lands there
    // whatever was sent.)
    const withAngle = (theta: number) => {
      const c = byId('ch-teleport').solution;
      const ops = c.ops.map(o => (o.name === 'ry' ? { ...o, params: [theta] } : o));
      return run({ ...c, ops }).state;
    };
    const a = withAngle(Math.PI / 3);
    const b = withAngle(Math.PI / 1.7);

    for (const axis of ['x', 'y', 'z'] as const) {
      expect(a.bloch(0)[axis]).toBeCloseTo(b.bloch(0)[axis], 9);
    }
    // ...while the receiving qubit clearly did change.
    expect(Math.abs(a.bloch(2).z - b.bloch(2).z)).toBeGreaterThan(0.1);
  });
});

describe('two-qubit QFT of |01⟩', () => {
  it('makes all four outcomes equally likely', () => {
    const sv = solved('ch-qft2');
    for (const bits of ['00', '01', '10', '11']) {
      expect(pOf(sv, bits)).toBeCloseTo(0.25, 9);
    }
  });

  it('is not just two Hadamards — the phases differ', () => {
    const sv = solved('ch-qft2');
    // A plain H⊗H on |00> would give every amplitude the same sign.
    const signs = [0, 1, 2, 3].map(i => Math.sign(sv.re[i]) || Math.sign(sv.im[i]));
    expect(new Set(signs).size).toBeGreaterThan(1);
  });
});

describe('phase estimation of the S gate', () => {
  it('reads the counting register as 010, which is one quarter', () => {
    const sv = solved('ch-qpe-s');
    const probs = sv.probabilities();
    let best = 0;
    for (let i = 0; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    // Drop qubit 3, the eigenstate, and read q2 q1 q0.
    expect(best & 0b111).toBe(0b010);
    // 1/4 is exactly representable in three bits, so there is no leakage at all: the
    // whole probability sits on one basis state. An inexact phase would spread it.
    expect(probs[best]).toBeCloseTo(1, 9);
  });
});

describe('four-qubit GHZ', () => {
  it('produces only 0000 and 1111, evenly', () => {
    const sv = solved('ch-ghz4');
    expect(pOf(sv, '0000')).toBeCloseTo(0.5, 9);
    expect(pOf(sv, '1111')).toBeCloseTo(0.5, 9);
  });

  it('leaves no qubit with a state of its own', () => {
    const sv = solved('ch-ghz4');
    for (let q = 0; q < 4; q++) expect(purity(sv, q)).toBeCloseTo(0, 9);
  });
});

describe('challenge hygiene', () => {
  it('every solution satisfies the challenge’s own constraints', () => {
    for (const c of ALGORITHM_CHALLENGES) {
      const r = grade(c.solution, c);
      expect(`${c.id}: ${r.checks.filter(x => !x.ok).map(x => x.label).join(', ')}`)
        .toBe(`${c.id}: `);
      expect(r.passed).toBe(true);
    }
  });

  it('the starter does not already solve it', () => {
    for (const c of ALGORITHM_CHALLENGES) {
      expect(`${c.id} starter passes`).toBe(
        grade(c.starter, c).passed ? `${c.id} SHOULD NOT PASS` : `${c.id} starter passes`
      );
    }
  });

  it('ids are unique across the whole challenge set', () => {
    const all = [...CHALLENGES.map(c => c.id)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('every challenge gives three hints', () => {
    for (const c of ALGORITHM_CHALLENGES) {
      expect(`${c.id}:${c.hints.length}`).toBe(`${c.id}:3`);
    }
  });
});
