/**
 * Transpilers.
 *
 * One IR in, four ecosystems out. This is the payoff of having a single circuit
 * representation: supporting another SDK is one function here, not another product.
 *
 * OpenQASM 3 also comes back *in*, so circuits built anywhere else are importable.
 */

import { ARITY, PARAMETRIC, emptyCircuit, newId, type Circuit, type GateName, type GateOp } from './ir';

export type Target = 'qasm' | 'qiskit' | 'cirq' | 'pennylane';

export const TARGET_LABEL: Record<Target, string> = {
  qasm: 'OpenQASM 3',
  qiskit: 'Qiskit',
  cirq: 'Cirq',
  pennylane: 'PennyLane',
};

export const TARGET_LANG: Record<Target, string> = {
  qasm: 'qasm', qiskit: 'python', cirq: 'python', pennylane: 'python',
};

/**
 * Render an angle for generated code.
 *
 * Clean multiples of pi are written symbolically because they are far easier to read,
 * but anything else is emitted at full double precision. Rounding here would silently
 * change the circuit — an earlier version truncated to six decimals and shifted the
 * resulting state by about 1e-7, which the Qiskit cross-check caught.
 */
const rad = (v: number) => {
  const overPi = v / Math.PI;
  const rounded = Math.round(overPi * 4) / 4;
  if (Math.abs(overPi - rounded) < 1e-12 && rounded !== 0) {
    if (rounded === 1) return 'pi';
    if (rounded === -1) return '-pi';
    return `${rounded}*pi`;
  }
  return String(v);
};

// ---------------------------------------------------------------- OpenQASM 3

const QASM_NAME: Partial<Record<GateName, string>> = {
  i: 'id', x: 'x', y: 'y', z: 'z', h: 'h', s: 's', sdg: 'sdg', t: 't', tdg: 'tdg',
  rx: 'rx', ry: 'ry', rz: 'rz', p: 'p', cx: 'cx', cy: 'cy', cz: 'cz', cp: 'cp',
  swap: 'swap', ccx: 'ccx', cswap: 'cswap',
};

export function toQasm(c: Circuit): string {
  const L: string[] = [
    'OPENQASM 3.0;',
    'include "stdgates.inc";',
    '',
    `qubit[${c.qubits}] q;`,
    `bit[${c.qubits}] meas;`,
    '',
  ];
  for (const o of c.ops) {
    if (o.name === 'barrier') { L.push(`barrier q;`); continue; }
    if (o.name === 'measure') { L.push(`meas[${o.qubits[0]}] = measure q[${o.qubits[0]}];`); continue; }
    const name = QASM_NAME[o.name];
    if (!name) continue;
    const args = o.qubits.map(q => `q[${q}]`).join(', ');
    const params = o.params?.length ? `(${o.params.map(rad).join(', ')})` : '';
    L.push(`${name}${params} ${args};`);
  }
  return L.join('\n') + '\n';
}

/** Parse a useful subset of OpenQASM 3 back into the IR. */
export function fromQasm(src: string): Circuit {
  const c = emptyCircuit(1, 'Imported');
  let qubits = 0;
  const ops: GateOp[] = [];

  const declRe = /qubit\s*\[\s*(\d+)\s*\]\s*(\w+)/;
  const gateRe = /^\s*(\w+)\s*(?:\(([^)]*)\))?\s+(.+?);\s*$/;
  const idxRe = /\w+\s*\[\s*(\d+)\s*\]/g;

  const REVERSE: Record<string, GateName> = Object.entries(QASM_NAME)
    .reduce((m, [k, v]) => (v ? { ...m, [v]: k as GateName } : m), {});

  for (const raw of src.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith('OPENQASM') || line.startsWith('include') || line.startsWith('bit')) continue;

    const decl = declRe.exec(line);
    if (decl) { qubits = Math.max(qubits, parseInt(decl[1], 10)); continue; }

    if (line.startsWith('barrier')) { ops.push({ id: newId(), name: 'barrier', qubits: [0] }); continue; }

    if (line.includes('measure')) {
      const m = /measure\s+\w+\s*\[\s*(\d+)\s*\]/.exec(line);
      if (m) ops.push({ id: newId(), name: 'measure', qubits: [parseInt(m[1], 10)] });
      continue;
    }

    const g = gateRe.exec(line);
    if (!g) continue;
    const name = REVERSE[g[1]];
    if (!name) continue;
    const qs: number[] = [];
    let m: RegExpExecArray | null;
    idxRe.lastIndex = 0;
    while ((m = idxRe.exec(g[3])) !== null) qs.push(parseInt(m[1], 10));
    if (!qs.length) continue;
    const params = g[2]
      ? g[2].split(',').map(s => {
          const t = s.trim().replace(/pi/gi, String(Math.PI));
          try { return Function(`"use strict";return (${t})`)() as number; } catch { return 0; }
        })
      : undefined;
    ops.push({ id: newId(), name, qubits: qs, ...(params ? { params } : {}) });
    qubits = Math.max(qubits, ...qs.map(q => q + 1));
  }

  c.qubits = Math.max(1, qubits);
  c.ops = ops;
  return c;
}

