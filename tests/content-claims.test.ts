/**
 * Numbers in the lessons, checked against the simulator that produces them.
 *
 * The existing suites verify that a lesson's *circuit* does what the lesson says. This
 * one goes after a different failure: prose that quotes a number. "Both outcomes at 50%",
 * "the amplitude is 0.707", "x reads 1.00" — those are claims, and a lesson can be edited
 * until they are wrong while every circuit still runs perfectly.
 *
 * The rule is the same one the tutor follows: propose, execute, discard if they disagree.
 * Here the proposal is the sentence and the execution is the lesson's own circuit.
 *
 * Deliberately conservative. Only patterns that are unambiguously claims about the state
 * are checked, because a matcher that fires on "12 qubits" or "16 bytes" would be noise
 * and would be switched off within a week. Everything it does check, it checks hard.
 */

import { describe, expect, it } from 'vitest';
import { ALL_LESSONS } from '../src/content/curriculum';
import { run } from '../src/core/simulator';
import type { Statevector } from '../src/core/simulator';

/**
 * Claims are read from the "what to look at" line, not from the body.
 *
 * The distinction is a contract, not a convenience. A watch line means "this is what you
 * will see when you run this circuit", so every number in it is an assertion about this
 * state. Body prose is exposition and legitimately uses illustrative numbers: the
 * measurement lesson says "an amplitude of 0.707 gives a probability of 0.5" while its
 * embedded circuit is an RY rotation with magnitudes 0.866 and 0.5. Checking the body
 * flagged that as a defect when the lesson is correct.
 *
 * Bloch coordinates written as "x = 1.00" are unambiguous wherever they appear, so those
 * are read from both.
 */
const watchOf = (s: { watch?: string }) => s.watch ?? '';
const blochTextOf = (s: { body: string; watch?: string }) => `${s.body}\n${s.watch ?? ''}`;

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

interface Claim {
  kind: string;
  quoted: string;
  ok: boolean;
  detail: string;
}

/** Percentages: "50%", "12.5%", "100% of the time". */
function checkPercentages(text: string, sv: Statevector): Claim[] {
  const probs = [...sv.probabilities()].map(p => p * 100);
  const out: Claim[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)) {
    const claimed = parseFloat(m[1]);
    // A percentage in a lesson is a claim about an outcome unless it is 0 or something
    // no outcome could be; tolerance is loose because prose rounds (12.5%, "about 95%").
    const hit = probs.some(p => near(p, claimed, 0.6));
    out.push({
      kind: 'probability',
      quoted: `${m[1]}%`,
      ok: hit || claimed === 0,
      detail: `outcomes are ${probs.filter(p => p > 1e-9).map(p => p.toFixed(1) + '%').join(', ')}`,
    });
  }
  return out;
}

/** Bloch coordinates: "x = 1.00", "y reads -1.00", "z is 0.00". */
function checkBloch(text: string, sv: Statevector): Claim[] {
  const out: Claim[] = [];
  const axes = ['x', 'y', 'z'] as const;
  // Statevector exposes `size` (2^n), not a qubit count.
  const nQubits = Math.round(Math.log2(sv.size));
  const vectors = Array.from({ length: nQubits }, (_, q) => sv.bloch(q));
  for (const m of text.matchAll(/\b([xyz])\s*(?:=|reads|is)\s*(−|-)?(\d(?:\.\d+)?)/gi)) {
    const axis = m[1].toLowerCase() as (typeof axes)[number];
    const value = (m[2] ? -1 : 1) * parseFloat(m[3]);
    const hit = vectors.some(v => near(v[axis], value, 0.02));
    out.push({
      kind: 'bloch',
      quoted: `${axis} = ${m[2] ?? ''}${m[3]}`,
      ok: hit,
      detail: vectors.map((v, q) => `q${q}(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`).join(' '),
    });
  }
  return out;
}

/** Amplitudes quoted to three places: "0.707", "0.5". */
function checkAmplitudes(text: string, sv: Statevector): Claim[] {
  const out: Claim[] = [];
  const mags: number[] = [];
  for (let i = 0; i < sv.size; i++) mags.push(Math.hypot(sv.re[i], sv.im[i]));
  for (const m of text.matchAll(/(?<![\d.])0\.(?:707|5|25|35|866)\b/g)) {
    const claimed = parseFloat(m[0]);
    // 0.5 is also a probability, so accept either reading rather than inventing a fault.
    const hit = mags.some(v => near(v, claimed, 0.005))
      || [...sv.probabilities()].some(p => near(p, claimed, 0.005));
    out.push({
      kind: 'amplitude',
      quoted: m[0],
      ok: hit,
      detail: `magnitudes ${mags.filter(v => v > 1e-9).map(v => v.toFixed(3)).join(', ')}`,
    });
  }
  return out;
}

const steps = ALL_LESSONS.flatMap(l =>
  l.steps
    .map((s, i) => ({ lesson: l.id, index: i + 1, heading: s.heading, step: s }))
    .filter(x => !!x.step.circuit)
);

describe('numbers quoted in lessons match the simulator', () => {
  it('has lesson steps carrying a runnable circuit to check against', () => {
    expect(steps.length).toBeGreaterThan(15);
  });

  for (const { lesson, index, heading, step } of steps) {
    it(`${lesson} step ${index} — ${heading}`, () => {
      const sv = run(step.circuit!).state;
      const claims = [
        ...checkPercentages(watchOf(step), sv),
        ...checkBloch(blochTextOf(step), sv),
        ...checkAmplitudes(watchOf(step), sv),
      ];
      const wrong = claims.filter(c => !c.ok);
      expect(
        wrong.map(c => `${c.kind} "${c.quoted}" not found — ${c.detail}`),
        `${lesson} step ${index} quotes a number its own circuit does not produce`
      ).toEqual([]);
    });
  }
});

describe('the checker is actually checking something', () => {
  // A verifier that silently matches nothing is worse than none, because it reads as
  // a passing suite. This pins that real claims are being read out of real prose.
  it('found claims across a meaningful number of steps', () => {
    let withClaims = 0;
    let total = 0;
    for (const { step } of steps) {
      const sv = run(step.circuit!).state;
      const n = checkPercentages(watchOf(step), sv).length
        + checkBloch(blochTextOf(step), sv).length
        + checkAmplitudes(watchOf(step), sv).length;
      if (n > 0) withClaims++;
      total += n;
    }
    expect(withClaims, 'no lesson step had a checkable numeric claim').toBeGreaterThan(8);
    expect(total, 'too few claims extracted to call this verification').toBeGreaterThan(20);
  });

  it('rejects a wrong number', () => {
    // Bell state: 50/50. Claiming 70% must fail, or the matcher proves nothing.
    const bell = run({
      version: 1, name: 'bell', qubits: 2,
      ops: [{ id: 'a', name: 'h', qubits: [0] }, { id: 'b', name: 'cx', qubits: [0, 1] }],
    }).state;
    expect(checkPercentages('both outcomes at 70%', bell).every(c => c.ok)).toBe(false);
    expect(checkPercentages('both outcomes at 50%', bell).every(c => c.ok)).toBe(true);
    expect(checkBloch('x = 1.00', bell).every(c => c.ok)).toBe(false);
  });
});
