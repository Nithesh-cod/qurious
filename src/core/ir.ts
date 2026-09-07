/**
 * Circuit IR — the single source of truth.
 *
 * Everything in Quantum Learning reads and writes this structure: the drag-and-drop
 * canvas, the code editor, the simulator, every transpiler, the grader and the tutor.
 * Adding a new front-end view or a new SDK target means adding a projection of this
 * type, never a second implementation of a circuit.
 *
 * Qubit ordering is little-endian: qubit 0 is the least significant bit of a basis
 * state index, so index 0b101 means q2=1, q1=0, q0=1. This matches Qiskit, which is
 * what makes the Aer cross-check meaningful.
 */

export type GateName =
  | 'i' | 'x' | 'y' | 'z' | 'h'
  | 's' | 'sdg' | 't' | 'tdg'
  | 'rx' | 'ry' | 'rz' | 'p'
  | 'cx' | 'cy' | 'cz' | 'cp' | 'swap'
  | 'ccx' | 'cswap'
  | 'measure' | 'barrier';

/** Gates that take a single rotation/phase parameter, in radians. */
export const PARAMETRIC: GateName[] = ['rx', 'ry', 'rz', 'p', 'cp'];

/** How many target qubits each operation consumes. */
export const ARITY: Record<GateName, number> = {
  i: 1, x: 1, y: 1, z: 1, h: 1,
  s: 1, sdg: 1, t: 1, tdg: 1,
  rx: 1, ry: 1, rz: 1, p: 1,
  cx: 2, cy: 2, cz: 2, cp: 2, swap: 2,
  ccx: 3, cswap: 3,
  measure: 1, barrier: 1,
};

export interface GateOp {
  /** Stable id so the UI can track a gate across edits. */
  id: string;
  name: GateName;
  /**
   * Qubits the operation acts on, in canonical order.
   * cx/cy/cz/cp: [control, target].  swap: [a, b].
   * ccx: [control1, control2, target].  cswap: [control, a, b].
   */
  qubits: number[];
  /** Rotation angle in radians for parametric gates. */
  params?: number[];
  /** Classical bit index for a measurement (defaults to the qubit index). */
  clbit?: number;
}

export interface Circuit {
  version: 1;
  name: string;
  qubits: number;
  ops: GateOp[];
}

let counter = 0;
export function newId(prefix = 'g'): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyCircuit(qubits = 2, name = 'Untitled'): Circuit {
  return { version: 1, name, qubits, ops: [] };
}

export function op(name: GateName, qubits: number[], params?: number[]): GateOp {
  return { id: newId(), name, qubits, ...(params ? { params } : {}) };
}

export function cloneCircuit(c: Circuit): Circuit {
  return {
    version: 1,
    name: c.name,
    qubits: c.qubits,
    ops: c.ops.map(o => ({ ...o, qubits: [...o.qubits], ...(o.params ? { params: [...o.params] } : {}) })),
  };
}

/** Human-readable label used on the canvas and in explanations. */
export const GATE_LABEL: Record<GateName, string> = {
  i: 'I', x: 'X', y: 'Y', z: 'Z', h: 'H',
  s: 'S', sdg: 'S†', t: 'T', tdg: 'T†',
  rx: 'RX', ry: 'RY', rz: 'RZ', p: 'P',
  cx: 'CNOT', cy: 'CY', cz: 'CZ', cp: 'CP', swap: 'SWAP',
  ccx: 'Toffoli', cswap: 'Fredkin',
  measure: 'Measure', barrier: 'Barrier',
};

export const GATE_BLURB: Record<GateName, string> = {
  i: 'Identity — leaves the qubit unchanged.',
  x: 'Bit flip. Swaps |0⟩ and |1⟩. The quantum NOT gate.',
  y: 'Bit and phase flip together.',
  z: 'Phase flip. Leaves |0⟩ alone and negates |1⟩.',
  h: 'Hadamard. Turns a definite state into an even superposition — the gate that starts almost every algorithm.',
  s: 'Quarter turn about Z. Adds a phase of i to |1⟩.',
  sdg: 'Inverse of S.',
  t: 'Eighth turn about Z. Adds a phase of e^(iπ/4) to |1⟩.',
  tdg: 'Inverse of T.',
  rx: 'Rotation about the X axis by θ.',
  ry: 'Rotation about the Y axis by θ.',
  rz: 'Rotation about the Z axis by θ.',
  p: 'Phase gate. Adds phase λ to |1⟩.',
  cx: 'Controlled NOT. Flips the target when the control is |1⟩ — the standard way to create entanglement.',
  cy: 'Controlled Y.',
  cp: 'Controlled phase. Adds a phase to |11⟩ only — the building block of the quantum Fourier transform and phase estimation.',
  cz: 'Controlled Z. Adds a phase of −1 only when both qubits are |1⟩.',
  swap: 'Exchanges the states of two qubits.',
  ccx: 'Toffoli. Flips the target only when both controls are |1⟩.',
  cswap: 'Fredkin. Swaps two qubits only when the control is |1⟩.',
  measure: 'Measures the qubit, collapsing it to 0 or 1.',
  barrier: 'A visual divider. No effect on the state.',
};

/** Which qubits of an op are controls (for canvas rendering). */
export function controlsOf(o: GateOp): number[] {
  switch (o.name) {
    case 'cx': case 'cy': case 'cz': case 'cp': return [o.qubits[0]];
    case 'ccx': return [o.qubits[0], o.qubits[1]];
    case 'cswap': return [o.qubits[0]];
    default: return [];
  }
}

/** Which qubits of an op are acted on (for canvas rendering). */
export function targetsOf(o: GateOp): number[] {
  switch (o.name) {
    case 'cx': case 'cy': case 'cz': case 'cp': return [o.qubits[1]];
    case 'ccx': return [o.qubits[2]];
    case 'cswap': return [o.qubits[1], o.qubits[2]];
    case 'swap': return [o.qubits[0], o.qubits[1]];
    default: return [o.qubits[0]];
  }
}

/**
 * Pack the op list into moments (columns) for drawing, greedily: an op joins the
 * earliest column whose qubit span does not overlap it.
 */
export function toMoments(c: Circuit): GateOp[][] {
  const moments: GateOp[][] = [];
  const busyUntil = new Array<number>(c.qubits).fill(0);
  for (const o of c.ops) {
    const lo = Math.min(...o.qubits);
    const hi = Math.max(...o.qubits);
    let col = 0;
    for (let q = lo; q <= hi; q++) col = Math.max(col, busyUntil[q]);
    if (!moments[col]) moments[col] = [];
    moments[col].push(o);
    for (let q = lo; q <= hi; q++) busyUntil[q] = col + 1;
  }
  return moments;
}

/** Circuit depth — the number of moments. */
export function depth(c: Circuit): number {
  return toMoments(c).length;
}

/** Gate count, excluding barriers and measurements. */
export function gateCount(c: Circuit): number {
  return c.ops.filter(o => o.name !== 'barrier' && o.name !== 'measure').length;
}