// ---------------------------------------------------------------- Qiskit

const QISKIT_CALL: Partial<Record<GateName, (o: GateOp) => string>> = {
  i: o => `qc.id(${o.qubits[0]})`,
  x: o => `qc.x(${o.qubits[0]})`,
  y: o => `qc.y(${o.qubits[0]})`,
  z: o => `qc.z(${o.qubits[0]})`,
  h: o => `qc.h(${o.qubits[0]})`,
  s: o => `qc.s(${o.qubits[0]})`,
  sdg: o => `qc.sdg(${o.qubits[0]})`,
  t: o => `qc.t(${o.qubits[0]})`,
  tdg: o => `qc.tdg(${o.qubits[0]})`,
  rx: o => `qc.rx(${rad(o.params![0])}, ${o.qubits[0]})`,
  ry: o => `qc.ry(${rad(o.params![0])}, ${o.qubits[0]})`,
  rz: o => `qc.rz(${rad(o.params![0])}, ${o.qubits[0]})`,
  p: o => `qc.p(${rad(o.params![0])}, ${o.qubits[0]})`,
  cx: o => `qc.cx(${o.qubits[0]}, ${o.qubits[1]})`,
  cy: o => `qc.cy(${o.qubits[0]}, ${o.qubits[1]})`,
  cz: o => `qc.cz(${o.qubits[0]}, ${o.qubits[1]})`,
  cp: o => `qc.cp(${rad(o.params![0])}, ${o.qubits[0]}, ${o.qubits[1]})`,
  swap: o => `qc.swap(${o.qubits[0]}, ${o.qubits[1]})`,
  ccx: o => `qc.ccx(${o.qubits[0]}, ${o.qubits[1]}, ${o.qubits[2]})`,
  cswap: o => `qc.cswap(${o.qubits[0]}, ${o.qubits[1]}, ${o.qubits[2]})`,
  barrier: () => `qc.barrier()`,
  measure: o => `qc.measure(${o.qubits[0]}, ${o.qubits[0]})`,
};

