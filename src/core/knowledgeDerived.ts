/**
 * Knowledge the tutor computes instead of remembering.
 *
 * The hand-written base in knowledge.ts is capped by how much prose one can author and
 * check. Scaling it by writing a thousand more paragraphs would mean shipping a thousand
 * unverified physics claims, and "we never teach wrong physics" is the one promise this
 * app cannot afford to break.
 *
 * So these entries are not written at all. Each one states an id, a title and the words
 * a learner might type; the answer itself is produced by running the circuit on the same
 * simulator the rest of the app uses, at the moment it is asked. A computed entry cannot
 * disagree with the simulator, because it *is* the simulator — the worst it can be is
 * uninteresting.
 *
 * Bodies are lazy. Building the entry objects at import costs a few hundred small arrays;
 * simulating every one of them would cost real milliseconds on a mid-range phone at the
 * exact moment the app is trying to paint. The body is computed on first read and cached.
 *
 * Everything here is written to be spoken: no ket bars, no markdown, no symbols a
 * text-to-speech voice would trip over. tests/knowledge-derived.test.ts recomputes every
 * claim independently and checks the interesting ones against textbook values.
 */

import type { Circuit, GateName } from './ir';
import { newId } from './ir';
import { run, type Statevector } from './simulator';
import { matrixFor, type Mat2 } from './gates';
import type { Category, Entry } from './knowledge';

// ---------------------------------------------------------------- small helpers

const PI = Math.PI;
const TOL = 1e-9;

const g = (name: GateName, qubits: number[], params?: number[]) => ({
  id: newId(), name, qubits, ...(params ? { params } : {}),
});

const circuit = (qubits: number, name: string, ops: ReturnType<typeof g>[]): Circuit =>
  ({ version: 1, name, qubits, ops });

/**
 * Round for speech: enough precision to be useful, not so much it becomes noise.
 *
 * Trailing zeros are stripped only after a decimal point. Stripping them unconditionally
 * turns 100 into 1, which is the kind of quiet corruption that would put a wrong number
 * in front of a learner.
 */
function num(v: number, dp = 3): string {
  if (Math.abs(v) < 5e-4) return '0';
  let s = v.toFixed(dp);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

/** Percentages read aloud better than decimals, and round numbers read best of all. */
function pct(p: number): string {
  const v = p * 100;
  if (Math.abs(v - Math.round(v)) < 0.05) return `${Math.round(v)} percent`;
  return `${v.toFixed(1)} percent`;
}

/** Bitstring with qubit 0 on the right, the convention the whole app uses. */
const bits = (i: number, n: number) => i.toString(2).padStart(n, '0');

/**
 * Build an entry whose body is computed on first read.
 *
 * The getter is enumerable so the entry behaves like any other object to the rest of the
 * app; nothing outside this file needs to know the difference.
 */
function computed(
  base: { id: string; category: Category; title: string; keys: string[]; related?: string[] },
  make: () => string
): Entry {
  let cache: string | null = null;
  const e = { ...base, computed: true } as Entry;
  Object.defineProperty(e, 'body', {
    enumerable: true,
    get() {
      if (cache === null) cache = make();
      return cache;
    },
  });
  return e;
}

// ---------------------------------------------------------------- gate vocabulary

/** How each gate is said out loud. */
const SPOKEN: Record<string, string> = {
  x: 'X', y: 'Y', z: 'Z', h: 'Hadamard', s: 'S', sdg: 'S dagger', t: 'T', tdg: 'T dagger',
};

/** The eight fixed single-qubit gates the builder offers, in palette order. */
const SEQ_GATES: GateName[] = ['x', 'y', 'z', 'h', 's', 'sdg', 't', 'tdg'];

const spoken = (n: GateName) => SPOKEN[n] ?? n.toUpperCase();

/** "Hadamard, then T, then S" — how a person would read a circuit aloud. */
function saySequence(seq: GateName[]): string {
  const names = seq.map(spoken);
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', then ') + ', then ' + names[names.length - 1];
}

/** "h t s" and friends, so the search finds the sequence however it is typed. */
function sequenceKeys(seq: GateName[]): string[] {
  const short = seq.join(' ');
  const long = seq.map(spoken).join(' ').toLowerCase();
  const thenned = seq.join(' then ');
  const keys = [short, thenned, `${short} gates`];
  if (long !== short) keys.push(long);
  return [...new Set(keys)];
}

// ---------------------------------------------------------------- 2x2 matrix algebra

/** Complex 2x2 multiply. Layout is the flat one from gates.ts. */
function mul(a: Mat2, b: Mat2): Mat2 {
  const out = new Array(8).fill(0);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      let re = 0, im = 0;
      for (let k = 0; k < 2; k++) {
        const ar = a[(r * 2 + k) * 2], ai = a[(r * 2 + k) * 2 + 1];
        const br = b[(k * 2 + c) * 2], bi = b[(k * 2 + c) * 2 + 1];
        re += ar * br - ai * bi;
        im += ar * bi + ai * br;
      }
      out[(r * 2 + c) * 2] = re;
      out[(r * 2 + c) * 2 + 1] = im;
    }
  }
  return out;
}

