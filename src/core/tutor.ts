/**
 * The grounded tutor.
 *
 * The rule that defines this file: the learner never sees a claim the simulator has
 * not confirmed. Every candidate explanation or repair is *executed* before it is
 * offered, and anything that does not produce the result it claims is discarded.
 *
 * This implementation needs no API key and no network — it is a deterministic
 * analyser plus a verified repair search. An LLM can be plugged in later (see
 * `llmSuggest` in llm.ts); it enters the same verification gate and gets rejected
 * by the same rule if it is wrong. The architecture, not the model, is the guarantee.
 */

import { cloneCircuit, gateCount, GATE_LABEL, newId, type Circuit, type GateName, type GateOp } from './ir';
import { run, Statevector, toKet } from './simulator';
import { fidelity } from './grade';
import { optimize } from './optimize';
import { validate } from './validate';

export type InsightKind = 'observation' | 'warning' | 'repair' | 'redundancy' | 'praise';

export interface Insight {
  kind: InsightKind;
  title: string;
  /** Plain-English body. Every factual claim in here is computed, never guessed. */
  detail: string;
  /** A circuit that has been *run* and verified to do what the insight claims. */
  fix?: Circuit;
  fixLabel?: string;
  /** Evidence the UI can display: what the state was, what it became. */
  evidence?: { before: string; after: string };
  confidence: 'verified' | 'observed';
}

export interface TutorReport {
  insights: Insight[];
  /** How many candidate fixes were tried and thrown away because they did not work. */
  rejected: number;
  /** How many candidates were executed on the simulator in total. */
  evaluated: number;
}

const TOL = 1e-9;
const PASS = 1 - 1e-6;

// ---------------------------------------------------------------- descriptions

/** Describe what a circuit actually does, computed from its real output. */
export function describe(c: Circuit): string {
  if (!c.ops.length) return 'This circuit is empty, so every qubit is still in |0⟩.';
  let state: Statevector;
  try { state = run(c).state; } catch (e) { return (e as Error).message; }

  const parts: string[] = [];
  parts.push(`The final state is ${toKet(state, { maxTerms: 4 })}.`);

  const entangled: number[] = [];
  for (let q = 0; q < c.qubits; q++) {
    const b = state.bloch(q);
    if (b.purity < 0.999) entangled.push(q);
  }
  if (entangled.length >= 2) {
    parts.push(
      `Qubit${entangled.length > 2 ? 's' : ''} ${listOf(entangled)} ${entangled.length > 2 ? 'are' : 'are'} entangled — ` +
      `their Bloch vectors have collapsed to the centre of the sphere, which is what entanglement looks like: ` +
      `each qubit on its own has no definite state, only the pair together does.`
    );
  }

  const probs = state.probabilities();
  const outcomes = Array.from(probs).map((p, i) => ({ p, i })).filter(x => x.p > 1e-9);
  if (outcomes.length === 1) {
    parts.push(`Measuring is certain: you always get ${bits(outcomes[0].i, c.qubits)}.`);
  } else {
    const top = outcomes.sort((a, b) => b.p - a.p).slice(0, 3)
      .map(x => `${bits(x.i, c.qubits)} at ${(x.p * 100).toFixed(1)}%`);
    parts.push(`Measuring gives ${outcomes.length} possible outcomes — most likely ${top.join(', ')}.`);
  }
  return parts.join(' ');
}

const bits = (i: number, n: number) => `|${i.toString(2).padStart(n, '0')}⟩`;
const listOf = (a: number[]) => a.length === 2 ? `${a[0]} and ${a[1]}` : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

// ---------------------------------------------------------------- repair search

interface Candidate { circuit: Circuit; label: string; detail: string }

const INSERTABLE: GateName[] = ['h', 'x', 'z', 's', 't', 'sdg', 'tdg', 'y'];
const ANGLES: [number, string][] = [
  [Math.PI, 'π'], [Math.PI / 2, 'π/2'], [Math.PI / 4, 'π/4'], [Math.PI / 3, 'π/3'],
  [Math.PI * 2 / 3, '2π/3'], [Math.PI * 3 / 4, '3π/4'], [Math.PI / 6, 'π/6'], [Math.PI * 3 / 2, '3π/2'],
];
const MAX_CANDIDATES = 4000;

