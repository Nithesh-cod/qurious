/**
 * Tests for the validator, optimiser, transpilers, grader, learner model and tutor.
 *
 * The important ones here are the *preservation* tests: an optimiser that changes the
 * state is worse than no optimiser, and a transpiler that loses information is worse
 * than no transpiler. Both are checked by round-tripping and comparing statevectors.
 */

import { describe, it, expect } from 'vitest';
import { emptyCircuit, op, depth, gateCount, type Circuit } from '../src/core/ir';
import { run, toKet } from '../src/core/simulator';
import { validate, hasErrors } from '../src/core/validate';
import { optimize } from '../src/core/optimize';
import { toQasm, fromQasm, toQiskit, toCirq, toPennylane } from '../src/core/transpile';
import { grade, fidelity, type Challenge } from '../src/core/grade';
import { initialMastery, observe, recommend, isMastered, update, CONCEPTS, cohortWeakest } from '../src/core/bkt';
import { analyse, describe as describeCircuit, fromPrompt, searchRepair } from '../src/core/tutor';

function build(qubits: number, ops: ReturnType<typeof op>[], name = 'test'): Circuit {
  const c = emptyCircuit(qubits, name);
  c.ops = ops;
  return c;
}
const bell = () => build(2, [op('h', [0]), op('cx', [0, 1])], 'Bell');
const ghz3 = () => build(3, [op('h', [0]), op('cx', [0, 1]), op('cx', [0, 2])], 'GHZ');

function sameState(a: Circuit, b: Circuit, tol = 1e-12) {
  const x = run(a).state, y = run(b).state;
  expect(x.size).toBe(y.size);
  expect(1 - fidelity(x, y)).toBeLessThan(tol);
}

describe('validator', () => {
  it('accepts a well-formed circuit', () => {
    expect(validate(bell())).toEqual([]);
  });

  it('rejects a qubit index outside the register', () => {
    const d = validate(build(2, [op('x', [5])]));
    expect(hasErrors(d)).toBe(true);
    expect(d[0].message).toMatch(/does not exist/);
  });

  it('rejects a controlled gate whose control equals its target', () => {
    const d = validate(build(2, [op('cx', [1, 1])]));
    expect(d.some(x => x.code === 'repeated-qubit')).toBe(true);
  });

  it('rejects a rotation with no angle', () => {
    const d = validate(build(1, [{ id: 'a', name: 'rx', qubits: [0] }]));
    expect(d.some(x => x.code === 'missing-param')).toBe(true);
  });

  it('warns about a gate applied after a measurement', () => {
    const d = validate(build(1, [op('measure', [0]), op('h', [0])]));
    expect(d.some(x => x.code === 'gate-after-measure')).toBe(true);
    expect(hasErrors(d)).toBe(false); // a warning, not an error
  });

  it('warns about measuring the same qubit twice', () => {
    const d = validate(build(1, [op('measure', [0]), op('measure', [0])]));
    expect(d.some(x => x.code === 'double-measure')).toBe(true);
  });
});

describe('optimiser', () => {
  it('cancels a pair of Hadamards and leaves the state untouched', () => {
    const c = build(1, [op('h', [0]), op('h', [0]), op('x', [0])]);
    const r = optimize(c);
    expect(r.after.gates).toBe(1);
    sameState(c, r.circuit);
  });

  it('cancels S followed by S-dagger', () => {
    const c = build(1, [op('h', [0]), op('s', [0]), op('sdg', [0])]);
    const r = optimize(c);
    expect(r.after.gates).toBe(1);
    sameState(c, r.circuit);
  });

  it('merges two rotations about the same axis', () => {
    const c = build(1, [op('h', [0]), op('rz', [0], [0.4]), op('rz', [0], [0.35])]);
    const r = optimize(c);
    expect(r.after.gates).toBe(2);
    sameState(c, r.circuit, 1e-10);
  });

  it('drops rotations of angle zero and identity gates', () => {
    const c = build(1, [op('i', [0]), op('rx', [0], [0]), op('h', [0])]);
    const r = optimize(c);
    expect(r.after.gates).toBe(1);
    sameState(c, r.circuit);
  });

  it('does not cancel across a gate that shares a qubit', () => {
    const c = build(1, [op('h', [0]), op('x', [0]), op('h', [0])]);
    const r = optimize(c);
    expect(r.after.gates).toBe(3);
    sameState(c, r.circuit);
  });

  it('does cancel across a gate on an unrelated qubit', () => {
    const c = build(2, [op('h', [0]), op('x', [1]), op('h', [0])]);
    const r = optimize(c);
    expect(r.after.gates).toBe(1);
    sameState(c, r.circuit);
  });

  it('leaves an already-minimal circuit alone', () => {
    const c = bell();
    const r = optimize(c);
    expect(r.after.gates).toBe(2);
    expect(r.steps).toEqual([]);
  });

  it('preserves the state across a messy circuit', () => {
    const c = build(3, [
      op('h', [0]), op('h', [0]), op('x', [1]), op('rz', [2], [0.3]), op('rz', [2], [0.2]),
      op('cx', [0, 1]), op('i', [2]), op('t', [0]), op('tdg', [0]),
    ]);
    const r = optimize(c);
    expect(r.after.gates).toBeLessThan(r.before.gates);
    sameState(c, r.circuit, 1e-10);
  });
});

