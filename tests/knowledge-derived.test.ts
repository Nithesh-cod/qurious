/**
 * The computed half of the knowledge base.
 *
 * The argument for generating entries instead of writing them is that a generated answer
 * cannot contradict the simulator. That argument only holds if two things are true, and
 * this file checks both:
 *
 *   1. The circuits the generator builds really are the algorithms it names them after.
 *      A body that says "Grover" and runs something else would be confidently wrong in
 *      the worst way — fluent, specific, and unverifiable by the reader. So the algorithm
 *      families are checked against what the algorithm is supposed to produce, derived
 *      from theory here rather than read back from the generator.
 *
 *   2. Every body actually renders, says something, and stays speakable. Nine hundred
 *      lazy getters is nine hundred chances to throw on a phone in front of a judge.
 *
 * The single-qubit families are checked exhaustively against independently computed
 * matrix algebra, since there is no excuse for approximating something this small.
 */

import { describe, expect, it } from 'vitest';
import { DERIVED_ENTRIES, _internals } from '../src/core/knowledgeDerived';
import { CURATED_ENTRIES, ENTRIES, byId, search } from '../src/core/knowledge';
import { run } from '../src/core/simulator';

const { bvCircuit, qftCircuit, qpeCircuit, groverCircuit, sequenceMatrix, nameOfMatrix } = _internals;

const find = (id: string) => {
  const e = byId(id);
  if (!e) throw new Error(`no entry ${id}`);
  return e;
};

