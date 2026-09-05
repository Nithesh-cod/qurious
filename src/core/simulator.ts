/**
 * Statevector simulator.
 *
 * Runs on the learner's own device — in the browser tab and inside the Android app.
 * That single fact is what removes the queue, the account, the cost, the latency and
 * the internet connection from learning quantum computing.
 *
 * Amplitudes live in two Float64Arrays of length 2^n. A 12-qubit state is 4096
 * complex numbers, which is nothing for a modern phone.
 */

import type { Circuit, GateOp } from './ir';
import { matrixFor, type Mat2 } from './gates';

export interface SimOptions {
  /** Deterministic sampling for reproducible tests and lessons. */
  seed?: number;
  /** Guard rail so a runaway circuit cannot lock the UI thread. */
  maxQubits?: number;
}

export const DEFAULT_MAX_QUBITS = 12;

export class Statevector {
  readonly n: number;
  readonly size: number;
  re: Float64Array;
  im: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.size = 1 << n;
    this.re = new Float64Array(this.size);
    this.im = new Float64Array(this.size);
    this.re[0] = 1; // |00...0>
  }

  static fromAmplitudes(re: number[], im: number[]): Statevector {
    const n = Math.round(Math.log2(re.length));
    const sv = new Statevector(n);
    sv.re.set(re);
    sv.im.set(im);
    return sv;
  }

  clone(): Statevector {
    const sv = new Statevector(this.n);
    sv.re.set(this.re);
    sv.im.set(this.im);
    return sv;
  }

  /** Apply a 2x2 unitary to `target`, optionally gated on a control bitmask. */
  apply1q(m: Mat2, target: number, controlMask = 0): void {
    const bit = 1 << target;
    const { re, im, size } = this;
    const [aR, aI, bR, bI, cR, cI, dR, dI] = m as number[];
    for (let i = 0; i < size; i++) {
      if (i & bit) continue;                       // visit each pair once, from the 0 side
      if ((i & controlMask) !== controlMask) continue;
      const j = i | bit;
      const x0r = re[i], x0i = im[i];
      const x1r = re[j], x1i = im[j];
      re[i] = aR * x0r - aI * x0i + bR * x1r - bI * x1i;
      im[i] = aR * x0i + aI * x0r + bR * x1i + bI * x1r;
      re[j] = cR * x0r - cI * x0i + dR * x1r - dI * x1i;
      im[j] = cR * x0i + cI * x0r + dR * x1i + dI * x1r;
    }
  }

  /** Exchange two qubits, optionally gated on a control bitmask. */
  swap(a: number, b: number, controlMask = 0): void {
    if (a === b) return;
    const ba = 1 << a, bb = 1 << b;
    const { re, im, size } = this;
    for (let i = 0; i < size; i++) {
      const hasA = (i & ba) !== 0, hasB = (i & bb) !== 0;
      if (hasA === hasB) continue;
      if (!hasA) continue;                          // handle each pair once
      if ((i & controlMask) !== controlMask) continue;
      const j = (i & ~ba) | bb;
      const tr = re[i], ti = im[i];
      re[i] = re[j]; im[i] = im[j];
      re[j] = tr; im[j] = ti;
    }
  }

  /** Probability of each computational basis state. */
  probabilities(): Float64Array {
    const p = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) p[i] = this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return p;
  }

  /** Probability that a single qubit reads 1. */
  probabilityOfOne(qubit: number): number {
    const bit = 1 << qubit;
    let p = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & bit) p += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    return p;
  }

  /**
   * Bloch vector for one qubit, from its reduced density matrix.
   * rho = 1/2 (I + x*sigma_x + y*sigma_y + z*sigma_z), so
   *   x = 2*Re(rho01),  y = -2*Im(rho01),  z = rho00 - rho11.
   * The length of the vector is 1 for a pure single-qubit state and shrinks
   * toward 0 as the qubit becomes entangled with the rest of the register —
   * which is exactly what makes entanglement visible on the sphere.
   */
  bloch(qubit: number): { x: number; y: number; z: number; purity: number } {
    const bit = 1 << qubit;
    let r00 = 0, r11 = 0, r01re = 0, r01im = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & bit) continue;
      const j = i | bit;
      const a0r = this.re[i], a0i = this.im[i];
      const a1r = this.re[j], a1i = this.im[j];
      r00 += a0r * a0r + a0i * a0i;
      r11 += a1r * a1r + a1i * a1i;
      // rho01 = sum a0 * conj(a1)
      r01re += a0r * a1r + a0i * a1i;
      r01im += a0i * a1r - a0r * a1i;
    }
    const x = 2 * r01re;
    const y = -2 * r01im;
    const z = r00 - r11;
    return { x, y, z, purity: Math.sqrt(x * x + y * y + z * z) };
  }

  /** Total probability — should stay at 1. Used by the test suite. */
  norm(): number {
    let s = 0;
    for (let i = 0; i < this.size; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return s;
  }
}

