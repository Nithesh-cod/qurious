/**
 * The algorithm lessons.
 *
 * Kept separate from curriculum.ts because these are the long ones, and because every
 * circuit here is checked by tests/algorithms.test.ts — the test runs each lesson's
 * circuit on the simulator and asserts the outcome the prose claims. Content that lies
 * about its own physics fails the build, which is the only way a claim like "we never
 * teach wrong physics" survives contact with a hundred lessons.
 *
 * Nothing here uses classical feed-forward, because the IR has no classical control.
 * Where a textbook would measure and then correct (teleportation), we use the standard
 * deferred-measurement form: the correction becomes a controlled gate. The state at the
 * end is identical, and the lesson says so rather than hiding it.
 */

import { newId, type Circuit, type GateName } from '../core/ir';
import type { Lesson } from './curriculum';

const g = (name: GateName, qubits: number[], params?: number[]) => ({
  id: newId(), name, qubits, ...(params ? { params } : {}),
});
const circuit = (qubits: number, name: string, ops: ReturnType<typeof g>[]): Circuit => ({
  version: 1, name, qubits, ops,
});

const PI = Math.PI;

// ---------------------------------------------------------------- circuits
// Exported so the test suite can run exactly what the learner runs.

/** Deutsch–Jozsa on one input qubit, constant oracle f(x) = 0 — the oracle does nothing. */
export const DJ_CONSTANT = circuit(2, 'Deutsch — constant', [
  g('x', [1]), g('h', [1]),
  g('h', [0]),
  // oracle for f(x) = 0: no gates at all
  g('h', [0]),
]);

/** Deutsch–Jozsa, balanced oracle f(x) = x — one CNOT. */
export const DJ_BALANCED = circuit(2, 'Deutsch — balanced', [
  g('x', [1]), g('h', [1]),
  g('h', [0]),
  g('cx', [0, 1]),
  g('h', [0]),
]);

/** Bernstein–Vazirani, hidden string s = 101 on three input qubits. */
export const BV_101 = circuit(4, 'Bernstein-Vazirani s=101', [
  g('x', [3]), g('h', [3]),
  g('h', [0]), g('h', [1]), g('h', [2]),
  // f(x) = s.x with s = 101 (q0 and q2 set)
  g('cx', [0, 3]),
  g('cx', [2, 3]),
  g('h', [0]), g('h', [1]), g('h', [2]),
]);

/** Superdense coding: send the two classical bits 11 down one qubit. */
export const SUPERDENSE_11 = circuit(2, 'Superdense 11', [
  g('h', [0]), g('cx', [0, 1]),   // shared Bell pair
  g('z', [0]), g('x', [0]),        // Alice encodes "11"
  g('cx', [0, 1]), g('h', [0]),    // Bob decodes
]);

/**
 * Teleportation, deferred-measurement form.
 * q0 carries the state to send, q1/q2 are the entangled pair.
 */
export const TELEPORT = circuit(3, 'Teleportation', [
  g('ry', [0], [PI / 3]),          // the unknown state to send
  g('h', [1]), g('cx', [1, 2]),    // entangled pair shared in advance
  g('cx', [0, 1]), g('h', [0]),    // Alice's half of the protocol
  g('cx', [1, 2]), g('cz', [0, 2]),// the correction, as controlled gates
]);

/** Three-qubit quantum Fourier transform, including the final swap. */
export const QFT3 = circuit(3, 'QFT on 3 qubits', [
  g('h', [2]),
  g('cp', [1, 2], [PI / 2]),
  g('cp', [0, 2], [PI / 4]),
  g('h', [1]),
  g('cp', [0, 1], [PI / 2]),
  g('h', [0]),
  g('swap', [0, 2]),
]);

/** Phase estimation of a T gate (phase 1/8) with three counting qubits. */
export const QPE_T = circuit(4, 'Phase estimation of T', [
  g('x', [3]),                                   // eigenstate |1>
  g('h', [0]), g('h', [1]), g('h', [2]),
  // controlled-U^(2^k). U = T = P(pi/4), so U^(2^k) = P(2^k * pi/4).
  g('cp', [0, 3], [PI / 4]),
  g('cp', [1, 3], [PI / 2]),
  g('cp', [2, 3], [PI]),
  // inverse QFT on the counting register
  g('swap', [0, 2]),
  g('h', [0]),
  g('cp', [0, 1], [-PI / 2]),
  g('h', [1]),
  g('cp', [0, 2], [-PI / 4]),
  g('cp', [1, 2], [-PI / 2]),
  g('h', [2]),
]);

/** Grover on two qubits, marking |11⟩ — one iteration is exact. */
export const GROVER_11 = circuit(2, 'Grover marking |11>', [
  g('h', [0]), g('h', [1]),
  g('cz', [0, 1]),                               // oracle: flip the phase of |11>
  g('h', [0]), g('h', [1]),                      // diffusion
  g('x', [0]), g('x', [1]),
  g('cz', [0, 1]),
  g('x', [0]), g('x', [1]),
  g('h', [0]), g('h', [1]),
]);

