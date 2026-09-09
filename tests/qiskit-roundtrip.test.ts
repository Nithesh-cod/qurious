/**
 * The Qiskit parser, round-tripped.
 *
 * `toQasm`/`fromQasm` were already covered by core.test.ts. `fromQiskit` was not, and it
 * is not a bystander: CodePanel lets a learner type Python straight into the editor and
 * rebuilds the circuit from it, so this parser sits on a path where a person is actively
 * typing. An untested parser on an input a user controls is the wrong thing to leave
 * uncovered.
 *
 * The check is behavioural rather than textual. Generated Python is not expected to come
 * back as an identical string — what has to survive is the *circuit*: parse the emitted
 * Qiskit source and require the state it produces to match the original.
 */

import { describe, expect, it } from 'vitest';
import { emptyCircuit, newId, type Circuit, type GateName } from '../src/core/ir';
import { toQiskit, fromQiskit } from '../src/core/transpile';
import { run } from '../src/core/simulator';
import { fidelity } from '../src/core/grade';

const g = (name: GateName, qubits: number[], params?: number[]) => ({
  id: newId(), name, qubits, ...(params ? { params } : {}),
});
const circuit = (qubits: number, ops: ReturnType<typeof g>[]): Circuit =>
  ({ version: 1, name: 't', qubits, ops });

const PI = Math.PI;

/** Same physical state, ignoring the global phase nothing can measure. */
function sameState(a: Circuit, b: Circuit, label: string) {
  const sa = run(a).state;
  const sb = run(b).state;
  expect(sb.size, `${label}: qubit count changed`).toBe(sa.size);
  expect(1 - fidelity(sa, sb), `${label}: state differs after round-trip`).toBeLessThan(1e-9);
}

const CASES: [name: string, c: Circuit][] = [
  ['empty', emptyCircuit(2, 'x')],
  ['single H', circuit(1, [g('h', [0])])],
  ['bell', circuit(2, [g('h', [0]), g('cx', [0, 1])])],
  ['ghz3', circuit(3, [g('h', [0]), g('cx', [0, 1]), g('cx', [1, 2])])],
  ['every 1q gate', circuit(1, [
    g('x', [0]), g('y', [0]), g('z', [0]), g('h', [0]),
    g('s', [0]), g('sdg', [0]), g('t', [0]), g('tdg', [0]),
  ])],
  ['rotations', circuit(1, [
    g('rx', [0], [PI / 3]), g('ry', [0], [-PI / 5]), g('rz', [0], [PI / 7]),
  ])],
  ['phase gates', circuit(2, [
    g('h', [0]), g('h', [1]), g('p', [0], [PI / 4]), g('cp', [0, 1], [PI / 2]),
  ])],
  ['two-qubit family', circuit(2, [
    g('h', [0]), g('cx', [0, 1]), g('cy', [0, 1]), g('cz', [0, 1]), g('swap', [0, 1]),
  ])],
  ['three-qubit family', circuit(3, [
    g('h', [0]), g('h', [1]), g('ccx', [0, 1, 2]), g('cswap', [0, 1, 2]),
  ])],
  ['negative and zero angles', circuit(1, [
    g('ry', [0], [0]), g('rx', [0], [-PI / 2]),
  ])],
];

describe('Qiskit round-trip', () => {
  for (const [name, c] of CASES) {
    it(`${name} survives toQiskit -> fromQiskit`, () => {
      const src = toQiskit(c);
      const { circuit: back, ignored } = fromQiskit(src);
      expect(ignored, `${name}: parser ignored lines it emitted itself`).toEqual([]);
      expect(back.ops.length, `${name}: gate count changed`).toBe(c.ops.length);
      sameState(c, back, name);
    });
  }

  it('reports what it could not parse rather than dropping it silently', () => {
    const { circuit: c, ignored } = fromQiskit(
      'qc = QuantumCircuit(2)\nqc.h(0)\nqc.mystery_gate(1)\nqc.cx(0, 1)\n'
    );
    expect(c.ops.map(o => o.name)).toEqual(['h', 'cx']);
    expect(ignored.length).toBe(1);
    expect(ignored[0]).toContain('mystery_gate');
  });

  it('survives comments, blank lines and imports', () => {
    const { circuit: c, ignored } = fromQiskit(
      'from qiskit import QuantumCircuit\n\n' +
      'qc = QuantumCircuit(2)  # two qubits\n' +
      '# put q0 in superposition\n' +
      'qc.h(0)\n' +
      'qc.cx(0, 1)\n'
    );
    expect(ignored).toEqual([]);
    sameState(circuit(2, [g('h', [0]), g('cx', [0, 1])]), c, 'commented source');
  });

  it('honours a circuit variable that is not called qc', () => {
    const { circuit: c, ignored } = fromQiskit('bell = QuantumCircuit(2)\nbell.h(0)\nbell.cx(0, 1)\n');
    expect(ignored).toEqual([]);
    expect(c.ops.map(o => o.name)).toEqual(['h', 'cx']);
  });
});