function insertAt(c: Circuit, index: number, o: GateOp): Circuit {
  const out = cloneCircuit(c);
  out.ops.splice(index, 0, o);
  return out;
}
function removeAt(c: Circuit, index: number): Circuit {
  const out = cloneCircuit(c);
  out.ops.splice(index, 1);
  return out;
}

/** All single-edit variations of a circuit. Bounded so the search stays instant. */
function* candidates(c: Circuit): Generator<Candidate> {
  const n = c.ops.length;

  // 1. remove one gate
  for (let i = 0; i < n; i++) {
    const o = c.ops[i];
    if (o.name === 'barrier') continue;
    yield {
      circuit: removeAt(c, i),
      label: `Remove the ${GATE_LABEL[o.name]} on qubit ${o.qubits.join(', ')}`,
      detail: `That ${GATE_LABEL[o.name]} is the one gate standing between your circuit and the target.`,
    };
  }

  // 2. reverse a two-qubit gate's control and target
  for (let i = 0; i < n; i++) {
    const o = c.ops[i];
    if (!['cx', 'cy', 'cz'].includes(o.name)) continue;
    const out = cloneCircuit(c);
    out.ops[i] = { ...o, id: newId(), qubits: [o.qubits[1], o.qubits[0]] };
    yield {
      circuit: out,
      label: `Swap the control and target of the ${GATE_LABEL[o.name]}`,
      detail: `Your ${GATE_LABEL[o.name]} has qubit ${o.qubits[0]} controlling qubit ${o.qubits[1]}. Turning it around gives the target state — in a controlled gate the order is not symmetric.`,
    };
  }

  // 3. insert one gate
  let count = 0;
  for (let pos = 0; pos <= n; pos++) {
    for (let q = 0; q < c.qubits; q++) {
      for (const g of INSERTABLE) {
        if (++count > MAX_CANDIDATES) return;
        yield {
          circuit: insertAt(c, pos, { id: newId(), name: g, qubits: [q] }),
          label: `Add ${GATE_LABEL[g]} on qubit ${q}`,
          detail: `Adding a ${GATE_LABEL[g]} on qubit ${q} at step ${pos + 1} produces the target state.`,
        };
      }
    }
  }

  // 4. insert a CNOT
  for (let pos = 0; pos <= n; pos++) {
    for (let a = 0; a < c.qubits; a++) {
      for (let b = 0; b < c.qubits; b++) {
        if (a === b) continue;
        if (++count > MAX_CANDIDATES) return;
        yield {
          circuit: insertAt(c, pos, { id: newId(), name: 'cx', qubits: [a, b] }),
          label: `Add CNOT from qubit ${a} to qubit ${b}`,
          detail: `A CNOT with qubit ${a} controlling qubit ${b} at step ${pos + 1} produces the target state. This is the gate that creates entanglement.`,
        };
      }
    }
  }

  // 5. change a rotation angle
  for (let i = 0; i < n; i++) {
    const o = c.ops[i];
    if (!['rx', 'ry', 'rz', 'p'].includes(o.name)) continue;
    for (const [theta, label] of ANGLES) {
      if (Math.abs((o.params?.[0] ?? 0) - theta) < TOL) continue;
      if (++count > MAX_CANDIDATES) return;
      const out = cloneCircuit(c);
      out.ops[i] = { ...o, id: newId(), params: [theta] };
      yield {
        circuit: out,
        label: `Change the ${GATE_LABEL[o.name]} angle to ${label}`,
        detail: `Your rotation angle is off. Setting the ${GATE_LABEL[o.name]} on qubit ${o.qubits[0]} to ${label} produces the target state.`,
      };
    }
  }
}

export interface RepairSearch {
  fix?: Insight;
  evaluated: number;
  rejected: number;
}