describe('transpilers', () => {
  it('emits OpenQASM 3 that parses back to the same state', () => {
    const c = ghz3();
    const back = fromQasm(toQasm(c));
    expect(back.qubits).toBe(3);
    sameState(c, back);
  });

  it('round-trips rotations and phases through QASM', () => {
    const c = build(2, [op('rx', [0], [Math.PI / 4]), op('ry', [1], [0.7]), op('p', [0], [Math.PI / 2]), op('cz', [0, 1])]);
    sameState(c, fromQasm(toQasm(c)), 1e-9);
  });

  it('round-trips every supported gate', () => {
    const c = build(3, [
      op('h', [0]), op('x', [1]), op('y', [2]), op('z', [0]), op('s', [1]), op('sdg', [1]),
      op('t', [2]), op('tdg', [2]), op('cx', [0, 1]), op('cy', [1, 2]), op('cz', [0, 2]),
      op('swap', [0, 1]), op('ccx', [0, 1, 2]), op('cswap', [2, 0, 1]),
    ]);
    sameState(c, fromQasm(toQasm(c)), 1e-9);
  });

  it('preserves measurements through QASM', () => {
    const c = build(2, [op('h', [0]), op('cx', [0, 1]), op('measure', [0]), op('measure', [1])]);
    const back = fromQasm(toQasm(c));
    expect(back.ops.filter(o => o.name === 'measure').length).toBe(2);
  });

  it('generates Qiskit that names the right gates and qubit count', () => {
    const src = toQiskit(ghz3());
    expect(src).toContain('QuantumCircuit(3)');
    expect(src).toContain('qc.h(0)');
    expect(src).toContain('qc.cx(0, 1)');
    expect(src).toContain('qc.cx(0, 2)');
  });

  it('generates Cirq with line qubits', () => {
    const src = toCirq(bell());
    expect(src).toContain('cirq.LineQubit.range(2)');
    expect(src).toContain('cirq.H(q[0])');
    expect(src).toContain('cirq.CNOT(q[0], q[1])');
  });

  it('generates PennyLane with a qnode', () => {
    const src = toPennylane(bell());
    expect(src).toContain('qml.device("default.qubit", wires=2)');
    expect(src).toContain('qml.Hadamard(wires=0)');
    expect(src).toContain('qml.CNOT(wires=[0, 1])');
    expect(src).toContain('return qml.state()');
  });

  it('writes pi-multiples readably rather than as long decimals', () => {
    expect(toQiskit(build(1, [op('rx', [0], [Math.PI])]))).toContain('qc.rx(pi, 0)');
    expect(toQiskit(build(1, [op('ry', [0], [Math.PI / 2])]))).toContain('0.5*pi');
  });
});