/** The matrix a sequence applies. First gate in the list acts first, so it multiplies last. */
function sequenceMatrix(seq: GateName[]): Mat2 {
  let m: Mat2 = [1, 0, 0, 0, 0, 0, 1, 0];
  for (const name of seq) m = mul(matrixFor(name)!, m);
  return m;
}

/**
 * Equal up to a global phase, which is the only kind of equality that is physical.
 * Two gates differing by an overall factor produce states nothing can tell apart.
 */
function samePhysicalGate(a: Mat2, b: Mat2): boolean {
  let k = -1;
  for (let i = 0; i < 4; i++) {
    if (Math.hypot(b[i * 2], b[i * 2 + 1]) > 1e-8) { k = i; break; }
  }
  if (k < 0) return false;
  // ratio = a[k] / b[k]
  const br = b[k * 2], bi = b[k * 2 + 1];
  const ar = a[k * 2], ai = a[k * 2 + 1];
  const d = br * br + bi * bi;
  const rr = (ar * br + ai * bi) / d;
  const ri = (ai * br - ar * bi) / d;
  if (Math.abs(Math.hypot(rr, ri) - 1) > 1e-8) return false;
  for (let i = 0; i < 4; i++) {
    const er = b[i * 2] * rr - b[i * 2 + 1] * ri;
    const ei = b[i * 2] * ri + b[i * 2 + 1] * rr;
    if (Math.abs(a[i * 2] - er) > 1e-8 || Math.abs(a[i * 2 + 1] - ei) > 1e-8) return false;
  }
  return true;
}

/** Named gates a sequence might turn out to be, identity included. */
const NAMED: { name: string; m: Mat2 }[] = [
  { name: 'the identity, which is to say nothing at all', m: matrixFor('i')! },
  { name: 'the X gate', m: matrixFor('x')! },
  { name: 'the Y gate', m: matrixFor('y')! },
  { name: 'the Z gate', m: matrixFor('z')! },
  { name: 'the Hadamard gate', m: matrixFor('h')! },
  { name: 'the S gate', m: matrixFor('s')! },
  { name: 'the S dagger gate', m: matrixFor('sdg')! },
  { name: 'the T gate', m: matrixFor('t')! },
  { name: 'the T dagger gate', m: matrixFor('tdg')! },
];

function nameOfMatrix(m: Mat2): string | null {
  for (const n of NAMED) if (samePhysicalGate(m, n.m)) return n.name;
  return null;
}

// ---------------------------------------------------------------- state vocabulary

interface Landmark { name: string; re: [number, number]; im: [number, number] }

const R2 = Math.SQRT1_2;

const LANDMARKS: Landmark[] = [
  { name: 'ket zero', re: [1, 0], im: [0, 0] },
  { name: 'ket one', re: [0, 1], im: [0, 0] },
  { name: 'the plus state', re: [R2, R2], im: [0, 0] },
  { name: 'the minus state', re: [R2, -R2], im: [0, 0] },
  { name: 'the plus i state', re: [R2, 0], im: [0, R2] },
  { name: 'the minus i state', re: [R2, 0], im: [0, -R2] },
];

/** Landmark this single-qubit state matches, ignoring global phase. */
function landmarkOf(sv: Statevector): string | null {
  for (const l of LANDMARKS) {
    // |<l|psi>| == 1 means the same physical state.
    let re = 0, im = 0;
    for (let i = 0; i < 2; i++) {
      re += l.re[i] * sv.re[i] + l.im[i] * sv.im[i];
      im += l.re[i] * sv.im[i] - l.im[i] * sv.re[i];
    }
    if (Math.abs(Math.hypot(re, im) - 1) < 1e-7) return l.name;
  }
  return null;
}

/** One qubit, described the way the app draws it. */
function describeQubit(sv: Statevector): string {
  const b = sv.bloch(0);
  const p1 = sv.probabilityOfOne(0);
  const mark = landmarkOf(sv);
  const where = mark
    ? `That is ${mark}.`
    : `It is not one of the six landmark states, so read it off the sphere.`;
  return `${where} The Bloch arrow sits at x equals ${num(b.x)}, y equals ${num(b.y)}, ` +
    `z equals ${num(b.z)}. The chance of measuring 1 is ${pct(p1)}.`;
}

/**
 * Probabilities for the low n qubits alone, summing over whatever else is in the register.
 *
 * Needed wherever a circuit carries a helper qubit that is deliberately left in
 * superposition. Reading the raw statevector peak there answers a different question
 * than the one asked, and answers it wrongly.
 */
function marginalise(sv: Statevector, n: number): number[] {
  const mask = (1 << n) - 1;
  const out = new Array(1 << n).fill(0);
  const probs = sv.probabilities();
  for (let i = 0; i < probs.length; i++) out[i & mask] += probs[i];
  return out;
}

