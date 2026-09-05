/**
 * Static circuit checks.
 *
 * These run before simulation and feed both the canvas (red underlines) and the
 * tutor (which turns a diagnostic into an explanation and a proposed fix).
 */

import { ARITY, PARAMETRIC, type Circuit, type GateOp } from './ir';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  /** Which op it attaches to, if any. */
  opId?: string;
  qubits?: number[];
}

export function validate(c: Circuit): Diagnostic[] {
  const out: Diagnostic[] = [];

  if (c.qubits < 1) {
    out.push({ severity: 'error', code: 'no-qubits', message: 'A circuit needs at least one qubit.' });
    return out;
  }

  const measuredAt = new Map<number, string>(); // qubit -> id of the measurement

  for (const o of c.ops) {
    const expected = ARITY[o.name];
    if (expected === undefined) {
      out.push({ severity: 'error', code: 'unknown-gate', message: `Unknown gate "${o.name}".`, opId: o.id });
      continue;
    }
    if (o.qubits.length !== expected) {
      out.push({
        severity: 'error', code: 'arity',
        message: `${o.name.toUpperCase()} acts on ${expected} qubit${expected > 1 ? 's' : ''}, but ${o.qubits.length} ${o.qubits.length === 1 ? 'was' : 'were'} given.`,
        opId: o.id,
      });
      continue;
    }
    for (const q of o.qubits) {
      if (!Number.isInteger(q) || q < 0 || q >= c.qubits) {
        out.push({
          severity: 'error', code: 'qubit-range',
          message: `Qubit ${q} does not exist — this circuit has qubits 0 to ${c.qubits - 1}.`,
          opId: o.id, qubits: [q],
        });
      }
    }
    if (new Set(o.qubits).size !== o.qubits.length) {
      out.push({
        severity: 'error', code: 'repeated-qubit',
        message: `${o.name.toUpperCase()} uses the same qubit more than once. A control and its target must be different qubits.`,
        opId: o.id, qubits: o.qubits,
      });
    }
    if (PARAMETRIC.includes(o.name) && (o.params === undefined || !Number.isFinite(o.params[0]))) {
      out.push({
        severity: 'error', code: 'missing-param',
        message: `${o.name.toUpperCase()} needs an angle.`,
        opId: o.id,
      });
    }
    if (o.name === 'measure') {
      if (measuredAt.has(o.qubits[0])) {
        out.push({
          severity: 'warning', code: 'double-measure',
          message: `Qubit ${o.qubits[0]} is measured twice. The second measurement always repeats the first.`,
          opId: o.id, qubits: o.qubits,
        });
      }
      measuredAt.set(o.qubits[0], o.id);
    } else if (o.name !== 'barrier') {
      for (const q of o.qubits) {
        if (measuredAt.has(q)) {
          out.push({
            severity: 'warning', code: 'gate-after-measure',
            message: `Qubit ${q} was already measured, so this ${o.name.toUpperCase()} acts on a collapsed state. Did you mean to measure later?`,
            opId: o.id, qubits: [q],
          });
        }
      }
    }
  }

  return out;
}

export function hasErrors(d: Diagnostic[]): boolean {
  return d.some(x => x.severity === 'error');
}

/** True if the op touches a qubit that any earlier op also touched. */
export function dependsOnEarlier(ops: GateOp[], index: number): boolean {
  const mine = new Set(ops[index].qubits);
  for (let i = 0; i < index; i++) if (ops[i].qubits.some(q => mine.has(q))) return true;
  return false;
}