/** Small deterministic PRNG (mulberry32) so lessons and tests reproduce exactly. */
export function rng(seed = 0x9e3779b9): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function controlMaskFor(o: GateOp): number {
  switch (o.name) {
    case 'cx': case 'cy': case 'cz': return 1 << o.qubits[0];
    case 'ccx': return (1 << o.qubits[0]) | (1 << o.qubits[1]);
    case 'cswap': return 1 << o.qubits[0];
    default: return 0;
  }
}

function targetOf(o: GateOp): number {
  switch (o.name) {
    case 'cx': case 'cy': case 'cz': return o.qubits[1];
    case 'ccx': return o.qubits[2];
    default: return o.qubits[0];
  }
}

/** Apply a single operation in place. Measurements and barriers are no-ops here. */
export function applyOp(sv: Statevector, o: GateOp): void {
  if (o.name === 'barrier' || o.name === 'measure') return;
  if (o.name === 'swap') { sv.swap(o.qubits[0], o.qubits[1]); return; }
  if (o.name === 'cswap') { sv.swap(o.qubits[1], o.qubits[2], 1 << o.qubits[0]); return; }
  const m = matrixFor(o.name, o.params);
  if (!m) return;
  sv.apply1q(m, targetOf(o), controlMaskFor(o));
}

export interface RunResult {
  state: Statevector;
  /** State after each operation, for the step-through view. Index 0 is before any gate. */
  trace: Statevector[];
  measured: number[];
}

/** Run a circuit and return the final state plus a per-step trace. */
export function run(c: Circuit, opts: SimOptions = {}): RunResult {
  const max = opts.maxQubits ?? DEFAULT_MAX_QUBITS;
  if (c.qubits > max) {
    throw new Error(
      `This circuit needs ${c.qubits} qubits. The on-device simulator is capped at ${max} ` +
      `because a statevector doubles in size with every qubit. Send it to a server backend instead.`
    );
  }
  const sv = new Statevector(c.qubits);
  const trace: Statevector[] = [sv.clone()];
  const measured: number[] = [];
  for (const o of c.ops) {
    applyOp(sv, o);
    if (o.name === 'measure') measured.push(o.qubits[0]);
    trace.push(sv.clone());
  }
  return { state: sv, trace, measured };
}

/**
 * Sample measurement outcomes. Returns counts keyed by bitstring, written with
 * qubit 0 on the right — the convention Qiskit prints, so the cross-check lines up.
 */
export function sample(sv: Statevector, shots = 1024, seed?: number): Record<string, number> {
  const probs = sv.probabilities();
  const cum = new Float64Array(probs.length);
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; cum[i] = acc; }
  const next = rng(seed ?? 0x9e3779b9);
  const counts: Record<string, number> = {};
  for (let s = 0; s < shots; s++) {
    const r = next() * acc;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const key = lo.toString(2).padStart(sv.n, '0');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Collapse one qubit, returning the outcome and mutating the state. */
export function measureQubit(sv: Statevector, qubit: number, random = Math.random()): 0 | 1 {
  const p1 = sv.probabilityOfOne(qubit);
  const outcome: 0 | 1 = random < p1 ? 1 : 0;
  const bit = 1 << qubit;
  const keepNorm = Math.sqrt(outcome === 1 ? p1 : 1 - p1) || 1;
  for (let i = 0; i < sv.size; i++) {
    const isOne = (i & bit) !== 0 ? 1 : 0;
    if (isOne !== outcome) { sv.re[i] = 0; sv.im[i] = 0; }
    else { sv.re[i] /= keepNorm; sv.im[i] /= keepNorm; }
  }
  return outcome;
}

/** Ket notation for display, e.g. "0.707|00⟩ + 0.707|11⟩". */
export function toKet(sv: Statevector, opts: { maxTerms?: number; tol?: number } = {}): string {
  const tol = opts.tol ?? 1e-6;
  const maxTerms = opts.maxTerms ?? 8;
  const terms: string[] = [];
  let shown = 0, hidden = 0;
  for (let i = 0; i < sv.size; i++) {
    const r = sv.re[i], m = sv.im[i];
    if (Math.abs(r) < tol && Math.abs(m) < tol) continue;
    if (shown >= maxTerms) { hidden++; continue; }
    const label = i.toString(2).padStart(sv.n, '0');
    let coeff: string;
    if (Math.abs(m) < tol) coeff = fmt(r);
    else if (Math.abs(r) < tol) coeff = `${fmt(m)}i`;
    else coeff = `(${fmt(r)}${m >= 0 ? '+' : '−'}${fmt(Math.abs(m))}i)`;
    terms.push(`${coeff}|${label}⟩`);
    shown++;
  }
  if (!terms.length) return '0';
  let out = terms.join('  +  ').replace(/\+  −/g, '−  ');
  if (hidden) out += `  + ${hidden} more term${hidden > 1 ? 's' : ''}`;
  return out;
}

function fmt(v: number): string {
  const s = v.toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s.replace('-', '−');
}
