/**
 * The phasor view's doc comment tells a story about interference. This checks the
 * story is true, so the explanation and the physics cannot drift apart.
 *
 * The claim: H on |0> gives two arrows of equal length pointing the same way; adding a
 * Z swings one to point the opposite way without changing either probability; and the
 * second H then cancels the opposed pair to nothing.
 */

import { describe, expect, it } from 'vitest';
import { newId, type Circuit, type GateName } from '../src/core/ir';
import { run } from '../src/core/simulator';

const g = (name: GateName, qubits: number[]) => ({ id: newId(), name, qubits });
const c = (ops: ReturnType<typeof g>[]): Circuit => ({ version: 1, name: 't', qubits: 1, ops });

/** Magnitude and argument of amplitude i — exactly what the view draws. */
const phasor = (circuit: Circuit, i: number) => {
  const sv = run(circuit).state;
  return { mag: Math.hypot(sv.re[i], sv.im[i]), ang: Math.atan2(sv.im[i], sv.re[i]) };
};

describe('the interference story the phasor view tells', () => {
  it('H on |0> gives two equal arrows pointing the same way', () => {
    const a = phasor(c([g('h', [0])]), 0);
    const b = phasor(c([g('h', [0])]), 1);
    expect(a.mag).toBeCloseTo(Math.SQRT1_2, 12);
    expect(b.mag).toBeCloseTo(Math.SQRT1_2, 12);
    expect(a.ang).toBeCloseTo(b.ang, 12);
  });

  it('adding a Z opposes them without touching either probability', () => {
    const plain = [phasor(c([g('h', [0])]), 0), phasor(c([g('h', [0])]), 1)];
    const zed = [phasor(c([g('h', [0]), g('z', [0])]), 0),
                 phasor(c([g('h', [0]), g('z', [0])]), 1)];

    // Same lengths — the bars in the flat view would look identical.
    expect(zed[0].mag).toBeCloseTo(plain[0].mag, 12);
    expect(zed[1].mag).toBeCloseTo(plain[1].mag, 12);

    // But now half a turn apart, which is what the flat view cannot show.
    const gap = Math.abs(zed[1].ang - zed[0].ang);
    expect(Math.min(gap, Math.PI * 2 - gap)).toBeCloseTo(Math.PI, 12);
  });

  it('the second H cancels the opposed pair to nothing', () => {
    const sv = run(c([g('h', [0]), g('z', [0]), g('h', [0])])).state;
    expect(sv.probabilities()[0]).toBeCloseTo(0, 12);   // |0> annihilated
    expect(sv.probabilities()[1]).toBeCloseTo(1, 12);   // all of it on |1>
  });
});