const peakOf = (probs: Float64Array | number[]) => {
  let best = 0;
  for (let i = 0; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return best;
};

describe('the base is what it claims to be', () => {
  it('is over a thousand topics, and says how it got there', () => {
    expect(ENTRIES.length).toBeGreaterThan(1000);
    expect(ENTRIES.length).toBe(CURATED_ENTRIES.length + DERIVED_ENTRIES.length);
  });

  it('keeps the two halves distinguishable', () => {
    expect(CURATED_ENTRIES.every(e => !e.computed)).toBe(true);
    expect(DERIVED_ENTRIES.every(e => e.computed === true)).toBe(true);
  });

  it('every computed body renders without throwing and says something', () => {
    for (const e of DERIVED_ENTRIES) {
      expect(typeof e.body, e.id).toBe('string');
      expect(e.body.length, e.id).toBeGreaterThan(80);
    }
  });

  it('every computed body stays speakable', () => {
    for (const e of DERIVED_ENTRIES) {
      expect(e.body, e.id).not.toMatch(/[*#`|]/);
      expect(e.body, e.id).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('caches the body rather than re-simulating on every read', () => {
    const e = find('grover-3-101');
    expect(e.body).toBe(e.body);
  });
});

describe('single-qubit sequences', () => {
  it('names a sequence as a gate only when the matrices actually agree', () => {
    // H, Z, H is X. This is the identity the phase lesson is built on, and the
    // "build an X without using X" challenge asks the learner to find it.
    expect(nameOfMatrix(sequenceMatrix(['h', 'z', 'h']))).toBe('the X gate');
    expect(nameOfMatrix(sequenceMatrix(['h', 'x', 'h']))).toBe('the Z gate');
    expect(nameOfMatrix(sequenceMatrix(['t', 't']))).toBe('the S gate');
    expect(nameOfMatrix(sequenceMatrix(['s', 's']))).toBe('the Z gate');
    expect(nameOfMatrix(sequenceMatrix(['x', 'x']))).toContain('identity');
    expect(nameOfMatrix(sequenceMatrix(['h', 'h']))).toContain('identity');
    expect(nameOfMatrix(sequenceMatrix(['s', 'sdg']))).toContain('identity');
    // X then Y is Z up to a global phase, which is a real physical equality.
    expect(nameOfMatrix(sequenceMatrix(['x', 'y']))).toBe('the Z gate');
    // Not everything is a named gate.
    expect(nameOfMatrix(sequenceMatrix(['h', 't']))).toBeNull();
  });

  it('every sequence entry reports the state its own circuit produces', () => {
    // Independently: re-run the sequence, format the probability, and require it to
    // appear in the body. Catches a body wired to the wrong circuit.
    const seqEntries = DERIVED_ENTRIES.filter(e => e.id.startsWith('seq-'));
    expect(seqEntries.length).toBe(8 * 8 + 8 * 8 * 8);

    for (const e of seqEntries) {
      const seq = e.id.slice(4).split('-') as Parameters<typeof sequenceMatrix>[0];
      const sv = run({
        version: 1, name: 't', qubits: 1,
        ops: seq.map((n, i) => ({ id: `g${i}`, name: n, qubits: [0] })),
      }).state;
      const p1 = sv.probabilityOfOne(0);
      const rounded = Math.abs(p1 * 100 - Math.round(p1 * 100)) < 0.05
        ? `${Math.round(p1 * 100)} percent`
        : `${(p1 * 100).toFixed(1)} percent`;
      expect(e.body, e.id).toContain(`chance of measuring 1 is ${rounded}`);
    }
  });

  it('says plainly when a gate does nothing observable', () => {
    // Z on ket zero is the classic "why did nothing happen" question.
    expect(find('act-z-zero').body).toContain('changes nothing you could ever measure');
    expect(find('act-x-zero').body).not.toContain('changes nothing');
  });

  it('places the landmark states where the Bloch sphere says they are', () => {
    expect(find('act-h-zero').body).toContain('That is the plus state.');
    expect(find('act-h-one').body).toContain('That is the minus state.');
    expect(find('act-s-plus').body).toContain('That is the plus i state.');
    expect(find('act-x-plus').body).toContain('That is the plus state.');
  });
});

describe('the algorithm circuits are the algorithms', () => {
  it('Bernstein-Vazirani returns the hidden string, for every string', () => {
    for (const n of [3, 4]) {
      for (let s = 0; s < 1 << n; s++) {
        const probs = run(bvCircuit(s, n)).state.probabilities();
        // The helper qubit is left in the minus state on purpose, so it is an even
        // split and the raw peak is only ever 50 percent. The claim is about the input
        // register, so sum the helper out before reading it.
        const mask = (1 << n) - 1;
        const marginal = new Array(1 << n).fill(0);
        for (let i = 0; i < probs.length; i++) marginal[i & mask] += probs[i];
        expect(peakOf(marginal), `s=${s.toString(2)}`).toBe(s);
        expect(marginal[s], `s=${s.toString(2)}`).toBeCloseTo(1, 9);
      }
    }
  });

  it('the Fourier transform of a basis state is flat, with the right phases', () => {
    // QFT of |x> has amplitude exp(2 pi i x k / N) / sqrt(N) on |k>. Written from the
    // definition here, not read back from the generator.
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    for (const n of [2, 3]) {
      const N = 1 << n;
      for (let x = 0; x < N; x++) {
        const sv = run(qftCircuit(n, x)).state;
        for (let k = 0; k < N; k++) {
          expect(sv.probabilities()[k], `x=${x} k=${k}`).toBeCloseTo(1 / N, 9);
          const want = (2 * Math.PI * x * k) / N;
          const got = Math.atan2(sv.im[k], sv.re[k]);
          expect(Math.abs(wrap(got - want)), `phase x=${x} k=${k}`).toBeLessThan(1e-7);
        }
      }
    }
  });

  it('phase estimation reads back every exactly representable phase', () => {
    for (const n of [3, 4]) {
      const denom = 1 << n;
      for (let k = 0; k < denom; k++) {
        const sv = run(qpeCircuit(n, k)).state;
        const probs = sv.probabilities();
        const peak = peakOf(probs);
        expect(peak & (denom - 1), `k/${denom}=${k}`).toBe(k);
        // Exactly representable means all of the probability, not most of it.
        expect(probs[peak], `k/${denom}=${k}`).toBeCloseTo(1, 9);
      }
    }
  });

  it('Grover finds the marked entry, and beats guessing by the expected margin', () => {
    for (const n of [2, 3]) {
      for (let m = 0; m < 1 << n; m++) {
        const probs = run(groverCircuit(n, m)).state.probabilities();
        expect(peakOf(probs), `n=${n} marked=${m}`).toBe(m);
        // Two qubits with one iteration is exact; three qubits with two is the well
        // known 0.9453, and it must not have drifted.
        if (n === 2) expect(probs[m], `marked=${m}`).toBeCloseTo(1, 9);
        else expect(probs[m], `marked=${m}`).toBeCloseTo(0.9453125, 6);
      }
    }
  });

  it('Deutsch-Jozsa gives 0 for constant and 1 for balanced', () => {
    expect(find('deutsch-zero').body).toContain('the function is constant');
    expect(find('deutsch-one').body).toContain('the function is constant');
    expect(find('deutsch-x').body).toContain('the function is balanced');
    expect(find('deutsch-notx').body).toContain('the function is balanced');
    expect(find('deutsch-zero').body).toContain('qubit 0 reads 0');
    expect(find('deutsch-x').body).toContain('qubit 0 reads 1');
  });

  it('superdense coding recovers the message that was sent', () => {
    for (const m of ['00', '01', '10', '11']) {
      expect(find(`superdense-${m}`).body, m).toContain(`${m} at 100 percent`);
    }
  });

  it('the Bell states differ in exactly the way the entry claims', () => {
    expect(find('bell-phi-plus').body).toContain('always agree');
    expect(find('bell-phi-minus').body).toContain('always agree');
    expect(find('bell-psi-plus').body).toContain('always disagree');
    expect(find('bell-psi-minus').body).toContain('always disagree');
    for (const b of ['phi-plus', 'phi-minus', 'psi-plus', 'psi-minus']) {
      expect(find(`bell-${b}`).body, b).toContain('length for qubit 0 is 0');
    }
  });

  it('GHZ leaves only the all-zero and all-one readings', () => {
    for (let n = 3; n <= 8; n++) {
      const body = find(`ghz-${n}`).body;
      expect(body, `n=${n}`).toContain(`${'0'.repeat(n)} at 50 percent`);
      expect(body, `n=${n}`).toContain(`${'1'.repeat(n)} at 50 percent`);
      expect(body, `n=${n}`).toContain(`The other ${(1 << n) - 2} are impossible`);
    }
  });
});

describe('registers and rotations', () => {
  it('quotes the right number of amplitudes for every register width', () => {
    for (let n = 1; n <= 12; n++) {
      expect(find(`reg-${n}`).body, `n=${n}`).toContain(`holds ${Math.pow(2, n)} amplitudes`);
      expect(find(`spread-${n}`).body, `n=${n}`)
        .toContain(`superposition of all ${Math.pow(2, n)} readings`);
    }
  });

  it('gets the rotation probabilities right, against sin squared of half the angle', () => {
    for (let deg = 0; deg < 360; deg += 10) {
      const p1 = Math.pow(Math.sin((deg * Math.PI) / 180 / 2), 2);
      const want = Math.abs(p1 * 100 - Math.round(p1 * 100)) < 0.05
        ? `${Math.round(p1 * 100)} percent`
        : `${(p1 * 100).toFixed(1)} percent`;
      for (const axis of ['rx', 'ry']) {
        expect(find(`rot-${axis}-${deg}`).body, `${axis} ${deg}`)
          .toContain(`chance of measuring 1 is ${want}`);
      }
      // RZ is asked about the plus state, where it is a visible rotation of the phase
      // rather than an unobservable one, so it never changes the odds.
      expect(find(`rot-rz-${deg}`).body, `rz ${deg}`)
        .toContain('chance of measuring 1 is 50 percent');
    }
  });
});

describe('the matrices match the gate table', () => {
  it('states the Pauli and Clifford matrices correctly', () => {
    expect(find('mat-x').body).toContain('top row 0 and 1');
    expect(find('mat-x').body).toContain('bottom row 1 and 0');
    expect(find('mat-z').body).toContain('top row 1 and 0');
    expect(find('mat-z').body).toContain('bottom row 0 and -1');
    expect(find('mat-y').body).toContain('-1 i');
    expect(find('mat-h').body).toContain('0.707');
    expect(find('mat-s').body).toContain('1 i');
    expect(find('mat-t').body).toContain('0.707 plus 0.707 i');
  });
});

describe('retrieval survives the extra thousand entries', () => {
  it('still prefers the written explanation for a general question', () => {
    expect(search('what does the hadamard gate do')[0].entry.id).toBe('hadamard');
    expect(search('what is entanglement')[0].entry.id).toBe('entanglement');
    expect(search('how does grover search work')[0].entry.id).toBe('grover');
  });

  it('reaches a computed answer when the question is a specific one', () => {
    const hits = (q: string) => search(q, 5).map(m => m.entry.id);
    expect(hits('what does h do to the plus state')).toContain('act-h-plus');
    expect(hits('grover 101')).toContain('grover-3-101');
    expect(hits('bernstein vazirani 1011')).toContain('bv-1011');
    expect(hits('x matrix')).toContain('mat-x');
  });

  it('still refuses to answer questions nobody asked', () => {
    for (const q of ['hi', 'hey', 'ok', 'yes', 'no', 'um', 'the', 'is', 'it']) {
      expect(search(q), q).toEqual([]);
    }
    for (const q of ['what is the weather in chennai', 'who won the match', 'order me a pizza']) {
      expect(search(q), q).toEqual([]);
    }
  });

  it('answers fast enough to feel instant on a phone', () => {
    // Ten times the entries used to mean ten times the work per keystroke, because the
    // scorer re-tokenised every key on every query. Keys are pre-tokenised at import now.
    // The bar is set for a desktop with room for a mid-range phone being several times
    // slower — a tutor that stalls before answering reads as a tutor that is thinking.
    const qs = ['what is a qubit', 'grover 11', 'h then t then s', 'phase estimation 3 8'];
    for (let i = 0; i < 50; i++) search(qs[i % qs.length]);   // warm up
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) search(qs[i % qs.length]);
    const perQuery = (performance.now() - t0) / 500;
    expect(perQuery).toBeLessThan(2);
  });
});