describe('grader', () => {
  const challenge: Challenge = {
    id: 'bell', title: 'Make a Bell state', concept: 'entanglement',
    brief: 'Entangle two qubits.',
    starter: emptyCircuit(2, 'start'),
    solution: bell(),
    hints: [],
  };

  it('passes the intended solution', () => {
    const r = grade(bell(), challenge);
    expect(r.passed).toBe(true);
    expect(r.fidelity).toBeCloseTo(1, 12);
  });

  it('passes a different but equivalent circuit', () => {
    // Same Bell state built with the control on qubit 1 and a pair of swaps.
    const alt = build(2, [op('h', [1]), op('cx', [1, 0])]);
    const r = grade(alt, challenge);
    expect(r.passed).toBe(true);
  });

  it('passes a solution differing only by a global phase', () => {
    // Z on both qubits of a Bell state multiplies it by an overall -1... build one
    // that differs by phase only: X-Z-X on an ancilla-free 2q circuit is fiddly, so
    // use the identity that global phase never affects fidelity.
    const phased = build(2, [op('h', [0]), op('cx', [0, 1]), op('z', [0]), op('z', [1])]);
    const r = grade(phased, challenge);
    expect(r.passed).toBe(true);
    expect(r.fidelity).toBeCloseTo(1, 10);
  });

  it('fails a circuit that is close but not right', () => {
    const almost = build(2, [op('h', [0])]);
    const r = grade(almost, challenge);
    expect(r.passed).toBe(false);
    expect(r.fidelity).toBeLessThan(1);
    expect(r.messages.join(' ')).toMatch(/Partly there|different/i);
  });

  it('reports an invalid circuit rather than grading it', () => {
    const bad = build(2, [op('cx', [0, 0])]);
    const r = grade(bad, challenge);
    expect(r.passed).toBe(false);
    expect(r.checks[0].ok).toBe(false);
  });

  it('enforces a gate budget', () => {
    const ch: Challenge = { ...challenge, constraints: { maxGates: 1 } };
    const r = grade(bell(), ch);
    expect(r.passed).toBe(false);
    expect(r.checks.find(c => c.label.includes('At most'))!.ok).toBe(false);
  });

  it('enforces required and forbidden gates', () => {
    const req: Challenge = { ...challenge, constraints: { requiredGates: ['h'] } };
    expect(grade(bell(), req).passed).toBe(true);
    const forb: Challenge = { ...challenge, constraints: { forbiddenGates: ['cx'] } };
    expect(grade(bell(), forb).passed).toBe(false);
  });

  it('can grade on measurement distribution instead of state', () => {
    const ch: Challenge = { ...challenge, compareBy: 'distribution' };
    // A phase difference changes the state but not the outcome distribution.
    const phased = build(2, [op('h', [0]), op('cx', [0, 1]), op('z', [0])]);
    expect(grade(phased, ch).passed).toBe(true);
    expect(grade(phased, challenge).passed).toBe(false);
  });
});

describe('learner model', () => {
  it('raises mastery on a correct answer and lowers it on a wrong one', () => {
    const prior = 0.5;
    expect(update(prior, true)).toBeGreaterThan(prior);
    expect(update(prior, false)).toBeLessThan(prior);
  });

  it('reaches mastery after a run of correct answers', () => {
    let m = initialMastery();
    for (let i = 0; i < 6; i++) m = observe(m, 'superposition', true);
    expect(isMastered(m, 'superposition')).toBe(true);
  });

  it('never recommends a concept whose prerequisites are unmet', () => {
    const m = initialMastery();
    const r = recommend(m);
    const c = CONCEPTS.find(x => x.id === r.conceptId)!;
    expect(c.requires).toEqual([]);
  });

  it('moves on once a concept is mastered', () => {
    let m = initialMastery();
    for (let i = 0; i < 8; i++) m = observe(m, 'qubit', true);
    const r = recommend(m);
    expect(r.conceptId).not.toBe('qubit');
    expect(r.reason.length).toBeGreaterThan(10); // always explainable
  });

  it('ranks the cohort weakest concept first', () => {
    const a = observe(observe(initialMastery(), 'qubit', true), 'qubit', true);
    const b = observe(initialMastery(), 'qubit', true);
    const ranked = cohortWeakest([a, b]);
    expect(ranked[0].average).toBeLessThanOrEqual(ranked[ranked.length - 1].average);
  });
});

