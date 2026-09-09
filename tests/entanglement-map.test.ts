/**
 * The entanglement map's arithmetic.
 *
 * The picture is only worth drawing if the links are right, and "looks entangled" is not
 * a check. These pin the cases a learner will actually put in front of it: a product
 * state must show nothing, a Bell pair must link exactly its two qubits, and a state that
 * mixes an entangled pair with a spare qubit must not link the spare — which is the whole
 * reason the map exists, since three collapsed Bloch arrows look identical either way.
 */

import { describe, expect, it } from 'vitest';
import { entanglementLinks } from '../src/ui/EntanglementMap';
import { run } from '../src/core/simulator';
import { newId, type Circuit, type GateName } from '../src/core/ir';

const g = (name: GateName, qubits: number[]) => ({ id: newId(), name, qubits });
const c = (qubits: number, ops: ReturnType<typeof g>[]): Circuit =>
  ({ version: 1, name: 't', qubits, ops });

const linksOf = (circuit: Circuit) => entanglementLinks(run(circuit).state);
const pair = (l: { a: number; b: number }) => `${l.a}-${l.b}`;

describe('entanglement links', () => {
  it('shows nothing for a product state', () => {
    expect(linksOf(c(2, [g('h', [0]), g('x', [1])]))).toEqual([]);
  });

  it('shows nothing for two idle qubits', () => {
    expect(linksOf(c(2, []))).toEqual([]);
  });

  it('links exactly the two qubits of a Bell pair, at full strength', () => {
    const links = linksOf(c(2, [g('h', [0]), g('cx', [0, 1])]));
    expect(links.map(pair)).toEqual(['0-1']);
    expect(links[0].strength).toBeCloseTo(1, 6);
  });

  it('links all three pairs of a GHZ state', () => {
    const links = linksOf(c(3, [g('h', [0]), g('cx', [0, 1]), g('cx', [0, 2])]));
    expect(links.map(pair).sort()).toEqual(['0-1', '0-2', '1-2']);
  });

  it('leaves a spare qubit unlinked beside an entangled pair', () => {
    // The case the Bloch spheres cannot distinguish: q0 and q1 share a state, q2 does
    // not. All that the spheres show is two collapsed arrows and one full one; the map
    // has to show which two are actually joined.
    const links = linksOf(c(3, [g('h', [0]), g('cx', [0, 1]), g('h', [2])]));
    expect(links.map(pair)).toEqual(['0-1']);
    expect(links.some(l => l.a === 2 || l.b === 2), 'the spare qubit must not be linked').toBe(false);
  });

  it('never reports a strength outside 0 to 1', () => {
    for (const circuit of [
      c(2, [g('h', [0]), g('cx', [0, 1])]),
      c(3, [g('h', [0]), g('cx', [0, 1]), g('cx', [1, 2])]),
      c(4, [g('h', [0]), g('cx', [0, 1]), g('cx', [1, 2]), g('cx', [2, 3])]),
    ]) {
      for (const l of entanglementLinks(run(circuit).state)) {
        expect(l.strength).toBeGreaterThanOrEqual(0);
        expect(l.strength).toBeLessThanOrEqual(1);
      }
    }
  });

  it('has nothing to draw for a single qubit', () => {
    expect(linksOf(c(1, [g('h', [0])]))).toEqual([]);
  });
});
