/**
 * Circuit optimiser passes.
 *
 * Each pass returns a new circuit plus a plain-English note about what it removed,
 * so the UI can show the learner *why* their circuit got shorter rather than just
 * silently rewriting it. Every rewrite here preserves the state exactly (up to
 * floating point), which the test suite checks by comparing statevectors.
 */

import { cloneCircuit, gateCount, depth, type Circuit, type GateOp } from './ir';
import { INVERSE_OF } from './gates';

export interface OptimizationStep {
  pass: string;
  removed: number;
  note: string;
}

export interface OptimizeResult {
  circuit: Circuit;
  steps: OptimizationStep[];
  before: { gates: number; depth: number };
  after: { gates: number; depth: number };
}

const TWO_PI = Math.PI * 2;

function sameQubits(a: GateOp, b: GateOp): boolean {
  return a.qubits.length === b.qubits.length && a.qubits.every((q, i) => q === b.qubits[i]);
}

/** Do these two ops share any qubit? If not they commute trivially. */
function overlaps(a: GateOp, b: GateOp): boolean {
  return a.qubits.some(q => b.qubits.includes(q));
}

/**
 * Pass 1 — cancel a gate immediately followed by its own inverse on the same qubits,
 * skipping over intervening ops that touch entirely different qubits.
 */
function cancelInverses(ops: GateOp[]): { ops: GateOp[]; removed: number } {
  const alive = ops.slice();
  let removed = 0;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      if (a.name === 'barrier' || a.name === 'measure') continue;
      const inv = INVERSE_OF[a.name];
      if (!inv) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (!overlaps(a, b)) continue;              // independent, keep looking
        if (b.name === inv && sameQubits(a, b)) {
          alive.splice(j, 1);
          alive.splice(i, 1);
          removed += 2;
          changed = true;
          break outer;
        }
        break;                                       // something else touches the qubits
      }
    }
  }
  return { ops: alive, removed };
}

/** Pass 2 — merge adjacent rotations about the same axis on the same qubit. */
function mergeRotations(ops: GateOp[]): { ops: GateOp[]; removed: number } {
  const alive = ops.slice();
  let removed = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < alive.length - 1; i++) {
      const a = alive[i];
      if (!['rx', 'ry', 'rz', 'p'].includes(a.name)) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (!overlaps(a, b)) continue;
        if (b.name === a.name && sameQubits(a, b)) {
          const total = ((a.params?.[0] ?? 0) + (b.params?.[0] ?? 0)) % TWO_PI;
          alive.splice(j, 1);
          if (Math.abs(total) < 1e-12 || Math.abs(Math.abs(total) - TWO_PI) < 1e-12) {
            alive.splice(i, 1);
            removed += 2;
          } else {
            alive[i] = { ...a, params: [total] };
            removed += 1;
          }
          changed = true;
        }
        break;
      }
      if (changed) break;
    }
  }
  return { ops: alive, removed };
}

/** Pass 3 — drop identities and zero-angle rotations. */
function dropIdentities(ops: GateOp[]): { ops: GateOp[]; removed: number } {
  const before = ops.length;
  const alive = ops.filter(o => {
    if (o.name === 'i') return false;
    if (['rx', 'ry', 'rz', 'p'].includes(o.name)) {
      const t = Math.abs((o.params?.[0] ?? 0) % TWO_PI);
      if (t < 1e-12 || Math.abs(t - TWO_PI) < 1e-12) return false;
    }
    return true;
  });
  return { ops: alive, removed: before - alive.length };
}

export function optimize(c: Circuit): OptimizeResult {
  const before = { gates: gateCount(c), depth: depth(c) };
  let ops = cloneCircuit(c).ops;
  const steps: OptimizationStep[] = [];

  const d = dropIdentities(ops); ops = d.ops;
  if (d.removed) steps.push({ pass: 'identities', removed: d.removed, note: `Removed ${d.removed} gate${d.removed > 1 ? 's' : ''} that do nothing at all.` });

  const inv = cancelInverses(ops); ops = inv.ops;
  if (inv.removed) steps.push({ pass: 'inverse-pairs', removed: inv.removed, note: `Cancelled ${inv.removed / 2} pair${inv.removed > 2 ? 's' : ''} of gates that undo each other — H followed by H, X followed by X, and so on.` });

  const rot = mergeRotations(ops); ops = rot.ops;
  if (rot.removed) steps.push({ pass: 'rotation-merge', removed: rot.removed, note: `Merged rotations about the same axis: two turns of θ and φ become one turn of θ+φ.` });

  const out: Circuit = { ...cloneCircuit(c), ops };
  return { circuit: out, steps, before, after: { gates: gateCount(out), depth: depth(out) } };
}