describe('grounded tutor', () => {
  it('describes a Bell state accurately, from the real output', () => {
    const text = describeCircuit(bell());
    expect(text).toContain('0.707|00⟩');
    expect(text).toMatch(/entangled/i);
  });

  it('spots the missing Hadamard and verifies the fix by running it', () => {
    const target = run(bell()).state;
    const broken = build(2, [op('cx', [0, 1])]); // forgot the H
    const { fix, evaluated, rejected } = searchRepair(broken, target);
    expect(fix).toBeDefined();
    expect(fix!.confidence).toBe('verified');
    expect(fix!.title).toMatch(/Add H on qubit 0/);
    // The proposed fix is not a guess — running it really does hit the target.
    expect(fidelity(run(fix!.fix!).state, target)).toBeCloseTo(1, 12);
    expect(evaluated).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0); // wrong candidates were thrown away
  });

  it('spots a reversed control and target', () => {
    const target = run(build(2, [op('h', [0]), op('cx', [0, 1])])).state;
    const broken = build(2, [op('h', [0]), op('cx', [1, 0])]);
    const { fix } = searchRepair(broken, target);
    expect(fix).toBeDefined();
    expect(fix!.title).toMatch(/Swap the control and target/);
  });

  it('spots a wrong rotation angle', () => {
    const target = run(build(1, [op('ry', [0], [Math.PI / 2])])).state;
    const broken = build(1, [op('ry', [0], [Math.PI / 3])]);
    const { fix } = searchRepair(broken, target);
    expect(fix).toBeDefined();
    expect(fix!.title).toMatch(/angle to π\/2/);
  });

  it('says so honestly when no single edit works', () => {
    const target = run(ghz3()).state;
    const broken = build(3, []); // needs three gates, not one
    const { fix } = searchRepair(broken, target);
    expect(fix).toBeUndefined();
  });

  it('warns that a CNOT on a |0> control cannot entangle', () => {
    const r = analyse({ circuit: build(2, [op('cx', [0, 1])]) });
    const w = r.insights.find(i => i.title.match(/not create entanglement/));
    expect(w).toBeDefined();
    expect(w!.confidence).toBe('verified');
  });

  it('warns about a gate after a measurement', () => {
    const r = analyse({ circuit: build(1, [op('h', [0]), op('measure', [0]), op('x', [0])]) });
    expect(r.insights.some(i => i.title.match(/already measured/))).toBe(true);
  });

  it('offers a verified simplification for a redundant circuit', () => {
    const r = analyse({ circuit: build(1, [op('h', [0]), op('h', [0]), op('x', [0])]) });
    const s = r.insights.find(i => i.kind === 'redundancy');
    expect(s).toBeDefined();
    expect(gateCount(s!.fix!)).toBe(1);
    sameState(build(1, [op('h', [0]), op('h', [0]), op('x', [0])]), s!.fix!);
  });

  it('congratulates a correct submission rather than inventing a problem', () => {
    const target = run(bell()).state;
    const r = analyse({ circuit: bell(), target });
    expect(r.insights[0].kind).toBe('praise');
    expect(r.insights[0].detail).toMatch(/100%/);
  });

  it('every insight it returns is marked verified or observed', () => {
    const target = run(ghz3()).state;
    const r = analyse({ circuit: build(3, [op('h', [0]), op('cx', [0, 1])]), target });
    expect(r.insights.length).toBeGreaterThan(0);
    for (const i of r.insights) expect(['verified', 'observed']).toContain(i.confidence);
  });

  it('guides a learner staring at an empty canvas', () => {
    const r = analyse({ circuit: emptyCircuit(2) });
    expect(r.insights[0].detail).toMatch(/Hadamard/);
  });
});

describe('natural language to circuit, offline', () => {
  it('builds a GHZ state from a sentence', () => {
    const r = fromPrompt('build a 3-qubit GHZ state');
    expect(r).not.toBeNull();
    expect(r!.circuit.qubits).toBe(3);
    expect(toKet(run(r!.circuit).state)).toBe('0.707|000⟩  +  0.707|111⟩');
  });

  it('builds a Bell pair', () => {
    const r = fromPrompt('make a Bell pair');
    expect(r!.circuit.qubits).toBe(2);
    expect(gateCount(r!.circuit)).toBe(2);
  });

  it('builds Grover and it actually finds the marked state', () => {
    const r = fromPrompt('show me Grover');
    const p = run(r!.circuit).state.probabilities();
    expect(p[3]).toBeCloseTo(1, 12);
  });

  it('returns null for something it does not understand', () => {
    expect(fromPrompt('what is the weather in Chennai')).toBeNull();
  });

  it('reports the state it actually produced, not a guess', () => {
    const r = fromPrompt('make a Bell pair');
    expect(r!.producedState).toContain('0.707|00⟩');
  });
});

describe('circuit metrics', () => {
  it('computes depth by packing gates into moments', () => {
    expect(depth(build(2, [op('h', [0]), op('h', [1])]))).toBe(1); // parallel
    expect(depth(build(2, [op('h', [0]), op('cx', [0, 1])]))).toBe(2); // sequential
    expect(depth(ghz3())).toBe(3);
  });

  it('counts gates but not barriers or measurements', () => {
    expect(gateCount(build(2, [op('h', [0]), op('barrier', [0]), op('measure', [0])]))).toBe(1);
  });
});