export function toQiskit(c: Circuit): string {
  const anyMeasure = c.ops.some(o => o.name === 'measure');
  const L = [
    'from qiskit import QuantumCircuit',
    'from qiskit.quantum_info import Statevector',
    '',
    anyMeasure ? `qc = QuantumCircuit(${c.qubits}, ${c.qubits})` : `qc = QuantumCircuit(${c.qubits})`,
  ];
  for (const o of c.ops) {
    const fn = QISKIT_CALL[o.name];
    if (fn) L.push(fn(o));
  }
  L.push('', 'print(qc.draw())');
  if (!anyMeasure) L.push('print(Statevector(qc))');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- Cirq

const CIRQ_CALL: Partial<Record<GateName, (o: GateOp) => string>> = {
  i: o => `cirq.I(q[${o.qubits[0]}])`,
  x: o => `cirq.X(q[${o.qubits[0]}])`,
  y: o => `cirq.Y(q[${o.qubits[0]}])`,
  z: o => `cirq.Z(q[${o.qubits[0]}])`,
  h: o => `cirq.H(q[${o.qubits[0]}])`,
  s: o => `cirq.S(q[${o.qubits[0]}])`,
  sdg: o => `cirq.S(q[${o.qubits[0]}]) ** -1`,
  t: o => `cirq.T(q[${o.qubits[0]}])`,
  tdg: o => `cirq.T(q[${o.qubits[0]}]) ** -1`,
  rx: o => `cirq.rx(${rad(o.params![0])})(q[${o.qubits[0]}])`,
  ry: o => `cirq.ry(${rad(o.params![0])})(q[${o.qubits[0]}])`,
  rz: o => `cirq.rz(${rad(o.params![0])})(q[${o.qubits[0]}])`,
  p: o => `cirq.Z(q[${o.qubits[0]}]) ** (${rad(o.params![0])} / np.pi)`,
  cx: o => `cirq.CNOT(q[${o.qubits[0]}], q[${o.qubits[1]}])`,
  cy: o => `cirq.ControlledGate(cirq.Y)(q[${o.qubits[0]}], q[${o.qubits[1]}])`,
  cz: o => `cirq.CZ(q[${o.qubits[0]}], q[${o.qubits[1]}])`,
  cp: o => `cirq.CZ(q[${o.qubits[0]}], q[${o.qubits[1]}]) ** (${rad(o.params![0])} / np.pi)`,
  swap: o => `cirq.SWAP(q[${o.qubits[0]}], q[${o.qubits[1]}])`,
  ccx: o => `cirq.TOFFOLI(q[${o.qubits[0]}], q[${o.qubits[1]}], q[${o.qubits[2]}])`,
  cswap: o => `cirq.FREDKIN(q[${o.qubits[0]}], q[${o.qubits[1]}], q[${o.qubits[2]}])`,
  measure: o => `cirq.measure(q[${o.qubits[0]}], key='m${o.qubits[0]}')`,
};

export function toCirq(c: Circuit): string {
  const L = [
    'import cirq',
    'import numpy as np',
    '',
    `q = cirq.LineQubit.range(${c.qubits})`,
    'circuit = cirq.Circuit([',
  ];
  for (const o of c.ops) {
    const fn = CIRQ_CALL[o.name];
    if (fn) L.push(`    ${fn(o)},`);
  }
  L.push('])', '', 'print(circuit)', 'print(cirq.Simulator().simulate(circuit))');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- PennyLane

const PL_CALL: Partial<Record<GateName, (o: GateOp) => string>> = {
  i: o => `qml.Identity(wires=${o.qubits[0]})`,
  x: o => `qml.PauliX(wires=${o.qubits[0]})`,
  y: o => `qml.PauliY(wires=${o.qubits[0]})`,
  z: o => `qml.PauliZ(wires=${o.qubits[0]})`,
  h: o => `qml.Hadamard(wires=${o.qubits[0]})`,
  s: o => `qml.S(wires=${o.qubits[0]})`,
  sdg: o => `qml.adjoint(qml.S)(wires=${o.qubits[0]})`,
  t: o => `qml.T(wires=${o.qubits[0]})`,
  tdg: o => `qml.adjoint(qml.T)(wires=${o.qubits[0]})`,
  rx: o => `qml.RX(${rad(o.params![0])}, wires=${o.qubits[0]})`,
  ry: o => `qml.RY(${rad(o.params![0])}, wires=${o.qubits[0]})`,
  rz: o => `qml.RZ(${rad(o.params![0])}, wires=${o.qubits[0]})`,
  p: o => `qml.PhaseShift(${rad(o.params![0])}, wires=${o.qubits[0]})`,
  cx: o => `qml.CNOT(wires=[${o.qubits[0]}, ${o.qubits[1]}])`,
  cy: o => `qml.CY(wires=[${o.qubits[0]}, ${o.qubits[1]}])`,
  cz: o => `qml.CZ(wires=[${o.qubits[0]}, ${o.qubits[1]}])`,
  cp: o => `qml.ControlledPhaseShift(${rad(o.params![0])}, wires=[${o.qubits[0]}, ${o.qubits[1]}])`,
  swap: o => `qml.SWAP(wires=[${o.qubits[0]}, ${o.qubits[1]}])`,
  ccx: o => `qml.Toffoli(wires=[${o.qubits[0]}, ${o.qubits[1]}, ${o.qubits[2]}])`,
  cswap: o => `qml.CSWAP(wires=[${o.qubits[0]}, ${o.qubits[1]}, ${o.qubits[2]}])`,
};

export function toPennylane(c: Circuit): string {
  const L = [
    'import pennylane as qml',
    'from pennylane import numpy as np',
    '',
    `dev = qml.device("default.qubit", wires=${c.qubits})`,
    '',
    '@qml.qnode(dev)',
    'def circuit():',
  ];
  const body = c.ops.map(o => PL_CALL[o.name]?.(o)).filter(Boolean) as string[];
  if (!body.length) L.push('    pass');
  else body.forEach(b => L.push(`    ${b}`));
  L.push('    return qml.state()', '', 'print(circuit())');
  return L.join('\n') + '\n';
}

export function transpile(c: Circuit, target: Target): string {
  switch (target) {
    case 'qasm': return toQasm(c);
    case 'qiskit': return toQiskit(c);
    case 'cirq': return toCirq(c);
    case 'pennylane': return toPennylane(c);
  }
}

// ---------------------------------------------------------------- Qiskit -> IR

const QISKIT_METHOD: Record<string, GateName> = {
  id: 'i', x: 'x', y: 'y', z: 'z', h: 'h', s: 's', sdg: 'sdg', t: 't', tdg: 'tdg',
  rx: 'rx', ry: 'ry', rz: 'rz', p: 'p', u1: 'p',
  cx: 'cx', cnot: 'cx', cy: 'cy', cz: 'cz', cp: 'cp', cu1: 'cp', swap: 'swap',
  ccx: 'ccx', toffoli: 'ccx', cswap: 'cswap', fredkin: 'cswap',
  measure: 'measure', barrier: 'barrier',
};

/** Evaluate a simple numeric expression such as "pi/2" or "-3*pi/4". */
function evalAngle(expr: string): number {
  const cleaned = expr.trim().replace(/np\.pi|math\.pi|numpy\.pi/gi, 'pi').replace(/pi/gi, String(Math.PI));
  if (!/^[-+*/(). 0-9eE]+$/.test(cleaned)) return NaN;
  try {
    const v = Function(`"use strict";return (${cleaned})`)() as number;
    return Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

/**
 * Parse a Qiskit program back into the IR.
 *
 * Deliberately a subset: `QuantumCircuit(n)` plus `qc.<gate>(...)` calls, which is what
 * a learner actually writes in a lesson. Anything it does not recognise is reported by
 * line so the editor can point at it, rather than being silently dropped.
 */
export function fromQiskit(src: string): { circuit: Circuit; ignored: string[] } {
  const ops: GateOp[] = [];
  const ignored: string[] = [];
  let qubits = 0;
  let varName = 'qc';

  const declRe = /(\w+)\s*=\s*QuantumCircuit\s*\(\s*(\d+)/;
  const callRe = /^(\w+)\.(\w+)\s*\((.*)\)\s*$/;

  src.split('\n').forEach((raw, idx) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;

    const decl = declRe.exec(line);
    if (decl) {
      varName = decl[1];
      qubits = Math.max(qubits, parseInt(decl[2], 10));
      return;
    }
    if (/^(from|import|print)\b/.test(line)) return;

    const call = callRe.exec(line);
    if (!call) {
      ignored.push(`line ${idx + 1}: ${line}`);
      return;
    }
    const [, obj, method, argStr] = call;
    if (obj !== varName) { ignored.push(`line ${idx + 1}: unknown object "${obj}"`); return; }

    const name = QISKIT_METHOD[method.toLowerCase()];
    if (!name) { ignored.push(`line ${idx + 1}: unsupported method "${method}"`); return; }

    if (name === 'barrier') { ops.push({ id: newId(), name, qubits: [0] }); return; }

    const args = argStr.split(',').map(s => s.trim()).filter(Boolean);
    const wantsAngle = PARAMETRIC.includes(name);
    const params = wantsAngle ? [evalAngle(args[0] ?? '0')] : undefined;
    const qArgs = wantsAngle ? args.slice(1) : args;

    // qc.measure(q, c) — the classical target is not part of our IR.
    const qs = (name === 'measure' ? qArgs.slice(0, 1) : qArgs)
      .map(a => parseInt(a.replace(/[^\d-]/g, ''), 10))
      .filter(n => Number.isFinite(n));

    if (!qs.length || qs.length !== ARITY[name]) {
      ignored.push(`line ${idx + 1}: ${method} expects ${ARITY[name]} qubit(s)`);
      return;
    }
    if (params && !Number.isFinite(params[0])) {
      ignored.push(`line ${idx + 1}: could not read the angle "${args[0]}"`);
      return;
    }

    ops.push({ id: newId(), name, qubits: qs, ...(params ? { params } : {}) });
    qubits = Math.max(qubits, ...qs.map(q => q + 1));
  });

  return { circuit: { version: 1, name: 'Imported', qubits: Math.max(1, qubits), ops }, ignored };
}