/** GHZ state on three qubits — the many-body cousin of a Bell pair. */
export const GHZ3 = circuit(3, 'GHZ', [
  g('h', [0]), g('cx', [0, 1]), g('cx', [1, 2]),
]);

// ---------------------------------------------------------------- lessons

export const ALGORITHM_LESSONS: Lesson[] = [
  {
    id: 'oracles',
    concept: 'algorithms',
    title: 'Oracles and the phase kickback trick',
    minutes: 8,
    summary: 'The one move every quantum algorithm is built on: turning a yes/no question into a minus sign.',
    steps: [
      {
        heading: 'A function you are only allowed to call',
        body:
          'Most quantum algorithms start the same way. Somebody hands you a function — a black box, called an oracle — and you may only ask it questions. You cannot look inside it. The whole game is finding out something about it in as few questions as possible.\n\n' +
          'A classical computer asks one input at a time. A quantum computer asks about every input at once, which sounds like cheating until you realise the catch: measuring only gives you one answer back. Getting something useful out needs a second trick.',
      },
      {
        heading: 'Put the answer in the phase, not in a qubit',
        body:
          'Here is the trick, and it is worth slowing down for.\n\n' +
          'Take an extra qubit and put it in the state ket 0 minus ket 1, over root two. You do that with an X followed by an H. Now flip that qubit with a CNOT. Something odd happens: the qubit that got flipped does not change at all, but the *control* qubit picks up a minus sign.\n\n' +
          'The answer has moved out of the extra qubit and into the phase of the input. That is called phase kickback, and it is the reason quantum algorithms work.',
        circuit: DJ_BALANCED,
        watch:
          'Step through it. Watch qubit 0 — after the CNOT it has picked up a phase even though the CNOT was pointed at qubit 1.',
      },
      {
        heading: 'Why phase is the right place to put it',
        body:
          'You cannot measure a phase. So why is it useful?\n\n' +
          'Because phases interfere. Once the answer is written into the phases of a superposition, a Hadamard turns those phases back into probabilities — and if the algorithm arranged them well, the wrong answers cancel and the right one is left standing.\n\n' +
          'Every algorithm in this module is a variation on that one idea: write the answer into phases, then interfere them into a result you can actually measure.',
      },
    ],
  },

  {
    id: 'deutsch',
    concept: 'algorithms',
    title: 'Deutsch–Jozsa: one question instead of two',
    minutes: 9,
    summary: 'The first algorithm that beat every classical method — and it fits in four gates.',
    steps: [
      {
        heading: 'The puzzle',
        body:
          'You are given a function that takes one bit and returns one bit. You are promised it is one of two kinds:\n\n' +
          'Constant — it returns the same answer for both inputs.\n' +
          'Balanced — it returns 0 for one input and 1 for the other.\n\n' +
          'Which kind is it? Classically you must ask twice: once for input 0, once for input 1. One answer alone tells you nothing.\n\n' +
          'A quantum computer settles it in one question.',
      },
      {
        heading: 'The constant case',
        body:
          'Here the oracle is f(x) = 0, which does nothing at all — no gates. Put the input in superposition with an H, ask the question, and bring it back with another H.\n\n' +
          'Run it. Qubit 0 comes back to ket 0 with certainty. Two Hadamards in a row undo each other, and nothing disturbed them.',
        circuit: DJ_CONSTANT,
        watch: 'Outcomes tab: qubit 0 is 0 every single shot. That means constant.',
      },
      {
        heading: 'The balanced case',
        body:
          'Now f(x) = x, which is one CNOT. The same circuit, with the oracle switched.\n\n' +
          'This time phase kickback puts a minus sign on the ket 1 half of qubit 0. The second Hadamard turns that minus sign into a definite ket 1.\n\n' +
          'One question. A guaranteed answer. No repetition, no probability to average over.',
        circuit: DJ_BALANCED,
        watch: 'Qubit 0 is now 1 every shot. Same circuit, different oracle, opposite answer.',
      },
      {
        heading: 'Read the result honestly',
        body:
          'It is worth being clear about what this does and does not prove. Deutsch–Jozsa is a made-up problem — nobody needs to classify oracles for a living. It matters because it was the first proof that a quantum computer can be provably faster than any classical one, not just faster in practice.\n\n' +
          'The speed-up is also exact, not statistical. You do not run it a thousand times and take an average; one run is the answer.',
      },
    ],
  },

  {
    id: 'bernstein-vazirani',
    concept: 'algorithms',
    title: 'Bernstein–Vazirani: reading a hidden number in one shot',
    minutes: 8,
    summary: 'A secret bitstring that takes n classical questions comes out in a single quantum one.',
    steps: [
      {
        heading: 'The puzzle',
        body:
          'There is a hidden bitstring s. The oracle takes your input x and returns s·x — the bits of s and x multiplied together and added up, modulo 2.\n\n' +
          'Classically you recover s one bit at a time: ask 001, then 010, then 100. For an n-bit secret you ask n questions.\n\n' +
          'Quantumly you ask once, whatever n is.',
      },
      {
        heading: 'The whole thing, for s = 101',
        body:
          'Put all three input qubits into superposition, run the oracle, and Hadamard them back. The register spells out the secret.\n\n' +
          'The oracle here is just a CNOT from each qubit where s has a 1 — so from qubit 0 and qubit 2, and nothing from qubit 1.',
        circuit: BV_101,
        watch:
          'Look at the Outcomes tab. Qubits 0, 1, 2 read 1, 0, 1 — exactly the hidden string, every shot. Qubit 3 is the helper and you ignore it.',
      },
      {
        heading: 'Why it works',
        body:
          'Each input qubit picks up a phase kickback only if the matching bit of s is 1. So after the oracle, the qubits where s has a 1 are in the minus state and the rest are in the plus state.\n\n' +
          'A Hadamard sends plus to ket 0 and minus to ket 1. So the final Hadamards read the phases straight out as bits. The secret was never in the amplitudes — it was in the phases the whole time.',
      },
    ],
  },

  {
    id: 'superdense',
    concept: 'entanglement',
    title: 'Superdense coding: two bits down one qubit',
    minutes: 7,
    summary: 'Share entanglement in advance, and one qubit later carries two classical bits.',
    steps: [
      {
        heading: 'The setup',
        body:
          'Alice and Bob share a Bell pair — made once, in advance, perhaps long before either knows what will be sent. Alice keeps qubit 0, Bob keeps qubit 1.\n\n' +
          'Later Alice wants to send two classical bits. She touches only her own qubit, posts it to Bob, and Bob recovers both bits.',
      },
      {
        heading: 'Four gates, four messages',
        body:
          'Alice encodes by doing nothing for 00, X for 01, Z for 10, and both for 11. That is the whole encoding.\n\n' +
          'Bob undoes the entanglement with a CNOT and a Hadamard, and reads the two bits directly.',
        circuit: SUPERDENSE_11,
        watch: 'This one sends 11. The Outcomes tab shows |11⟩ every shot. Delete the Z to send 01, or the X to send 10.',
      },
      {
        heading: 'What it does not do',
        body:
          'It is tempting to read this as one qubit carrying two bits. It is not.\n\n' +
          'Two qubits were involved: the one Alice sent, and the one Bob had already been holding. The entanglement was distributed earlier, and it is consumed by the protocol — the pair cannot be reused. Counting honestly, two qubits carried two bits.\n\n' +
          'What is genuinely surprising is the timing: half the resource can be delivered before anyone knows what the message will be.',
      },
    ],
  },

  {
    id: 'teleportation',
    concept: 'entanglement',
    title: 'Teleportation: moving a state you cannot copy',
    minutes: 10,
    summary: 'A qubit that cannot be cloned can still be moved — and the original is destroyed doing it.',
    steps: [
      {
        heading: 'Why this is not obvious',
        body:
          'You cannot copy a qubit. That is a theorem, not an engineering limit. So how do you move an unknown state from one place to another?\n\n' +
          'You cannot measure it and send the numbers — measuring destroys most of what you wanted to send. Teleportation gets around this, and the price is that the original really is destroyed. Nothing is duplicated at any point.',
      },
      {
        heading: 'The protocol',
        body:
          'Qubit 0 holds the state to send — here an RY rotation, so it is something other than a basis state. Qubits 1 and 2 are an entangled pair, with qubit 2 already at the far end.\n\n' +
          'Alice entangles her unknown qubit with her half of the pair, then Hadamards it. In a real run she would measure and phone the results to Bob. Here the correction is applied as a CNOT and a CZ instead — the standard deferred-measurement form, which produces exactly the same final state without needing classical control.',
        circuit: TELEPORT,
        watch:
          'Look at the Bloch sphere for qubit 2. It ends up pointing where qubit 0 started. Then look at qubit 0 — it no longer holds that state at all.',
      },
      {
        heading: 'What actually travelled',
        body:
          'No information moved faster than light. Bob\'s qubit is useless to him until Alice\'s two classical bits arrive, and those travel at ordinary speed.\n\n' +
          'What teleportation really buys is this: the entanglement can be shared in advance, and then an arbitrary quantum state can be moved using only two classical bits. That is the resource trade at the heart of a future quantum network.',
      },
    ],
  },

  {
    id: 'qft',
    concept: 'algorithms',
    title: 'The quantum Fourier transform',
    minutes: 10,
    summary: 'The engine inside Shor\'s algorithm: a change of view that turns periods into positions.',
    steps: [
      {
        heading: 'What a Fourier transform is for',
        body:
          'A Fourier transform takes something that repeats and tells you how fast it repeats. Play a chord into one and it hands back the notes.\n\n' +
          'The quantum version does the same thing to the amplitudes of a register. If those amplitudes have a repeating pattern, the QFT concentrates them onto the states that describe the pattern\'s period. That is exactly what Shor\'s algorithm needs, and it is the only reason factoring is fast on a quantum computer.',
      },
      {
        heading: 'Built from Hadamards and controlled phases',
        body:
          'The recipe is short. Hadamard the top qubit. Then rotate it by a smaller and smaller phase, controlled by each qubit below it. Move down a qubit and repeat. Finish by reversing the register order with swaps.\n\n' +
          'The controlled-phase gate — CP in the palette — is the one doing the real work. Each one contributes a rotation of pi over two, then pi over four, and so on.',
        circuit: QFT3,
        watch:
          'Run it on the all-zero state and you get an even superposition of all eight outcomes — the Fourier transform of a flat input is a single spike, and of a single spike is a flat spread.',
      },
      {
        heading: 'Why it is fast',
        body:
          'The classical fast Fourier transform on 2^n numbers takes about n times 2^n steps. The quantum version takes about n squared gates — for three qubits that is the handful you see above.\n\n' +
          'The catch, and it is a real one: you cannot read the transformed amplitudes out. Measuring gives you one outcome, not the spectrum. The QFT is only useful when the thing you want is *which* outcome is most likely — which is precisely the case for period finding.',
      },
    ],
  },

  {
    id: 'phase-estimation',
    concept: 'algorithms',
    title: 'Phase estimation: measuring an angle',
    minutes: 10,
    summary: 'The subroutine underneath factoring, quantum chemistry and linear solvers.',
    steps: [
      {
        heading: 'The question it answers',
        body:
          'You have a gate U and a state that U does not move except to multiply it by a phase — an eigenstate. Phase estimation tells you what that phase is, as a binary number.\n\n' +
          'That sounds narrow. It is not. Factoring, simulating molecules and solving linear systems all reduce to estimating a phase.',
      },
      {
        heading: 'Kick the phase into a counting register',
        body:
          'Take three counting qubits, put them in superposition, and use each to apply U a different number of times — once, twice, four times. Phase kickback writes the phase into the counting register, at three different scales.\n\n' +
          'Then run the QFT backwards. The counting register collapses to the binary digits of the phase.\n\n' +
          'This circuit estimates the phase of the T gate, which is one eighth. Three counting qubits hold a number from 0 to 7, and the answer is that number divided by 8 — so we are looking for the number 1.',
        circuit: QPE_T,
        watch:
          'Outcomes tab: the counting register reads |001⟩ — the number 1, and 1 out of 8 is the phase. Qubit 0 is the one holding the 1, since it is the rightmost digit. Qubit 3 is the eigenstate and stays at 1.',
      },
      {
        heading: 'Precision costs qubits',
        body:
          'Three counting qubits give three binary digits. Want more precision? Add more counting qubits — each one doubles the resolution and costs you a longer circuit.\n\n' +
          'This is where real hardware bites. Longer circuits mean more gates, and more gates mean more error. Try this circuit in the Noise Lab and watch the answer smear across neighbouring values. That trade — precision against depth against noise — is the central engineering problem in quantum computing today.',
      },
    ],
  },

  {
    id: 'ghz',
    concept: 'entanglement',
    title: 'GHZ states: entangling three at once',
    minutes: 6,
    summary: 'What happens when three qubits share one state, and why it is fragile.',
    steps: [
      {
        heading: 'A Bell pair with one more friend',
        body:
          'A Bell state entangles two qubits so they always agree. A GHZ state does the same for three: either all three read 0, or all three read 1, and never anything in between.\n\n' +
          'It takes one Hadamard and two CNOTs. The pattern extends — a fourth qubit is one more CNOT.',
        circuit: GHZ3,
        watch:
          'Outcomes: only |000⟩ and |111⟩ appear, about half each. The six other outcomes never happen. Check the Bloch spheres too — all three arrows have collapsed to the centre.',
      },
      {
        heading: 'Fragile in a specific way',
        body:
          'GHZ states are the standard test of how good a quantum computer is, because they break easily and break visibly.\n\n' +
          'A single error on any one of the three qubits destroys the correlation for all of them. That makes GHZ a sensitive instrument: run it on hardware, count how often you get something other than 000 or 111, and you have measured the machine.\n\n' +
          'Open this circuit in the Noise Lab and do exactly that. On today\'s error rates, forbidden outcomes appear within a few hundred shots.',
      },
    ],
  },
];