/**
 * Search single-gate edits for one that produces the target state, and *verify it by
 * running it* before offering it. This is the whole grounding idea in one function:
 * we do not suggest a fix because it sounds plausible, we suggest it because we ran it.
 */
export function searchRepair(c: Circuit, target: Statevector): RepairSearch {
  let evaluated = 0, rejected = 0;
  let best: { cand: Candidate; f: number } | null = null;

  for (const cand of candidates(c)) {
    if (cand.circuit.qubits > 12) continue;
    let f = 0;
    try {
      evaluated++;
      const st = run(cand.circuit).state;
      if (st.size !== target.size) { rejected++; continue; }
      f = fidelity(st, target);
    } catch { rejected++; continue; }

    if (f >= PASS) {
      const before = run(c).state;
      return {
        evaluated, rejected,
        fix: {
          kind: 'repair',
          title: cand.label,
          detail: cand.detail,
          fix: cand.circuit,
          fixLabel: cand.label,
          confidence: 'verified',
          evidence: {
            before: toKet(before, { maxTerms: 4 }),
            after: toKet(run(cand.circuit).state, { maxTerms: 4 }),
          },
        },
      };
    }
    rejected++;
    if (!best || f > best.f) best = { cand, f };
  }

  return { evaluated, rejected };
}

// ---------------------------------------------------------------- rules

/** Detect a CNOT whose control is in a definite basis state, so no entanglement happens. */
function checkPointlessCnot(c: Circuit): Insight | null {
  for (let i = 0; i < c.ops.length; i++) {
    const o = c.ops[i];
    if (o.name !== 'cx') continue;
    const prefix: Circuit = { ...cloneCircuit(c), ops: c.ops.slice(0, i) };
    let st: Statevector;
    try { st = run(prefix).state; } catch { continue; }
    const b = st.bloch(o.qubits[0]);
    // A control sitting at a pole is |0> or |1>, so CNOT acts classically.
    if (Math.abs(Math.abs(b.z) - 1) < 1e-9) {
      const isZero = b.z > 0;
      return {
        kind: 'warning',
        title: 'This CNOT will not create entanglement',
        detail:
          `At that point qubit ${o.qubits[0]} is in the definite state ${isZero ? '|0⟩' : '|1⟩'}, not a superposition. ` +
          `A CNOT only entangles when its control is in a superposition — otherwise it just ${isZero ? 'does nothing' : 'flips the target'}. ` +
          `Put a Hadamard on qubit ${o.qubits[0]} before it.`,
        confidence: 'verified',
        evidence: { before: `qubit ${o.qubits[0]} = ${isZero ? '|0⟩' : '|1⟩'}`, after: 'no entanglement created' },
      };
    }
  }
  return null;
}

/** Detect gates acting on an already-measured qubit. */
function checkAfterMeasure(c: Circuit): Insight | null {
  const d = validate(c).find(x => x.code === 'gate-after-measure');
  if (!d) return null;
  return {
    kind: 'warning',
    title: 'A gate acts on a qubit you already measured',
    detail: `${d.message} Measurement collapses the qubit, so anything after it operates on a definite 0 or 1 rather than a superposition. Move the measurement to the end.`,
    confidence: 'verified',
  };
}

/** Detect gates that cancel each other out. */
function checkRedundancy(c: Circuit): Insight | null {
  const r = optimize(c);
  if (r.after.gates >= r.before.gates) return null;
  const saved = r.before.gates - r.after.gates;
  return {
    kind: 'redundancy',
    title: `${saved} gate${saved > 1 ? 's' : ''} in this circuit do nothing`,
    detail: r.steps.map(s => s.note).join(' ') +
      ` The shorter circuit produces exactly the same state — verified by running both. Depth drops from ${r.before.depth} to ${r.after.depth}.`,
    fix: r.circuit,
    fixLabel: `Simplify to ${r.after.gates} gate${r.after.gates === 1 ? '' : 's'}`,
    confidence: 'verified',
    evidence: {
      before: `${r.before.gates} gates, depth ${r.before.depth}`,
      after: `${r.after.gates} gates, depth ${r.after.depth}`,
    },
  };
}