/** The outcomes worth naming, largest first, ignoring anything vanishing. */
function outcomeList(sv: Statevector, n: number, limit = 8): string {
  const probs = sv.probabilities();
  const rows: { bits: string; p: number }[] = [];
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] > 1e-6) rows.push({ bits: bits(i, n), p: probs[i] });
  }
  rows.sort((a, b) => b.p - a.p);
  const shown = rows.slice(0, limit);
  const text = shown.map(r => `${r.bits} at ${pct(r.p)}`).join(', ');
  return rows.length > shown.length
    ? `${text}, and ${rows.length - shown.length} more outcomes below those`
    : text;
}

// ================================================================ family: one gate on one state

/** Circuits that prepare each landmark from a fresh qubit. */
const PREPARE: { id: string; name: string; ops: GateName[] }[] = [
  { id: 'zero', name: 'ket zero', ops: [] },
  { id: 'one', name: 'ket one', ops: ['x'] },
  { id: 'plus', name: 'the plus state', ops: ['h'] },
  { id: 'minus', name: 'the minus state', ops: ['x', 'h'] },
  { id: 'plusi', name: 'the plus i state', ops: ['h', 's'] },
  { id: 'minusi', name: 'the minus i state', ops: ['h', 'sdg'] },
];

const ACTION_GATES: { name: GateName; params?: number[]; id: string; say: string }[] = [
  { name: 'x', id: 'x', say: 'the X gate' },
  { name: 'y', id: 'y', say: 'the Y gate' },
  { name: 'z', id: 'z', say: 'the Z gate' },
  { name: 'h', id: 'h', say: 'the Hadamard gate' },
  { name: 's', id: 's', say: 'the S gate' },
  { name: 'sdg', id: 'sdg', say: 'the S dagger gate' },
  { name: 't', id: 't', say: 'the T gate' },
  { name: 'tdg', id: 'tdg', say: 'the T dagger gate' },
  { name: 'rx', params: [PI / 2], id: 'rx90', say: 'a 90 degree RX rotation' },
  { name: 'ry', params: [PI / 2], id: 'ry90', say: 'a 90 degree RY rotation' },
  { name: 'rz', params: [PI / 2], id: 'rz90', say: 'a 90 degree RZ rotation' },
];

function gateActionEntries(): Entry[] {
  const out: Entry[] = [];
  for (const st of PREPARE) {
    for (const gate of ACTION_GATES) {
      out.push(computed({
        id: `act-${gate.id}-${st.id}`,
        category: 'gates',
        title: `What does ${gate.say} do to ${st.name}?`,
        keys: [
          `${gate.id} ${st.id}`,
          `${gate.id} on ${st.id}`,
          `${gate.id} gate ${st.id} state`,
          `${gate.say.replace(/^(the|a) /, '')} on ${st.name}`,
        ],
        related: ['gate', 'bloch'],
      }, () => {
        const before = run(circuit(1, 'before', st.ops.map(o => g(o, [0])))).state;
        const after = run(circuit(1, 'after', [
          ...st.ops.map(o => g(o, [0])),
          g(gate.name, [0], gate.params),
        ])).state;
        const b0 = before.bloch(0);
        const b1 = after.bloch(0);
        const moved = Math.hypot(b1.x - b0.x, b1.y - b0.y, b1.z - b0.z) > 1e-7;
        const lead = moved
          ? `Applying ${gate.say} to ${st.name} moves it.`
          : `Applying ${gate.say} to ${st.name} changes nothing you could ever measure — ` +
            `the state comes back to where it started, up to an invisible overall phase.`;
        return `${lead} ${describeQubit(after)} Before the gate the arrow was at ` +
          `x equals ${num(b0.x)}, y equals ${num(b0.y)}, z equals ${num(b0.z)}.`;
      }));
    }
  }
  return out;
}

// ================================================================ family: gate sequences

function sequenceEntries(): Entry[] {
  const out: Entry[] = [];
  const build = (seq: GateName[]) => {
    out.push(computed({
      id: `seq-${seq.join('-')}`,
      category: 'gates',
      title: `What does ${saySequence(seq)} do to a fresh qubit?`,
      keys: sequenceKeys(seq),
      related: ['gate', 'universal-gates'],
    }, () => {
      const sv = run(circuit(1, 'seq', seq.map(n => g(n, [0])))).state;
      const equals = nameOfMatrix(sequenceMatrix(seq));
      const same = equals ? ` As a whole, this sequence is exactly ${equals}.` : '';
      return `Starting from ket zero and applying ${saySequence(seq)}: ${describeQubit(sv)}${same}`;
    }));
  };

  for (const a of SEQ_GATES) {
    for (const b of SEQ_GATES) {
      build([a, b]);
      for (const c of SEQ_GATES) build([a, b, c]);
    }
  }
  return out;
}

