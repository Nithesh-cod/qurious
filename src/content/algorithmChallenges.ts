/**
 * Challenges for the algorithm lessons.
 *
 * Eight algorithm lessons shipped with nothing to build afterwards, which is the wrong
 * way round for an app whose argument is that you learn by building. Each of these sits
 * behind a lesson and asks the learner to construct the thing they just read about.
 *
 * Two rules held throughout:
 *
 *   1. The brief states an *observable* outcome — the state produced, or the bitstring
 *      measured — never "use these gates". Grading is on the state the circuit reaches,
 *      so a different route that gets there passes, which is the whole point.
 *   2. Every claim a brief makes is asserted in tests/algorithm-challenges.test.ts.
 *      A brief that lies about its own solution fails the build.
 *
 * Hints go from a nudge to the answer over three steps, so a stuck learner is never
 * stuck for long but is not handed it immediately either.
 */

import { emptyCircuit, newId, type Circuit, type GateName } from '../core/ir';
import type { Challenge } from '../core/grade';

const g = (name: GateName, qubits: number[], params?: number[]) => ({
  id: newId(), name, qubits, ...(params ? { params } : {}),
});

const circuit = (qubits: number, name: string, ops: ReturnType<typeof g>[]): Circuit => ({
  version: 1, name, qubits, ops,
});

const PI = Math.PI;

/** A starter that already contains the setup, so the learner builds only the interesting part. */
const starterWith = (qubits: number, name: string, ops: ReturnType<typeof g>[]) =>
  circuit(qubits, name, ops);