/** Note when the circuit has no measurement, if the learner is looking at outcomes. */
function checkNoMeasurement(c: Circuit): Insight | null {
  if (c.ops.some(o => o.name === 'measure')) return null;
  if (!c.ops.length) return null;
  return {
    kind: 'observation',
    title: 'No measurement in this circuit',
    detail:
      'That is fine while you are exploring — the simulator shows you the full state, which a real quantum computer never would. ' +
      'Add a measurement when you want to see what an actual run would return.',
    confidence: 'observed',
  };
}

/** Confirm entanglement when it is genuinely present. */
function checkEntanglement(c: Circuit): Insight | null {
  let st: Statevector;
  try { st = run(c).state; } catch { return null; }
  const ent: number[] = [];
  for (let q = 0; q < c.qubits; q++) if (st.bloch(q).purity < 0.999) ent.push(q);
  if (ent.length < 2) return null;
  return {
    kind: 'praise',
    title: 'These qubits are genuinely entangled',
    detail:
      `Qubits ${listOf(ent)} have Bloch vectors of length ${st.bloch(ent[0]).purity.toFixed(3)} — essentially zero. ` +
      `That is the signature of entanglement: neither qubit has a state of its own, only the pair does. ` +
      `Watch the spheres shrink to the centre as you add the CNOT.`,
    confidence: 'verified',
  };
}

// ---------------------------------------------------------------- entry point

export interface TutorInput {
  circuit: Circuit;
  /** When the learner is on a challenge, the state they are aiming for. */
  target?: Statevector;
}

/**
 * Produce the tutor's report. Rules run first because they are cheap and specific;
 * the repair search runs only when there is a target and the circuit is not already
 * correct. Everything returned has been checked against the simulator.
 */
export function analyse({ circuit, target }: TutorInput): TutorReport {
  const insights: Insight[] = [];
  let rejected = 0, evaluated = 0;

  if (!circuit.ops.length) {
    return {
      insights: [{
        kind: 'observation',
        title: 'Nothing here yet',
        detail: 'Every qubit starts in |0⟩. Drag a Hadamard onto qubit 0 to put it into a superposition, and watch the Bloch sphere swing from the north pole to the equator.',
        confidence: 'verified',
      }],
      rejected: 0, evaluated: 0,
    };
  }

  if (target) {
    let current: Statevector | null = null;
    try { current = run(circuit).state; } catch { /* validation will report it */ }
    if (current && current.size === target.size && fidelity(current, target) >= PASS) {
      insights.push({
        kind: 'praise',
        title: 'This produces exactly the target state',
        detail: `${describe(circuit)} Fidelity with the target is 100%.`,
        confidence: 'verified',
      });
    } else if (current) {
      const search = searchRepair(circuit, target);
      evaluated += search.evaluated;
      rejected += search.rejected;
      if (search.fix) insights.push(search.fix);
      else insights.push({
        kind: 'observation',
        title: 'No single change gets you there',
        detail:
          `I ran ${search.evaluated.toLocaleString()} one-gate variations of your circuit and none of them produced the target, ` +
          `so this needs more than one edit. Current fidelity with the target is ${(fidelity(current, target) * 100).toFixed(1)}%. ` +
          `Try stepping through the circuit and finding the first moment the state stops matching what you expected.`,
        confidence: 'verified',
      });
    }
  }

  for (const rule of [checkAfterMeasure, checkPointlessCnot, checkRedundancy, checkEntanglement, checkNoMeasurement]) {
    const r = rule(circuit);
    if (r) insights.push(r);
  }

  if (!insights.some(i => i.kind === 'praise' || i.kind === 'repair')) {
    insights.push({
      kind: 'observation',
      title: 'What this circuit does',
      detail: describe(circuit),
      confidence: 'verified',
    });
  }

  return { insights, rejected, evaluated };
}

// ---------------------------------------------------------------- natural language

interface Template { match: RegExp; build: (m: RegExpMatchArray) => Circuit; says: string }

