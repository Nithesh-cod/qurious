/**
 * The auto-grader.
 *
 * A challenge is marked by running the learner's circuit and comparing the quantum
 * state it actually produces against the target state. Not by matching text, not by
 * checking which gates they used, and not by asking a language model. That is what
 * makes it objective, instant, and impossible to bluff — and it means a different
 * but correct solution passes, which a gate-by-gate comparison would wrongly fail.
 */

import { gateCount, type Circuit, type GateName } from './ir';
import { run, sample, Statevector } from './simulator';
import { validate, hasErrors } from './validate';

export interface Constraints {
  /** Maximum gates allowed, if the challenge is about efficiency. */
  maxGates?: number;
  /** Gates the solution must contain at least once. */
  requiredGates?: GateName[];
  /** Gates the solution may not use. */
  forbiddenGates?: GateName[];
  /** Exact qubit count the solution must use. */
  qubits?: number;
}

export interface Challenge {
  id: string;
  title: string;
  concept: string;
  brief: string;
  /** Circuit the learner starts from. */
  starter: Circuit;
  /** Circuit whose output state defines "correct". */
  solution: Circuit;
  constraints?: Constraints;
  hints: string[];
  /** Grade by measurement distribution instead of statevector (phase-insensitive). */
  compareBy?: 'state' | 'distribution';
}

export interface GradeResult {
  passed: boolean;
  fidelity: number;
  /** Total variation distance between measurement distributions, 0 is identical. */
  tvd: number;
  messages: string[];
  /** Ordered checks, so the UI can show a tick list rather than one verdict. */
  checks: { label: string; ok: boolean; detail?: string }[];
}

const PASS_FIDELITY = 1 - 1e-6;

/**
 * Fidelity |<target|student>|^2, insensitive to a global phase.
 * Two states differing only by an overall phase factor are physically identical,
 * so a learner who builds −(|00⟩+|11⟩)/√2 must still pass.
 */
export function fidelity(a: Statevector, b: Statevector): number {
  if (a.size !== b.size) return 0;
  let re = 0, im = 0;
  for (let i = 0; i < a.size; i++) {
    // <a|b> = sum conj(a_i) * b_i
    re += a.re[i] * b.re[i] + a.im[i] * b.im[i];
    im += a.re[i] * b.im[i] - a.im[i] * b.re[i];
  }
  return re * re + im * im;
}

/** Total variation distance between two measurement distributions. */
export function tvd(a: Statevector, b: Statevector): number {
  if (a.size !== b.size) return 1;
  const pa = a.probabilities(), pb = b.probabilities();
  let s = 0;
  for (let i = 0; i < pa.length; i++) s += Math.abs(pa[i] - pb[i]);
  return s / 2;
}

export function grade(submission: Circuit, ch: Challenge): GradeResult {
  const checks: GradeResult['checks'] = [];
  const messages: string[] = [];

  const diags = validate(submission);
  if (hasErrors(diags)) {
    const first = diags.find(d => d.severity === 'error')!;
    return {
      passed: false, fidelity: 0, tvd: 1,
      messages: [first.message],
      checks: [{ label: 'Circuit is valid', ok: false, detail: first.message }],
    };
  }
  checks.push({ label: 'Circuit is valid', ok: true });

  const co = ch.constraints ?? {};

  if (co.qubits !== undefined && submission.qubits !== co.qubits) {
    checks.push({ label: `Uses ${co.qubits} qubits`, ok: false, detail: `This circuit has ${submission.qubits}.` });
    messages.push(`This challenge is set on ${co.qubits} qubits.`);
  } else if (co.qubits !== undefined) {
    checks.push({ label: `Uses ${co.qubits} qubits`, ok: true });
  }

  const used = new Set(submission.ops.map(o => o.name));
  if (co.requiredGates?.length) {
    const missing = co.requiredGates.filter(g => !used.has(g));
    checks.push({
      label: `Uses ${co.requiredGates.join(', ').toUpperCase()}`,
      ok: missing.length === 0,
      detail: missing.length ? `Missing: ${missing.join(', ').toUpperCase()}` : undefined,
    });
    if (missing.length) messages.push(`This one wants you to use ${missing.join(' and ').toUpperCase()}.`);
  }
  if (co.forbiddenGates?.length) {
    const bad = co.forbiddenGates.filter(g => used.has(g));
    checks.push({
      label: `Avoids ${co.forbiddenGates.join(', ').toUpperCase()}`,
      ok: bad.length === 0,
      detail: bad.length ? `Found: ${bad.join(', ').toUpperCase()}` : undefined,
    });
    if (bad.length) messages.push(`Try it without ${bad.join(' or ').toUpperCase()}.`);
  }
  if (co.maxGates !== undefined) {
    const n = gateCount(submission);
    checks.push({
      label: `At most ${co.maxGates} gates`,
      ok: n <= co.maxGates,
      detail: `Yours uses ${n}.`,
    });
    if (n > co.maxGates) messages.push(`Your circuit is correct-sized at ${n} gates, but this challenge asks for ${co.maxGates} or fewer.`);
  }

  let f = 0, t = 1;
  try {
    const mine = run(submission).state;
    const target = run(ch.solution).state;
    if (mine.n !== target.n) {
      checks.push({ label: 'Produces the target state', ok: false, detail: 'Different number of qubits.' });
      return { passed: false, fidelity: 0, tvd: 1, messages: [...messages, 'The circuits have different sizes, so the states cannot match.'], checks };
    }
    f = fidelity(mine, target);
    t = tvd(mine, target);
  } catch (e) {
    checks.push({ label: 'Circuit runs', ok: false, detail: (e as Error).message });
    return { passed: false, fidelity: 0, tvd: 1, messages: [(e as Error).message], checks };
  }

  const byDistribution = ch.compareBy === 'distribution';
  const stateOk = byDistribution ? t < 1e-6 : f >= PASS_FIDELITY;
  checks.push({
    label: byDistribution ? 'Produces the target measurement outcomes' : 'Produces the target state',
    ok: stateOk,
    detail: stateOk ? undefined : byDistribution
      ? `Outcome distributions differ by ${(t * 100).toFixed(1)}%.`
      : `Fidelity with the target is ${(f * 100).toFixed(1)}% — it needs to be 100%.`,
  });

  if (!stateOk) {
    if (f > 0.85) messages.push('Very close. The shape is right but something is off — check your angles, or whether a phase gate belongs somewhere.');
    else if (f > 0.4) messages.push('Partly there. Some outcomes match the target and some do not.');
    else messages.push('The state you are producing is quite different from the target. Try stepping through the circuit and watching where it diverges.');
  }

  const passed = checks.every(c => c.ok);
  if (passed) messages.unshift('Correct — your circuit produces exactly the target state.');

  return { passed, fidelity: f, tvd: t, messages, checks };
}

/** Sampled counts for the challenge target, for side-by-side display. */
export function targetCounts(ch: Challenge, shots = 1024): Record<string, number> {
  return sample(run(ch.solution).state, shots, 20260920);
}
