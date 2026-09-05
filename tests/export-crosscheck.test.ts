/**
 * Emits the cross-check fixture.
 *
 * This is not really a test — it is the bridge to the Qiskit comparison. It builds a
 * battery of circuits, records our simulator's statevector for each, exports the same
 * circuit as OpenQASM, and writes both to a JSON file. `server/crosscheck.py` then
 * runs that QASM through Qiskit Aer and compares.
 *
 * Being able to say "our simulator agrees with Qiskit to 1e-15 across 20 circuits" is
 * worth more in front of a quantum panel than any amount of asserting that it works.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { emptyCircuit, op, type Circuit } from '../src/core/ir';
import { run } from '../src/core/simulator';
import { toQasm } from '../src/core/transpile';

const build = (qubits: number, ops: ReturnType<typeof op>[], name: string): Circuit => {
  const c = emptyCircuit(qubits, name);
  c.ops = ops;
  return c;
};
const PI = Math.PI;

const CASES: Circuit[] = [
  build(1, [op('h', [0])], 'hadamard'),
  build(1, [op('x', [0])], 'x'),
  build(1, [op('y', [0])], 'y'),
  build(1, [op('h', [0]), op('z', [0])], 'h-then-z'),
  build(1, [op('x', [0]), op('s', [0])], 'x-then-s'),
  build(1, [op('x', [0]), op('t', [0])], 'x-then-t'),
  build(1, [op('h', [0]), op('sdg', [0])], 'h-then-sdg'),
  build(1, [op('rx', [0], [PI / 3])], 'rx-pi-3'),
  build(1, [op('ry', [0], [PI / 5])], 'ry-pi-5'),
  build(1, [op('h', [0]), op('rz', [0], [PI / 7])], 'h-then-rz'),
  build(1, [op('h', [0]), op('p', [0], [PI / 4])], 'h-then-phase'),
  build(2, [op('h', [0]), op('cx', [0, 1])], 'bell'),
  build(2, [op('h', [0]), op('cx', [0, 1]), op('z', [0])], 'bell-phi-minus'),
  build(2, [op('x', [0]), op('x', [1]), op('cz', [0, 1])], 'cz-both-set'),
  build(2, [op('h', [0]), op('cy', [0, 1])], 'controlled-y'),
  build(2, [op('x', [0]), op('swap', [0, 1])], 'swap'),
  build(3, [op('h', [0]), op('cx', [0, 1]), op('cx', [0, 2])], 'ghz3'),
  build(3, [op('x', [0]), op('x', [1]), op('ccx', [0, 1, 2])], 'toffoli'),
  build(3, [op('x', [0]), op('x', [1]), op('cswap', [0, 1, 2])], 'fredkin'),
  build(3, [op('h', [0]), op('h', [1]), op('h', [2]), op('rz', [1], [0.6]), op('cx', [1, 2]), op('ry', [0], [1.1])], 'mixed-3q'),
  build(2, [
    op('h', [0]), op('h', [1]), op('cz', [0, 1]),
    op('h', [0]), op('h', [1]), op('x', [0]), op('x', [1]),
    op('cz', [0, 1]), op('x', [0]), op('x', [1]), op('h', [0]), op('h', [1]),
  ], 'grover-2q'),
  build(4, [op('h', [0]), op('cx', [0, 1]), op('cx', [1, 2]), op('cx', [2, 3]), op('t', [3]), op('h', [2])], 'chain-4q'),
];

describe('cross-check fixture', () => {
  it('writes every circuit with our statevector and its QASM', () => {
    const payload = CASES.map(c => {
      const { state } = run(c);
      return {
        name: c.name,
        qubits: c.qubits,
        qasm: toQasm(c),
        // Raw gate list as well, so the Python side can drive Qiskit directly and the
        // comparison tests the simulator rather than a QASM parser round-trip.
        ops: c.ops.map(o => ({ name: o.name, qubits: o.qubits, params: o.params ?? [] })),
        // Amplitudes indexed little-endian, qubit 0 = least significant bit.
        re: Array.from(state.re),
        im: Array.from(state.im),
      };
    });

    const out = resolve(__dirname, '../server/fixtures/crosscheck.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), cases: payload }, null, 2));

    expect(payload.length).toBe(CASES.length);
    for (const p of payload) {
      const norm = p.re.reduce((s, r, i) => s + r * r + p.im[i] * p.im[i], 0);
      expect(norm).toBeCloseTo(1, 12);
    }
  });
});