// ================================================================ family: two-qubit gates

const TWO_Q: { name: GateName; params?: number[]; id: string; say: string }[] = [
  { name: 'cx', id: 'cx', say: 'CNOT' },
  { name: 'cy', id: 'cy', say: 'controlled Y' },
  { name: 'cz', id: 'cz', say: 'controlled Z' },
  { name: 'swap', id: 'swap', say: 'SWAP' },
  { name: 'cp', params: [PI / 2], id: 'cp90', say: 'a 90 degree controlled phase' },
];

function twoQubitEntries(): Entry[] {
  const out: Entry[] = [];
  for (const gate of TWO_Q) {
    for (let i = 0; i < 4; i++) {
      const label = bits(i, 2);
      out.push(computed({
        id: `tq-${gate.id}-${label}`,
        category: 'gates',
        title: `What does ${gate.say} do to the input ${label}?`,
        keys: [
          `${gate.id} ${label}`,
          `${gate.name} on ${label}`,
          `${gate.say} ${label}`.toLowerCase(),
        ],
        related: ['cnot', 'controlled-gates'],
      }, () => {
        const prep = [];
        if (i & 1) prep.push(g('x', [0]));
        if (i & 2) prep.push(g('x', [1]));
        const sv = run(circuit(2, 'tq', [...prep, g(gate.name, [0, 1], gate.params)])).state;
        const probs = sv.probabilities();
        let peak = 0;
        for (let k = 0; k < 4; k++) if (probs[k] > probs[peak]) peak = k;
        const changed = peak !== i;
        const phaseOnly = !changed && sv.re[i] < 0.999;
        const verdict = changed
          ? `the register becomes ${bits(peak, 2)}`
          : phaseOnly
            ? `the register stays ${label}, but its amplitude picked up a phase, which is invisible on its own and decisive once it interferes`
            : `nothing happens at all`;
        return `With qubit 0 as the control and qubit 1 as the target, applying ${gate.say} to ` +
          `${label} means ${verdict}. Reading qubit 0 on the right, the outcomes are ` +
          `${outcomeList(sv, 2)}.`;
      }));
    }
  }
  return out;
}

// ================================================================ family: rotations by angle

function rotationEntries(): Entry[] {
  const out: Entry[] = [];
  const axes: { name: GateName; id: string; say: string; prep: GateName[]; on: string }[] = [
    { name: 'rx', id: 'rx', say: 'RX', prep: [], on: 'ket zero' },
    { name: 'ry', id: 'ry', say: 'RY', prep: [], on: 'ket zero' },
    // RZ on ket zero is unobservable, so ask the question where the answer is interesting.
    { name: 'rz', id: 'rz', say: 'RZ', prep: ['h'], on: 'the plus state' },
  ];
  for (const axis of axes) {
    for (let deg = 0; deg < 360; deg += 10) {
      out.push(computed({
        id: `rot-${axis.id}-${deg}`,
        category: 'gates',
        title: `What does ${axis.say} of ${deg} degrees do to ${axis.on}?`,
        keys: [
          `${axis.id} ${deg}`,
          `${axis.id} ${deg} degrees`,
          `${axis.say} ${deg} degrees`.toLowerCase(),
          `rotate ${deg} degrees ${axis.id}`,
        ],
        related: ['rotations', 'bloch'],
      }, () => {
        const rad = (deg * PI) / 180;
        const sv = run(circuit(1, 'rot', [
          ...axis.prep.map(n => g(n, [0])),
          g(axis.name, [0], [rad]),
        ])).state;
        return `An ${axis.say} rotation of ${deg} degrees, which is ${num(rad, 4)} radians, ` +
          `applied to ${axis.on}: ${describeQubit(sv)}`;
      }));
    }
  }
  return out;
}

// ================================================================ family: registers