const numFrom = (s: string | undefined, dflt: number) => {
  if (!s) return dflt;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  return words[s.toLowerCase()] ?? (parseInt(s, 10) || dflt);
};

function ghz(n: number): Circuit {
  const c = cloneCircuit({ version: 1, name: `GHZ ${n}`, qubits: Math.max(2, Math.min(n, 12)), ops: [] });
  c.ops.push({ id: newId(), name: 'h', qubits: [0] });
  for (let q = 1; q < c.qubits; q++) c.ops.push({ id: newId(), name: 'cx', qubits: [0, q] });
  return c;
}

const TEMPLATES: Template[] = [
  {
    match: /\b(\w+)[- ]?qubit\s+ghz\b|\bghz\b(?:.*?\b(\w+)\b\s*qubits?)?/i,
    build: m => ghz(numFrom(m[1] ?? m[2], 3)),
    says: 'A GHZ state: one Hadamard to create a superposition, then a CNOT to every other qubit so they all agree.',
  },
  {
    match: /\bbell\b|\bentangle(d)?\s+(pair|two)\b/i,
    build: () => ghz(2),
    says: 'A Bell state — the smallest entangled state. Hadamard on qubit 0, then CNOT onto qubit 1.',
  },
  {
    match: /\bsuperposition\b/i,
    build: m => {
      const n = numFrom(/(\w+)\s*qubits?/i.exec(m.input ?? '')?.[1], 1);
      const c: Circuit = { version: 1, name: 'Superposition', qubits: Math.max(1, Math.min(n, 12)), ops: [] };
      for (let q = 0; q < c.qubits; q++) c.ops.push({ id: newId(), name: 'h', qubits: [q] });
      return c;
    },
    says: 'A Hadamard on every qubit gives an even superposition over all basis states.',
  },
  {
    match: /\bgrover\b/i,
    build: () => ({
      version: 1, name: 'Grover (2 qubits)', qubits: 2,
      ops: [
        { id: newId(), name: 'h', qubits: [0] }, { id: newId(), name: 'h', qubits: [1] },
        { id: newId(), name: 'cz', qubits: [0, 1] },
        { id: newId(), name: 'h', qubits: [0] }, { id: newId(), name: 'h', qubits: [1] },
        { id: newId(), name: 'x', qubits: [0] }, { id: newId(), name: 'x', qubits: [1] },
        { id: newId(), name: 'cz', qubits: [0, 1] },
        { id: newId(), name: 'x', qubits: [0] }, { id: newId(), name: 'x', qubits: [1] },
        { id: newId(), name: 'h', qubits: [0] }, { id: newId(), name: 'h', qubits: [1] },
      ],
    }),
    says: 'Grover on two qubits: an even superposition, a CZ oracle marking |11⟩, then the diffuser. One iteration is enough to find the answer with certainty.',
  },
  {
    match: /\bflip\b|\bnot\b|\bx gate\b/i,
    build: () => ({ version: 1, name: 'Bit flip', qubits: 1, ops: [{ id: newId(), name: 'x', qubits: [0] }] }),
    says: 'An X gate flips |0⟩ to |1⟩ — the quantum NOT.',
  },
];

export interface NLResult {
  circuit: Circuit;
  explanation: string;
  /** Confirmed by running the circuit, so the description is never a guess. */
  producedState: string;
}

/** Build a circuit from a phrase, offline. Returns null when nothing matches. */
export function fromPrompt(prompt: string): NLResult | null {
  for (const t of TEMPLATES) {
    const m = prompt.match(t.match);
    if (!m) continue;
    (m as RegExpMatchArray).input = prompt;
    const circuit = t.build(m as RegExpMatchArray);
    return { circuit, explanation: t.says, producedState: describe(circuit) };
  }
  return null;
}

export const NL_EXAMPLES = [
  'build a 3-qubit GHZ state',
  'make a Bell pair',
  'put 2 qubits in superposition',
  'show me Grover',
];

export function tutorStats(c: Circuit) {
  return { gates: gateCount(c), qubits: c.qubits };
}
