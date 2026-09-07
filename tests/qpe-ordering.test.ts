/**
 * Which way round does the phase-estimation counting register read?
 *
 * Written because the lesson first claimed q2 held the top bit and the simulator
 * disagreed. Rather than edit the test until it matched the code, this sweeps five
 * known phases and checks the measured integer against phi * 2^n — a result that
 * depends on neither. The simulator was right; the prose was fixed.
 *
 * It stays as the regression test for the controlled-phase gate and for the ordering.
 */

import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { newId, type Circuit, type GateName } from '../src/core/ir';
import { run } from '../src/core/simulator';

const g = (name: GateName, qubits: number[], params?: number[]) =>
  ({ id: newId(), name, qubits, ...(params ? { params } : {}) });
const PI = Math.PI;

/** QPE for U = P(2*pi*phi) acting on |1>, with three counting qubits. */
function qpe(phi: number): Circuit {
  const th = 2 * PI * phi;
  return {
    version: 1, name: 'qpe', qubits: 4, ops: [
      g('x', [3]),
      g('h', [0]), g('h', [1]), g('h', [2]),
      g('cp', [0, 3], [th]),
      g('cp', [1, 3], [2 * th]),
      g('cp', [2, 3], [4 * th]),
      g('swap', [0, 2]),
      g('h', [0]),
      g('cp', [0, 1], [-PI / 2]),
      g('h', [1]),
      g('cp', [0, 2], [-PI / 4]),
      g('cp', [1, 2], [-PI / 2]),
      g('h', [2]),
    ],
  };
}

/** Most likely counting-register value, read as an integer with q0 as the LSB. */
function peak(phi: number): number {
  const probs = run(qpe(phi)).state.probabilities();
  let best = 0, bestP = -1;
  for (let i = 0; i < probs.length; i++) if (probs[i] > bestP) { bestP = probs[i]; best = i; }
  return best & 0b111;
}

describe('QPE bit ordering — independent check', () => {
  // The theory: the register ends holding the integer m with m / 2^n = phi.
  for (const [phi, expected, label] of [
    [1 / 8, 1, '1/8'], [1 / 4, 2, '1/4'], [3 / 8, 3, '3/8'],
    [1 / 2, 4, '1/2'], [5 / 8, 5, '5/8'],
  ] as [number, number, string][]) {
    it(`phi = ${label} gives the integer ${expected}`, () => {
      expect(peak(phi)).toBe(expected);
    });
  }
});

/**
 * Emits the fixture `server/qpe_crosscheck.py` compares against.
 *
 * Checking the peak alone would pass even if every other amplitude were wrong, so the
 * Python side diffs the whole statevector. Our engine and Qiskit share the little-endian
 * convention, which is what makes an index-for-index comparison meaningful.
 */
describe('QPE cross-check fixture', () => {
  it('writes the statevectors for the Qiskit comparison', () => {
    const data = [1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 7 / 8].map(phi => {
      const sv = run(qpe(phi)).state;
      return { phi, re: Array.from(sv.re), im: Array.from(sv.im) };
    });
    const out = resolve(__dirname, '../server/fixtures/qpe.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(data));
    expect(data).toHaveLength(6);
    expect(data[0].re).toHaveLength(16);
  });
});