function registerEntries(): Entry[] {
  const out: Entry[] = [];
  for (let n = 1; n <= 12; n++) {
    out.push(computed({
      id: `reg-${n}`,
      category: 'basics',
      title: `How much does a ${n} qubit register hold?`,
      keys: [`${n} qubits`, `${n} qubit register`, `size of ${n} qubits`],
      related: ['qubit', 'why-12'],
    }, () => {
      const size = Math.pow(2, n);
      const bytes = size * 16;
      const human = bytes < 1024 ? `${bytes} bytes`
        : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} kilobytes`
          : `${(bytes / 1048576).toFixed(1)} megabytes`;
      return `A ${n} qubit register holds ${size} amplitudes, one for each of the ${size} ` +
        `readings from ${bits(0, n)} to ${bits(size - 1, n)}. Storing them exactly takes about ` +
        `${human}, at sixteen bytes per complex number. Every extra qubit doubles both that ` +
        `memory and the work of applying a gate, which is why this simulator stops at twelve.`;
    }));

    out.push(computed({
      id: `spread-${n}`,
      category: 'basics',
      title: `What happens with a Hadamard on all ${n} qubits?`,
      keys: [`hadamard on ${n} qubits`, `${n} hadamards`, `superposition of ${n} qubits`],
      related: ['superposition', 'hadamard'],
    }, () => {
      const sv = run(circuit(n, 'spread',
        Array.from({ length: n }, (_, i) => g('h', [i])))).state;
      const probs = sv.probabilities();
      return `A Hadamard on each of ${n} qubits gives an even superposition of all ` +
        `${sv.size} readings, each one at ${pct(probs[0])}. It costs ${n} gates to reach ` +
        `${sv.size} amplitudes, and it is the opening move of nearly every quantum algorithm. ` +
        `The catch is that measuring returns just one of those ${sv.size}.`;
    }));
  }
  return out;
}

// ================================================================ family: gate matrices

const MATRIX_GATES: { name: GateName; params?: number[]; id: string; say: string }[] = [
  { name: 'i', id: 'i', say: 'the identity gate' },
  { name: 'x', id: 'x', say: 'the X gate' },
  { name: 'y', id: 'y', say: 'the Y gate' },
  { name: 'z', id: 'z', say: 'the Z gate' },
  { name: 'h', id: 'h', say: 'the Hadamard gate' },
  { name: 's', id: 's', say: 'the S gate' },
  { name: 'sdg', id: 'sdg', say: 'the S dagger gate' },
  { name: 't', id: 't', say: 'the T gate' },
  { name: 'tdg', id: 'tdg', say: 'the T dagger gate' },
  { name: 'rx', params: [PI / 2], id: 'rx90', say: 'a 90 degree RX rotation' },
  { name: 'ry', params: [PI / 2], id: 'ry90', say: 'a 90 degree RY rotation' },
  { name: 'rz', params: [PI / 2], id: 'rz90', say: 'a 90 degree RZ rotation' },
  { name: 'p', params: [PI / 4], id: 'p45', say: 'a 45 degree phase gate' },
];

/** One complex number, said aloud. */
function sayComplex(re: number, im: number): string {
  const r = num(re), i = num(im);
  if (Math.abs(im) < 5e-4) return r;
  if (Math.abs(re) < 5e-4) return `${i} i`;
  return `${r} ${im < 0 ? 'minus' : 'plus'} ${num(Math.abs(im))} i`;
}

function matrixEntries(): Entry[] {
  return MATRIX_GATES.map(gate => computed({
    id: `mat-${gate.id}`,
    category: 'maths',
    title: `What is the matrix of ${gate.say}?`,
    keys: [
      `${gate.id} matrix`,
      `matrix of ${gate.id}`,
      `${gate.say} matrix`,
      `${gate.id} gate matrix`,
    ],
    related: ['unitary', 'pauli-matrices'],
  }, () => {
    const m = matrixFor(gate.name, gate.params)!;
    const cell = (k: number) => sayComplex(m[k * 2], m[k * 2 + 1]);
    return `As a two by two matrix, ${gate.say} has top row ${cell(0)} and ${cell(1)}, ` +
      `and bottom row ${cell(2)} and ${cell(3)}. The first column is where ket zero goes ` +
      `and the second column is where ket one goes. Like every quantum gate it is unitary, ` +
      `so it has an inverse and nothing is ever lost.`;
  }));
}

// ================================================================ family: named circuits

/** Bernstein-Vazirani for a hidden string, as the algorithm lesson builds it. */
function bvCircuit(sBits: number, n: number): Circuit {
  const ops = [g('x', [n]), g('h', [n])];
  for (let i = 0; i < n; i++) ops.push(g('h', [i]));
  for (let i = 0; i < n; i++) if (sBits & (1 << i)) ops.push(g('cx', [i, n]));
  for (let i = 0; i < n; i++) ops.push(g('h', [i]));
  return circuit(n + 1, 'bv', ops);
}

function bvEntries(): Entry[] {
  const out: Entry[] = [];
  for (const n of [3, 4]) {
    for (let s = 0; s < 1 << n; s++) {
      const label = bits(s, n);
      out.push(computed({
        id: `bv-${label}`,
        category: 'algorithms',
        title: `What does Bernstein-Vazirani return for the hidden string ${label}?`,
        keys: [
          `bernstein vazirani ${label}`,
          `hidden string ${label}`,
          `bv ${label}`,
        ],
        related: ['bernstein', 'phase-kickback'],
      }, () => {
        const sv = run(bvCircuit(s, n)).state;
        // Marginalise over the helper qubit. It is left in the minus state by design, so
        // it is an even split — reading the raw peak would report the secret as arriving
        // at 50 percent, when the input register in fact holds it with certainty.
        const marginal = marginalise(sv, n);
        let peak = 0;
        for (let k = 0; k < marginal.length; k++) if (marginal[k] > marginal[peak]) peak = k;
        const read = bits(peak, n);
        return `With the hidden string ${label} on ${n} input qubits, the register reads ` +
          `${read} at ${pct(marginal[peak])} — the secret itself, from a single query. ` +
          `Classically you would need ${n} queries, one per bit. The oracle is a CNOT from ` +
          `each input qubit where the string has a 1, and there ` +
          `${countOnes(s) === 1 ? 'is 1 such qubit' : `are ${countOnes(s)} such qubits`}.`;
      }));
    }
  }
  return out;
}

const countOnes = (v: number) => v.toString(2).split('').filter(c => c === '1').length;

/** The two-qubit quantum Fourier transform, ending with the register reversal. */
function qftCircuit(n: number, input: number): Circuit {
  const ops: ReturnType<typeof g>[] = [];
  for (let i = 0; i < n; i++) if (input & (1 << i)) ops.push(g('x', [i]));
  for (let target = n - 1; target >= 0; target--) {
    ops.push(g('h', [target]));
    for (let ctrl = target - 1; ctrl >= 0; ctrl--) {
      ops.push(g('cp', [ctrl, target], [PI / Math.pow(2, target - ctrl)]));
    }
  }
  for (let i = 0; i < Math.floor(n / 2); i++) ops.push(g('swap', [i, n - 1 - i]));
  return circuit(n, 'qft', ops);
}

function qftEntries(): Entry[] {
  const out: Entry[] = [];
  for (const n of [2, 3]) {
    for (let input = 0; input < 1 << n; input++) {
      const label = bits(input, n);
      out.push(computed({
        id: `qft-${n}-${label}`,
        category: 'algorithms',
        title: `What does the ${n} qubit Fourier transform do to ${label}?`,
        keys: [
          `qft ${label}`,
          `fourier transform ${label}`,
          `quantum fourier transform of ${label}`,
        ],
        related: ['qft', 'phase-estimation'],
      }, () => {
        const sv = run(qftCircuit(n, input)).state;
        const probs = sv.probabilities();
        const flat = probs.every(p => Math.abs(p - 1 / sv.size) < 1e-9);
        const shape = flat
          ? `Every one of the ${sv.size} outcomes comes out equally likely, at ${pct(1 / sv.size)}.`
          : `The outcomes are ${outcomeList(sv, n)}.`;
        const phases = Array.from({ length: sv.size }, (_, i) =>
          num(Math.atan2(sv.im[i], sv.re[i]) * 180 / PI, 0)).join(', ');
        return `The Fourier transform of ${label} on ${n} qubits spreads the amplitude out. ` +
          `${shape} That is the point: the transform moves information out of the ` +
          `probabilities and into the phases, which run ${phases} degrees across the ` +
          `${sv.size} basis states.`;
      }));
    }
  }
  return out;
}

/** Phase estimation with n counting qubits, for a phase that is exactly representable. */
function qpeCircuit(n: number, k: number): Circuit {
  const eigen = n;                       // the eigenstate qubit sits above the counting register
  const theta = (2 * PI * k) / Math.pow(2, n);
  const ops = [g('x', [eigen])];
  for (let i = 0; i < n; i++) ops.push(g('h', [i]));
  for (let i = 0; i < n; i++) ops.push(g('cp', [i, eigen], [theta * Math.pow(2, i)]));
  // inverse QFT on the counting register
  for (let i = 0; i < Math.floor(n / 2); i++) ops.push(g('swap', [i, n - 1 - i]));
  for (let target = 0; target < n; target++) {
    for (let ctrl = 0; ctrl < target; ctrl++) {
      ops.push(g('cp', [ctrl, target], [-PI / Math.pow(2, target - ctrl)]));
    }
    ops.push(g('h', [target]));
  }
  return circuit(n + 1, 'qpe', ops);
}

function qpeEntries(): Entry[] {
  const out: Entry[] = [];
  for (const n of [3, 4]) {
    const denom = Math.pow(2, n);
    for (let k = 0; k < denom; k++) {
      out.push(computed({
        id: `qpe-${n}-${k}`,
        category: 'algorithms',
        title: `What does phase estimation read for a phase of ${k} over ${denom}?`,
        keys: [
          `phase estimation ${k} ${denom}`,
          `estimate phase ${k} over ${denom}`,
          `qpe ${k} ${denom}`,
        ],
        related: ['phase-estimation', 'qft'],
      }, () => {
        const sv = run(qpeCircuit(n, k)).state;
        const probs = sv.probabilities();
        let peak = 0;
        for (let i = 0; i < probs.length; i++) if (probs[i] > probs[peak]) peak = i;
        const read = peak & (denom - 1);
        return `With ${n} counting qubits and a phase of ${k} over ${denom}, the counting ` +
          `register reads ${bits(read, n)}, which is the number ${read}, at ${pct(probs[peak])}. ` +
          `Divide by ${denom} and you have the phase back. This phase is exactly representable ` +
          `in ${n} bits, so there is no leakage into neighbouring values at all. A phase that ` +
          `is not representable spreads across nearby readings instead, and you take the peak.`;
      }));
    }
  }
  return out;
}

/** Grover on n qubits marking one answer, with the textbook number of iterations. */
function groverCircuit(n: number, marked: number): Circuit {
  const ops: ReturnType<typeof g>[] = [];
  const all = Array.from({ length: n }, (_, i) => i);
  const iters = Math.max(1, Math.floor((PI / 4) * Math.sqrt(Math.pow(2, n))));

  const phaseFlip = (target: number) => {
    // Flip the sign of one basis state: X where the bit is 0, a controlled Z, then undo.
    const flips = all.filter(i => !(target & (1 << i)));
    for (const i of flips) ops.push(g('x', [i]));
    if (n === 2) ops.push(g('cz', [0, 1]));
    else { ops.push(g('h', [n - 1])); ops.push(g('ccx', [0, 1, 2])); ops.push(g('h', [n - 1])); }
    for (const i of flips) ops.push(g('x', [i]));
  };

  for (const i of all) ops.push(g('h', [i]));
  for (let it = 0; it < iters; it++) {
    phaseFlip(marked);
    for (const i of all) ops.push(g('h', [i]));
    phaseFlip(0);
    for (const i of all) ops.push(g('h', [i]));
  }
  return circuit(n, 'grover', ops);
}

function groverEntries(): Entry[] {
  const out: Entry[] = [];
  for (const n of [2, 3]) {
    for (let m = 0; m < 1 << n; m++) {
      const label = bits(m, n);
      out.push(computed({
        id: `grover-${n}-${label}`,
        category: 'algorithms',
        title: `What does Grover find when the answer is ${label}?`,
        keys: [
          `grover ${label}`,
          `grover search for ${label}`,
          `search ${label}`,
        ],
        related: ['grover', 'diffuser', 'oracle'],
      }, () => {
        const sv = run(groverCircuit(n, m)).state;
        const probs = sv.probabilities();
        const iters = Math.max(1, Math.floor((PI / 4) * Math.sqrt(Math.pow(2, n))));
        const guess = 1 / Math.pow(2, n);
        return `Searching ${Math.pow(2, n)} entries for ${label} with ${iters} Grover ` +
          `${iters === 1 ? 'iteration' : 'iterations'}: the answer comes up at ` +
          `${pct(probs[m])}, against ${pct(guess)} for a blind guess. The oracle marks ` +
          `${label} with a phase, which changes nothing measurable, and the diffuser then ` +
          `reflects every amplitude about their average, which turns that invisible mark ` +
          `into probability. The outcomes are ${outcomeList(sv, n)}.`;
      }));
    }
  }
  return out;
}

/**
 * The four Bell states, by the gate that makes each one.
 *
 * The extra gates go on qubit 0 *after* the CNOT. Putting them between the Hadamard and
 * the CNOT looks equivalent and is not: an X on the plus state does nothing, so that
 * ordering silently produces phi plus twice and never makes psi plus at all. This is the
 * same encoding step superdense coding uses, which is not a coincidence.
 */
const BELL: { id: string; name: string; extra: GateName[]; says: string }[] = [
  { id: 'phi-plus', name: 'phi plus', extra: [], says: 'and nothing after it' },
  { id: 'phi-minus', name: 'phi minus', extra: ['z'], says: 'then a Z on qubit 0' },
  { id: 'psi-plus', name: 'psi plus', extra: ['x'], says: 'then an X on qubit 0' },
  { id: 'psi-minus', name: 'psi minus', extra: ['z', 'x'], says: 'then a Z and an X on qubit 0' },
];

function bellEntries(): Entry[] {
  return BELL.map(b => computed({
    id: `bell-${b.id}`,
    category: 'basics',
    title: `What is the Bell state ${b.name}?`,
    keys: [`bell state ${b.name}`, `${b.name} bell`, `${b.name} state`],
    related: ['bell', 'entanglement', 'superdense'],
  }, () => {
    const sv = run(circuit(2, 'bell', [
      g('h', [0]), g('cx', [0, 1]),
      ...b.extra.map(n => g(n, [0])),
    ])).state;
    const agree = sv.probabilities()[0] + sv.probabilities()[3];
    return `The Bell state ${b.name} is made with a Hadamard on qubit 0 and a CNOT onto ` +
      `qubit 1, ${b.says}. The outcomes are ${outcomeList(sv, 2)}. The two qubits ` +
      `${agree > 0.99 ? 'always agree' : 'always disagree'}. Neither qubit has a state of ` +
      `its own — the Bloch arrow length for qubit 0 is ${num(sv.bloch(0).purity)}, which is ` +
      `zero, and all four Bell states are equally entangled. They differ only in phase and ` +
      `in whether the readings match, which is exactly what superdense coding exploits.`;
  }));
}

function ghzEntries(): Entry[] {
  const out: Entry[] = [];
  for (let n = 3; n <= 8; n++) {
    out.push(computed({
      id: `ghz-${n}`,
      category: 'basics',
      title: `What is the GHZ state on ${n} qubits?`,
      keys: [`ghz ${n}`, `ghz state ${n} qubits`, `entangle ${n} qubits`],
      related: ['ghz', 'entanglement'],
    }, () => {
      const ops = [g('h', [0])];
      for (let i = 1; i < n; i++) ops.push(g('cx', [0, i]));
      const sv = run(circuit(n, 'ghz', ops)).state;
      return `A GHZ state on ${n} qubits takes one Hadamard and ${n - 1} CNOTs. Only two ` +
        `readings ever appear: ${outcomeList(sv, n)}. The other ${sv.size - 2} are impossible. ` +
        `Every qubit has a Bloch arrow of length ${num(sv.bloch(0).purity)}, meaning none of ` +
        `them has a state of its own. GHZ states break easily and visibly, which is why they ` +
        `are the standard way to measure how good a real quantum computer is.`;
    }));
  }
  return out;
}

function superdenseEntries(): Entry[] {
  const messages: { bits: string; extra: GateName[] }[] = [
    { bits: '00', extra: [] },
    { bits: '01', extra: ['z'] },
    { bits: '10', extra: ['x'] },
    { bits: '11', extra: ['z', 'x'] },
  ];
  return messages.map(m => computed({
    id: `superdense-${m.bits}`,
    category: 'algorithms',
    title: `How does Alice send ${m.bits} by superdense coding?`,
    keys: [`superdense ${m.bits}`, `send ${m.bits} superdense`, `superdense coding ${m.bits}`],
    related: ['superdense', 'entanglement'],
  }, () => {
    const sv = run(circuit(2, 'sd', [
      g('h', [0]), g('cx', [0, 1]),
      ...m.extra.map(n => g(n, [0])),
      g('cx', [0, 1]), g('h', [0]),
    ])).state;
    const gates = m.extra.length ? m.extra.map(spoken).join(' then ') : 'nothing at all';
    return `Alice and Bob share a Bell pair made in advance. To send ${m.bits}, Alice ` +
      `applies ${gates} to her own qubit and posts it to Bob. Bob undoes the entanglement ` +
      `with a CNOT and a Hadamard, and the register reads ${outcomeList(sv, 2)}. Two ` +
      `classical bits arrived, and only one qubit was sent — though the entangled pair had ` +
      `to travel first, so no rule about information is broken.`;
  }));
}

function deutschEntries(): Entry[] {
  const fns: { id: string; say: string; oracle: ReturnType<typeof g>[]; kind: string }[] = [
    { id: 'zero', say: 'f of x equals 0', oracle: [], kind: 'constant' },
    { id: 'one', say: 'f of x equals 1', oracle: [g('x', [1])], kind: 'constant' },
    { id: 'x', say: 'f of x equals x', oracle: [g('cx', [0, 1])], kind: 'balanced' },
    { id: 'notx', say: 'f of x equals not x', oracle: [g('cx', [0, 1]), g('x', [1])], kind: 'balanced' },
  ];
  return fns.map(f => computed({
    id: `deutsch-${f.id}`,
    category: 'algorithms',
    title: `What does Deutsch-Jozsa say about ${f.say}?`,
    keys: [`deutsch ${f.id}`, `deutsch jozsa ${f.say}`, `${f.say} constant or balanced`],
    related: ['deutsch', 'oracle', 'phase-kickback'],
  }, () => {
    const sv = run(circuit(2, 'dj', [
      g('x', [1]), g('h', [1]), g('h', [0]),
      ...f.oracle,
      g('h', [0]),
    ])).state;
    const p1 = sv.probabilityOfOne(0);
    return `For the oracle ${f.say}, qubit 0 reads ${p1 > 0.5 ? '1' : '0'} at ` +
      `${pct(p1 > 0.5 ? p1 : 1 - p1)}, and that single bit is the whole verdict: the ` +
      `function is ${f.kind}. A reading of 0 means constant and a reading of 1 means ` +
      `balanced. One query settles it, where a classical test needs two.`;
  }));
}

// ================================================================ export

/** Every computed entry, built once at import. Bodies stay unevaluated until asked for. */
export const DERIVED_ENTRIES: Entry[] = [
  ...gateActionEntries(),
  ...sequenceEntries(),
  ...twoQubitEntries(),
  ...rotationEntries(),
  ...registerEntries(),
  ...matrixEntries(),
  ...bvEntries(),
  ...qftEntries(),
  ...qpeEntries(),
  ...groverEntries(),
  ...bellEntries(),
  ...ghzEntries(),
  ...superdenseEntries(),
  ...deutschEntries(),
];

/** Exported for the test suite, which rebuilds these circuits independently. */
export const _internals = {
  bvCircuit, qftCircuit, qpeCircuit, groverCircuit,
  sequenceMatrix, samePhysicalGate, nameOfMatrix, landmarkOf, SEQ_GATES, TOL,
};