export const ALGORITHM_CHALLENGES: Challenge[] = [
  // ---------------------------------------------------------------- kickback
  {
    id: 'ch-kickback',
    title: 'Make the control flinch',
    concept: 'interference',
    brief:
      'A CNOT is supposed to change its target. Set the target up so that the CNOT changes the ' +
      'control instead: finish with qubit 0 in |−⟩ and qubit 1 still in |−⟩. This is phase kickback, ' +
      'and every oracle algorithm runs on it.',
    starter: emptyCircuit(2, 'Kickback'),
    solution: circuit(2, 'sol', [
      g('x', [1]), g('h', [1]),   // target into |−⟩
      g('h', [0]),                // control into |+⟩
      g('cx', [0, 1]),            // the kick: q0 becomes |−⟩, q1 is untouched
    ]),
    constraints: { qubits: 2, maxGates: 4, requiredGates: ['cx'] },
    hints: [
      'The trick is entirely in how you prepare the target qubit before the CNOT.',
      '|−⟩ is the eigenstate of X with eigenvalue −1. Getting there from |0⟩ takes two gates.',
      'X then H on qubit 1, H on qubit 0, then CNOT from 0 to 1.',
    ],
  },

  // ---------------------------------------------------------------- Deutsch
  {
    id: 'ch-dj-notx',
    title: 'The other balanced oracle',
    concept: 'algorithms',
    brief:
      'Run Deutsch–Jozsa against f(x) = NOT x. It is balanced, so qubit 0 must read 1 with ' +
      'certainty — the same verdict the f(x) = x oracle gives, reached through a different oracle.',
    starter: starterWith(2, 'Balanced, again', [g('x', [1]), g('h', [1]), g('h', [0])]),
    solution: circuit(2, 'sol', [
      g('x', [1]), g('h', [1]),
      g('h', [0]),
      g('cx', [0, 1]), g('x', [1]),   // f(x) = x XOR 1
      g('h', [0]),
    ]),
    constraints: { qubits: 2, maxGates: 6 },
    hints: [
      'The setup is done. You need the oracle for NOT x, then the closing Hadamard.',
      'f(x) = x XOR 1 is the f(x) = x oracle followed by flipping the output qubit.',
      'CNOT from 0 to 1, then X on qubit 1, then H on qubit 0.',
    ],
  },

  // ---------------------------------------------------------------- Bernstein–Vazirani
  {
    id: 'ch-bv-110',
    title: 'Hide the number 110',
    concept: 'algorithms',
    brief:
      'Build a Bernstein–Vazirani circuit whose hidden string is 110, so the three input qubits ' +
      'end up reading q2 = 1, q1 = 1, q0 = 0. One query, three qubits, no guessing.',
    starter: starterWith(4, 'Hide 110', [
      g('x', [3]), g('h', [3]),
      g('h', [0]), g('h', [1]), g('h', [2]),
    ]),
    solution: circuit(4, 'sol', [
      g('x', [3]), g('h', [3]),
      g('h', [0]), g('h', [1]), g('h', [2]),
      g('cx', [1, 3]), g('cx', [2, 3]),          // s = 110: bits 1 and 2 are set
      g('h', [0]), g('h', [1]), g('h', [2]),
    ]),
    constraints: { qubits: 4, maxGates: 10 },
    hints: [
      'The oracle computes s·x. A CNOT from an input qubit into the output qubit adds that bit.',
      '110 means qubit 2 and qubit 1 are in the string, and qubit 0 is not.',
      'CNOT from 1 to 3 and from 2 to 3, then a Hadamard on each of q0, q1 and q2.',
    ],
  },

  // ---------------------------------------------------------------- superdense coding
  {
    id: 'ch-superdense-01',
    title: 'Send 01 down one qubit',
    concept: 'entanglement',
    brief:
      'Alice and Bob share a Bell pair. Touching only her own qubit, Alice must send the two ' +
      'classical bits 01 — after Bob decodes, the register reads 01 with certainty.',
    starter: starterWith(2, 'Send 01', [g('h', [0]), g('cx', [0, 1])]),
    solution: circuit(2, 'sol', [
      g('h', [0]), g('cx', [0, 1]),   // the shared pair
      g('z', [0]),                    // Alice encodes 01
      g('cx', [0, 1]), g('h', [0]),   // Bob decodes
    ]),
    constraints: { qubits: 2, maxGates: 5 },
    hints: [
      'Alice has two gates available on her qubit: X and Z. One of them, both, or neither.',
      'Bob always decodes the same way — a CNOT then a Hadamard, the Bell preparation run backwards.',
      'Z on qubit 0, then CNOT from 0 to 1, then H on qubit 0.',
    ],
  },

  // ---------------------------------------------------------------- teleportation
  {
    id: 'ch-teleport',
    title: 'Move a state you cannot copy',
    concept: 'entanglement',
    brief:
      'Qubit 0 holds a state, and qubits 1 and 2 are an entangled pair. Finish the protocol so ' +
      'qubit 2 ends up holding qubit 0’s state — and qubit 0 no longer does. Nothing was copied.',
    starter: starterWith(3, 'Teleport', [
      g('ry', [0], [PI / 3]),
      g('h', [1]), g('cx', [1, 2]),
    ]),
    solution: circuit(3, 'sol', [
      g('ry', [0], [PI / 3]),
      g('h', [1]), g('cx', [1, 2]),
      g('cx', [0, 1]), g('h', [0]),
      g('cx', [1, 2]), g('cz', [0, 2]),
    ]),
    constraints: { qubits: 3, maxGates: 7 },
    hints: [
      'Alice entangles her state with her half of the pair, then measures in the Hadamard basis.',
      'The correction is two controlled gates onto qubit 2 — one from qubit 1, one from qubit 0.',
      'CNOT 0→1, H on 0, then CNOT 1→2 and CZ 0→2.',
    ],
  },

  // ---------------------------------------------------------------- QFT
  {
    id: 'ch-qft2',
    title: 'Fourier transform two qubits',
    concept: 'algorithms',
    brief:
      'Apply the two-qubit quantum Fourier transform to |01⟩. Every outcome ends up equally ' +
      'likely — the information moves into the phases, which is exactly where the transform puts it.',
    starter: starterWith(2, 'QFT of 01', [g('x', [0])]),
    solution: circuit(2, 'sol', [
      g('x', [0]),
      g('h', [1]),
      g('cp', [0, 1], [PI / 2]),
      g('h', [0]),
      g('swap', [0, 1]),
    ]),
    constraints: { qubits: 2, maxGates: 5, requiredGates: ['cp'] },
    hints: [
      'Work down from the most significant qubit: a Hadamard, then a controlled phase from each qubit below it.',
      'The controlled phase between two neighbouring qubits is π/2. Finish by swapping the register end for end.',
      'H on q1, CP(π/2) from 0 to 1, H on q0, then SWAP 0 and 1.',
    ],
  },

  // ---------------------------------------------------------------- phase estimation
  {
    id: 'ch-qpe-s',
    title: 'Measure the S gate’s angle',
    concept: 'algorithms',
    brief:
      'The S gate turns |1⟩ by a quarter turn, so its phase is 1/4. Run phase estimation with three ' +
      'counting qubits and read that back as the binary number 010 — q2 = 0, q1 = 1, q0 = 0.',
    starter: starterWith(4, 'Estimate S', [
      g('x', [3]),
      g('h', [0]), g('h', [1]), g('h', [2]),
    ]),
    solution: circuit(4, 'sol', [
      g('x', [3]),
      g('h', [0]), g('h', [1]), g('h', [2]),
      // U = S = P(pi/2), so U^(2^k) = P(2^k * pi/2).
      g('cp', [0, 3], [PI / 2]),
      g('cp', [1, 3], [PI]),
      g('cp', [2, 3], [2 * PI]),
      // inverse QFT on the counting register
      g('swap', [0, 2]),
      g('h', [0]),
      g('cp', [0, 1], [-PI / 2]),
      g('h', [1]),
      g('cp', [0, 2], [-PI / 4]),
      g('cp', [1, 2], [-PI / 2]),
      g('h', [2]),
    ]),
    constraints: { qubits: 4 },
    hints: [
      'Each counting qubit applies the gate twice as many times as the one before: π/2, then π, then 2π.',
      'After the controlled phases comes the inverse Fourier transform on qubits 0, 1 and 2 — the same one from the QFT lesson, with the phase signs flipped.',
      'CP(π/2) 0→3, CP(π) 1→3, CP(2π) 2→3, then SWAP 0,2 · H0 · CP(−π/2) 0→1 · H1 · CP(−π/4) 0→2 · CP(−π/2) 1→2 · H2.',
    ],
  },

  // ---------------------------------------------------------------- GHZ, wider
  {
    id: 'ch-ghz4',
    title: 'Entangle four at once',
    concept: 'entanglement',
    brief:
      'Build the four-qubit GHZ state: only 0000 and 1111 ever appear, with equal probability. ' +
      'No qubit in it has a state of its own.',
    starter: emptyCircuit(4, 'GHZ4'),
    solution: circuit(4, 'sol', [
      g('h', [0]), g('cx', [0, 1]), g('cx', [1, 2]), g('cx', [2, 3]),
    ]),
    constraints: { qubits: 4, maxGates: 4 },
    hints: [
      'Start the same way you started the three-qubit one.',
      'One Hadamard, then a chain of CNOTs passing the correlation along.',
      'H on q0, then CNOT 0→1, 1→2 and 2→3.',
    ],
  },
];
