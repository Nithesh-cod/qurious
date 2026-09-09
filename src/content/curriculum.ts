/**
 * Lessons, challenges and quizzes.
 *
 * Content is data, not code: a lesson is prose plus a circuit, a challenge is a
 * starter circuit plus a solution circuit whose output state defines "correct", and a
 * quiz item is a question plus either a stored answer or — better — a circuit whose
 * real simulated output *is* the answer. That is what lets a subject teacher author
 * new material without an engineer, and it is the whole scaling argument.
 */

import { emptyCircuit, newId, type Circuit, type GateName } from '../core/ir';
import type { Challenge } from '../core/grade';
import { ALGORITHM_CHALLENGES } from './algorithmChallenges';
import { PREREQUISITE_LESSONS } from './prerequisites';
import type { ExplainerScript } from '../ui/AnimatedExplainer';

const g = (name: GateName, qubits: number[], params?: number[]) => ({
  id: newId(), name, qubits, ...(params ? { params } : {}),
});

const circuit = (qubits: number, name: string, ops: ReturnType<typeof g>[]): Circuit => ({
  version: 1, name, qubits, ops,
});

export interface LessonStep {
  heading: string;
  body: string;
  /** A circuit the learner can run and edit right there in the lesson. */
  circuit?: Circuit;
  /** What to look at once they run it. */
  watch?: string;
  /**
   * An animated walk-through. Every frame is computed by the simulator from the
   * gates applied so far, so the animation can never drift from the physics.
   */
  animation?: ExplainerScript;
}

/** Shorthand for authoring an animation beat. */
const beat = (upto: number, caption: string, hold = 3.4, emphasis?: 'key') =>
  ({ upto, caption, hold, ...(emphasis ? { emphasis } : {}) });

export interface Lesson {
  id: string;
  concept: string;
  title: string;
  minutes: number;
  summary: string;
  steps: LessonStep[];
}

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ qubits
  {
    id: 'qubits',
    concept: 'qubit',
    title: 'Qubits and basis states',
    minutes: 5,
    summary: 'What |0⟩ and |1⟩ actually mean, how a register is numbered, and why the order matters.',
    steps: [
      {
        heading: 'A qubit is a direction, not a number',
        body:
          'A classical bit is a switch. It is either 0 or 1, and there is nothing in between.\n\n' +
          'A qubit is more like an arrow that can point anywhere on a sphere. We measure it against two opposite directions, and we call those |0⟩ and |1⟩. The angle brackets are called a **ket**, and they are just a label meaning "the state named 0".\n\n' +
          'Every qubit in this app starts pointing at |0⟩ and stays there until a gate turns it.',
        circuit: circuit(1, 'A qubit at rest', []),
        watch: 'Probability of measuring 0 is 100%. The Bloch arrow points straight up.',
      },
      {
        heading: 'X is the quantum NOT',
        body:
          'The X gate swaps the two poles: |0⟩ becomes |1⟩, and |1⟩ becomes |0⟩.\n\n' +
          'On its own that is exactly the classical NOT gate, and it is worth noticing early. A great deal of quantum computing is ordinary logic. Only some of it is strange.\n\n' +
          'Apply X twice and you are back where you started — the arrow goes down, then straight back up.',
        circuit: circuit(1, 'Bit flip', [g('x', [0])]),
        watch: 'The arrow has swung to the south pole. 100% chance of measuring 1.',
      },
      {
        heading: 'Registers, and which end is which',
        body:
          'Put three qubits side by side and you have a register. Three qubits have eight possible readings, |000⟩ through |111⟩.\n\n' +
          'We write them with **qubit 0 on the right**, the same way the ones digit of an ordinary number goes last. So |101⟩ means q2 = 1, q1 = 0, q0 = 1.\n\n' +
          'This is the convention Qiskit uses as well. Getting it backwards is the most common mistake people make when moving between quantum tools, so it is worth fixing in your head now rather than later.\n\n' +
          'The circuit below flips q0 and q2. Read the outcome and check that it says 101.',
        circuit: circuit(3, 'Setting |101⟩', [g('x', [0]), g('x', [2])]),
        watch: 'One outcome at 100%: 101. Qubit 0 is the rightmost digit.',
        animation: {
          title: 'Reading a register',
          show: ['amplitudes', 'ket'],
          circuit: circuit(3, 'anim', [g('x', [0]), g('x', [2])]),
          beats: [
            beat(0, 'All three qubits start at ket 0, so the register reads 000 with certainty.', 3.2),
            beat(1, 'X on qubit 0 flips the rightmost digit. The register is now 001 — still one outcome, just a different one.', 4),
            beat(2, 'X on qubit 2 flips the leftmost digit, giving 101. Qubit 1 was never touched, so it stayed 0.', 4.4, 'key'),
          ],
        },
      },
      {
        heading: 'Why 2ⁿ matters',
        body:
          'Three qubits do not hold three numbers. They hold eight — one amplitude for every reading the register could give.\n\n' +
          '- 3 qubits: 8 amplitudes\n- 10 qubits: 1,024\n- 20 qubits: over a million\n- 50 qubits: about 18 petabytes, at the 16 bytes a computer needs per amplitude\n\n' +
          'That doubling is where the promise of quantum computing comes from. It is also why this simulator stops at twelve qubits: every extra qubit doubles both the memory and the work. That is physics, not a limitation of the app.',
      },
    ],
  },

  // ------------------------------------------------------------------ superposition
  {
    id: 'superposition',
    concept: 'superposition',
    title: 'Superposition',
    minutes: 6,
    summary: 'The Hadamard gate, what "both at once" actually means, and why measuring destroys it.',
    steps: [
      {
        heading: 'The Hadamard tips a qubit onto the equator',
        body:
          'Add a Hadamard — the H gate — to a fresh qubit. The arrow swings from the north pole down to the equator.\n\n' +
          'The state is now written 0.707|0⟩ + 0.707|1⟩. Those numbers are **amplitudes**, not probabilities. Square them to get the probabilities: 0.707 squared is 0.5, so it is the 50/50 you would expect.\n\n' +
          'Superposition does not mean "we do not know which one it is". It means the arrow is genuinely pointing somewhere that is neither.',
        circuit: circuit(1, 'Superposition', [g('h', [0])]),
        watch: 'The arrow lands on the equator. Two outcomes now appear, each at 50%.',
        animation: {
          title: 'A Hadamard, one gate at a time',
          show: ['bloch', 'amplitudes', 'ket'],
          circuit: circuit(1, 'anim', [g('h', [0])]),
          beats: [
            beat(0, 'The qubit starts at ket 0 — the arrow points straight up, and measuring gives 0 every time.', 3.4),
            beat(1, 'The Hadamard tips it onto the equator. Watch the second bar grow from nothing: two outcomes now, half each.', 4.6, 'key'),
          ],
        },
      },
      {
        heading: 'Two Hadamards undo each other',
        body:
          'Here is what separates superposition from plain randomness.\n\n' +
          'If a Hadamard simply scrambled the qubit, doing it twice would leave it scrambled. It does not. The second Hadamard brings the arrow back to the north pole exactly, every time.\n\n' +
          'Flip a coin twice and it is still random. Rotate a qubit twice and it is back where it started. **Nothing was lost — the information was only turned sideways.**',
        circuit: circuit(1, 'There and back', [g('h', [0]), g('h', [0])]),
        watch: 'Back at 100% |0⟩. Delete one Hadamard and watch it return to 50/50.',
        animation: {
          title: 'Superposition is not randomness',
          show: ['bloch', 'amplitudes'],
          circuit: circuit(1, 'anim', [g('h', [0]), g('h', [0])]),
          beats: [
            beat(0, 'Start at ket 0.', 2.6),
            beat(1, 'One Hadamard: an even superposition, fifty fifty.', 3.4),
            beat(2, 'A second Hadamard brings it exactly back to ket 0. A random bit could never be un-randomised — this was a rotation all along, and rotations can be undone.', 5.4, 'key'),
          ],
        },
      },
      {
        heading: 'Scaling up',
        body:
          'Put a Hadamard on every qubit of a three-qubit register and you have all eight readings at once, equally weighted. Three gates, eight amplitudes.\n\n' +
          'This is the opening move of almost every quantum algorithm.\n\n' +
          'Then comes the catch, and it is the whole difficulty of the field: measuring hands you back exactly one of those eight. Holding eight things at once is the easy part. Getting a useful answer out is the hard part.',
        circuit: circuit(3, 'Eight at once', [g('h', [0]), g('h', [1]), g('h', [2])]),
        watch: 'Eight outcomes, each at 12.5%. All three spheres on the equator.',
      },
    ],
  },

  // ------------------------------------------------------------------ bloch
  {
    id: 'bloch',
    concept: 'bloch',
    title: 'The Bloch sphere',
    minutes: 6,
    summary: 'Reading a single qubit as a point on a sphere, and every gate as a rotation of it.',
    steps: [
      {
        heading: 'Six landmarks',
        body:
          'Everything a single qubit can be is a point on the surface of one sphere. Learn six places on it and you can read most states at a glance.\n\n' +
          '- North pole: |0⟩\n- South pole: |1⟩\n- +X: |+⟩, the even mix a Hadamard makes\n- −X: |−⟩, the same mix with a minus sign\n- +Y and −Y: that mix again, turned a quarter turn in phase\n\n' +
          'Everything else is somewhere in between. The x, y and z numbers under the sphere are the coordinates of that point.',
        circuit: circuit(1, 'On the +X axis', [g('h', [0])]),
        watch: 'Read the x, y, z numbers under the sphere: x = 1.00, y = 0.00, z = 0.00.',
      },
      {
        heading: 'S rotates a quarter turn around the vertical',
        body:
          'Start with a Hadamard, which puts the arrow on +X. Now add S.\n\n' +
          'The arrow swings a quarter turn around the vertical axis and lands on +Y. The probabilities do not change at all — still 50/50 — because spinning around the vertical never changes how high the arrow sits.\n\n' +
          'This is your first sight of **phase**: a real, physical change that measurement on its own cannot see.',
        circuit: circuit(1, 'Quarter turn to +Y', [g('h', [0]), g('s', [0])]),
        watch: 'y = 1.00 now, and z is still 0. The outcome probabilities are unchanged at 50/50.',
      },
      {
        heading: 'Rotations let you land anywhere',
        body:
          'X, H and S are fixed turns. RX, RY and RZ turn by whatever angle you ask for.\n\n' +
          'Click the RY gate below and drag its angle slider. The arrow sweeps smoothly from the north pole all the way down to the south, and the measurement probabilities follow it the whole way.\n\n' +
          'That is the mental model worth keeping: **a quantum gate is not a lookup table, it is a rotation.**',
        circuit: circuit(1, 'Adjustable rotation', [g('ry', [0], [Math.PI / 3])]),
        watch: 'Click the RY gate, then drag the angle. Watch the arrow and the probabilities move together.',
      },
      {
        heading: 'Where the sphere stops working',
        body:
          'The Bloch sphere describes one qubit perfectly and two qubits not at all.\n\n' +
          'Run the circuit below and both arrows disappear, leaving a dot at the centre of each sphere. That is not the app giving up. It is the picture telling you the truth: once two qubits are entangled, neither one has a state of its own left to draw.\n\n' +
          'The information has moved out of the individual qubits and into the relationship between them. The entanglement lesson picks this up.',
        circuit: circuit(2, 'The sphere gives up', [g('h', [0]), g('cx', [0, 1])]),
        watch: 'Both arrows vanish and an amber dot appears at each centre. |r| reads 0.00.',
      },
    ],
  },

  // ------------------------------------------------------------------ phase
  {
    id: 'phase',
    concept: 'phase',
    title: 'Phase',
    minutes: 7,
    summary: 'The part of a quantum state that measurement cannot see — and that decides everything.',
    steps: [
      {
        heading: 'Two states, identical outcomes',
        body:
          'Build |+⟩ with a Hadamard and look at the outcomes: 50/50.\n\n' +
          'Now add a Z gate and run it again. Still 50/50 — exactly, not approximately. Nothing you can measure has changed.\n\n' +
          'But the state genuinely is different. It is now 0.707|0⟩ − 0.707|1⟩, with a minus sign on the second term. **Watch the colour of the amplitude bars rather than their length. The colour is the phase.**',
        circuit: circuit(1, 'Phase flipped', [g('h', [0]), g('z', [0])]),
        watch: 'Probabilities identical to a plain H. The |1⟩ bar has changed colour, and x now reads −1.00.',
        animation: {
          title: 'The change you cannot measure',
          show: ['bloch', 'amplitudes', 'ket'],
          circuit: circuit(1, 'anim', [g('h', [0]), g('z', [0])]),
          beats: [
            beat(0, 'Start at ket 0.', 2.4),
            beat(1, 'Hadamard gives the plus state — fifty fifty, both bars the same colour.', 3.6),
            beat(2, 'Now Z. Watch carefully: the bar lengths do not move at all. Only the colour of the second bar flips, and the Bloch arrow swings to the opposite side of the equator. That is phase — real, and invisible to measurement.', 6, 'key'),
          ],
        },
      },
      {
        heading: 'The phase gates are just smaller turns',
        body:
          'Z, S and T are the same move at three sizes, all of them turns about the vertical axis.\n\n' +
          '- Z is a half turn\n- S is a quarter turn\n- T is an eighth of a turn\n\n' +
          'So two T gates make an S, and two S gates make a Z. The dagger versions, S† and T†, turn the other way.\n\n' +
          'Stack two T gates below, then compare the x, y and z numbers with a circuit that uses H then S. They match.',
        circuit: circuit(1, 'Two T gates', [g('h', [0]), g('t', [0]), g('t', [0])]),
        watch: 'Compare y and z with a circuit using H then S. They match.',
      },
      {
        heading: 'Phase becomes visible when it interferes',
        body:
          'A change you cannot measure sounds useless. It is not. It becomes measurable the moment you bring the paths back together.\n\n' +
          'Hadamard, then Z, then Hadamard turns |0⟩ into |1⟩ with certainty. The Z in the middle did nothing observable on its own, yet it completely changed the final answer.\n\n' +
          'That is the whole mechanism of quantum computing, in three gates.',
        circuit: circuit(1, 'H, Z, H equals X', [g('h', [0]), g('z', [0]), g('h', [0])]),
        watch: '100% chance of measuring 1. Remove the Z and it becomes 100% zero instead.',
        animation: {
          title: 'Phase becoming visible',
          show: ['bloch', 'amplitudes', 'ket'],
          circuit: circuit(1, 'anim', [g('h', [0]), g('z', [0]), g('h', [0])]),
          beats: [
            beat(0, 'Start at ket 0.', 2.4),
            beat(1, 'Hadamard: an even superposition.', 3),
            beat(2, 'Z flips the phase. Nothing measurable has changed yet.', 3.6),
            beat(3, 'The second Hadamard brings the two paths back together. The ket 0 amplitudes cancel to nothing and ket 1 reaches certainty. Three gates, and the middle one did all the work invisibly.', 6, 'key'),
          ],
        },
      },
    ],
  },

  // ------------------------------------------------------------------ measurement
  {
    id: 'measurement',
    concept: 'measurement',
    title: 'Measurement and collapse',
    minutes: 6,
    summary: 'Amplitudes become probabilities, superposition ends, and repeated shots are the only way to see the shape.',
    steps: [
      {
        heading: 'Square the amplitude',
        body:
          'Measurement has one rule, called the **Born rule**: the chance of an outcome is the square of the size of its amplitude.\n\n' +
          'An amplitude of 0.707 gives a probability of 0.5. An amplitude of −0.707 gives the same 0.5, because squaring throws the minus sign away.\n\n' +
          'That is exactly why phase is invisible to a single measurement — and exactly why an algorithm has to do something with the phase before it measures.',
        circuit: circuit(2, 'Unequal amplitudes', [g('ry', [0], [Math.PI / 3])]),
        watch: 'Switch to the Table tab: the probability column is the amplitude column squared.',
        animation: {
          title: 'Amplitude squared is probability',
          show: ['bloch', 'amplitudes', 'ket'],
          circuit: circuit(1, 'anim', [
            g('ry', [0], [Math.PI / 6]), g('ry', [0], [Math.PI / 6]),
            g('ry', [0], [Math.PI / 6]), g('ry', [0], [Math.PI / 6]),
          ]),
          beats: [
            beat(0, 'Start at ket 0 — amplitude one, probability one hundred percent.', 3),
            beat(1, 'A small rotation. The arrow tips slightly and a little probability leaks into ket 1.', 3.6),
            beat(2, 'Further round. Notice the bars are not moving evenly — probability is the amplitude squared, so it changes faster near the middle.', 4.6),
            beat(4, 'Two thirds of the way to the south pole, and the split is 25 to 75. Keep going and it would reach certainty at ket 1.', 5, 'key'),
          ],
        },
      },
      {
        heading: 'One shot tells you almost nothing',
        body:
          'A real quantum computer hands you one bitstring per run. A single shot of a superposition tells you almost nothing about the state it came from.\n\n' +
          'So you run the circuit thousands of times and look at the shape of the results.\n\n' +
          'Open the Outcomes tab and drag the shots slider down to 64: the histogram comes out lumpy and misleading. Drag it up to 8,192 and the true shape appears. This is the actual daily experience of quantum programming.',
        circuit: circuit(2, 'Sampling noise', [g('h', [0]), g('cx', [0, 1])]),
        watch: 'Outcomes tab. At 64 shots the split is visibly uneven; at 8,192 it is close to 50/50.',
      },
      {
        heading: 'Measuring ends the superposition',
        body:
          'Measurement is not a passive read. It forces the qubit onto one of the two poles and discards everything else. There is no undo.\n\n' +
          'The circuit below measures qubit 0 and **then** applies a Hadamard to it. The tutor will warn you about that, because by then the qubit is an ordinary classical bit and the Hadamard is wasted.\n\n' +
          'Put your measurements at the end, unless you have a specific reason not to.',
        circuit: circuit(1, 'Measuring too early', [g('h', [0]), g('measure', [0]), g('h', [0])]),
        watch: 'The tutor flags a gate acting on an already-measured qubit.',
      },
    ],
  },

  // ------------------------------------------------------------------ entanglement
  {
    id: 'entanglement',
    concept: 'entanglement',
    title: 'Entanglement',
    minutes: 8,
    summary: 'CNOT, Bell states, and why an entangled qubit has no state of its own.',
    steps: [
      {
        heading: 'CNOT: flip if the control is 1',
        body:
          'CNOT is a conditional flip. It has a **control** qubit and a **target**: when the control is |1⟩ the target flips, and when the control is |0⟩ nothing happens at all.\n\n' +
          'That is a perfectly ordinary classical operation, and on its own it does nothing interesting.\n\n' +
          'The circuit below is a bare CNOT with the control still sitting at |0⟩, so the register never moves.',
        circuit: circuit(2, 'A CNOT doing nothing', [g('cx', [0, 1])]),
        watch: 'Both qubits still at |00⟩. The tutor will point out that this CNOT cannot entangle anything.',
      },
      {
        heading: 'Put the control in superposition first',
        body:
          'Now put a Hadamard on the control first.\n\n' +
          'The control is both |0⟩ and |1⟩ at once, so the CNOT both flips the target and does not flip it. The result is 0.707|00⟩ + 0.707|11⟩, called a **Bell state**.\n\n' +
          'Look at what is missing. |01⟩ and |10⟩ never appear. The two qubits always agree, even though neither one has settled on an answer yet — and measuring either one tells you the other immediately.',
        circuit: circuit(2, 'Bell state', [g('h', [0]), g('cx', [0, 1])]),
        watch: 'Only 00 and 11 appear, at 50% each. Both Bloch arrows have collapsed to the centre.',
        animation: {
          title: 'Entanglement forming',
          show: ['bloch', 'amplitudes', 'ket'],
          circuit: circuit(2, 'anim', [g('h', [0]), g('cx', [0, 1])]),
          beats: [
            beat(0, 'Both qubits at ket 0. Both arrows point up, both spheres full length.', 3.2),
            beat(1, 'Hadamard on qubit 0 only. Its arrow drops to the equator; qubit 1 has not moved. Two outcomes, 00 and 01.', 4.4),
            beat(2, 'Now the CNOT. Watch both arrows vanish into the centre at once — that is the moment entanglement forms. The 01 bar collapses to nothing and 11 grows in its place. Neither qubit has a state of its own any more.', 6.4, 'key'),
          ],
        },
      },
      {
        heading: 'Why the spheres went empty',
        body:
          'The arrows are gone and there is a dot at the centre instead. That is the point, not a bug.\n\n' +
          'An entangled qubit has no state of its own to draw. All of the information lives in the pair.\n\n' +
          'Ask "what is qubit 0 doing?" and there is genuinely no answer. The only true statement left is "qubit 0 and qubit 1 agree".',
        circuit: circuit(2, 'Bell state', [g('h', [0]), g('cx', [0, 1])]),
        watch: 'The vector length |r| reads 0.00. For a pure unentangled qubit it reads 1.00.',
      },
      {
        heading: 'The other three Bell states',
        body:
          'There are four maximally entangled two-qubit states, and a single gate takes you between them.\n\n' +
          'Add a Z after the Hadamard and the two terms end up with opposite signs. Add an X instead and the qubits always disagree rather than agree.\n\n' +
          'All four are equally entangled. They differ only in phase and in whether the qubits match — and telling them apart is exactly what superdense coding puts to work.',
        circuit: circuit(2, 'Bell Φ−', [g('h', [0]), g('cx', [0, 1]), g('z', [0])]),
        watch: 'Still only 00 and 11 at 50/50, but the |11⟩ amplitude bar has flipped colour.',
      },
      {
        heading: 'GHZ: entangling three',
        body:
          'One Hadamard and two CNOTs entangle three qubits so that all three always agree: 0.707|000⟩ + 0.707|111⟩.\n\n' +
          'The pattern generalises — one Hadamard, then a CNOT out to every other qubit.\n\n' +
          'Open this in the builder, add a fourth qubit and a third CNOT, and check that only 0000 and 1111 survive.',
        circuit: circuit(3, 'GHZ', [g('h', [0]), g('cx', [0, 1]), g('cx', [0, 2])]),
        watch: 'Only 000 and 111. All three spheres empty.',
        animation: {
          title: 'Entangling three',
          show: ['bloch', 'amplitudes'],
          circuit: circuit(3, 'anim', [g('h', [0]), g('cx', [0, 1]), g('cx', [0, 2])]),
          beats: [
            beat(0, 'Three qubits, all at ket 0.', 2.6),
            beat(1, 'Hadamard on qubit 0 — two outcomes now, 000 and 001.', 3.4),
            beat(2, 'First CNOT links qubit 1 to it. Now 000 and 011.', 3.4),
            beat(3, 'Second CNOT brings qubit 2 in. Only 000 and 111 survive: all three always agree, and all three spheres are empty.', 5.4, 'key'),
          ],
        },
      },
    ],
  },

  // ------------------------------------------------------------------ interference
  {
    id: 'interference',
    concept: 'interference',
    title: 'Interference',
    minutes: 8,
    summary: 'Amplitudes cancelling and reinforcing — the engine underneath every quantum speed-up.',
    steps: [
      {
        heading: 'Amplitudes can be negative. Probabilities cannot.',
        body:
          'This is the whole trick, and it fits in one sentence: **amplitudes can be negative, and probabilities cannot.**\n\n' +
          'If two paths lead to the same outcome, one carrying +0.5 and the other −0.5, they add to zero and that outcome simply never happens.\n\n' +
          'Classical probabilities can only ever pile up. Quantum amplitudes can cancel. Everything a quantum computer does faster, it does by arranging for the wrong answers to cancel.',
        circuit: circuit(1, 'Cancelling to certainty', [g('h', [0]), g('z', [0]), g('h', [0])]),
        watch: 'One outcome at 100%. The |0⟩ path cancelled itself out completely.',
        animation: {
          title: 'Watching amplitudes cancel',
          show: ['amplitudes', 'ket'],
          circuit: circuit(1, 'anim', [g('h', [0]), g('z', [0]), g('h', [0])]),
          beats: [
            beat(0, 'One qubit at ket 0. A single full bar.', 2.4),
            beat(1, 'Hadamard splits it into two equal paths.', 3),
            beat(2, 'Z turns the phase of the second path. Same lengths, different colour.', 3.6),
            beat(3, 'The final Hadamard recombines them. The ket 0 bar drops to zero — the two contributions were equal and opposite, so they destroyed each other. Everything piled into ket 1 instead.', 6.2, 'key'),
          ],
        },
      },
      {
        heading: 'Deutsch–Jozsa: one query instead of two',
        body:
          'Here is the smallest problem where quantum genuinely wins.\n\n' +
          'You are handed a function that takes one bit and returns one bit, and you are promised it is one of two kinds:\n\n' +
          '- **Constant** — the same answer for both inputs\n- **Balanced** — a different answer for each input\n\n' +
          'Classically you have to test both inputs. There is no way around it, because one answer on its own tells you nothing.\n\n' +
          'The circuit below tests it once. Qubit 0 comes out reading 1 with certainty, and that single bit is the entire verdict: balanced.',
        circuit: circuit(2, 'Deutsch–Jozsa, balanced', [
          g('x', [1]), g('h', [1]), g('h', [0]), g('cx', [0, 1]), g('h', [0]),
        ]),
        watch: 'Qubit 0 is 1 with certainty. That single bit is the whole answer: the function is balanced.',
      },
      {
        heading: 'Now make the oracle constant',
        body:
          'Delete the CNOT. That turns the oracle into "do nothing", which is a constant function.\n\n' +
          'Run it again and qubit 0 now reads 0 with certainty. One gate changed, and the answer flipped.\n\n' +
          'The gap here is small — one question instead of two. What made this result matter is that the same idea scales to an exponential gap on larger inputs.',
        circuit: circuit(2, 'Deutsch–Jozsa, constant', [
          g('x', [1]), g('h', [1]), g('h', [0]), g('h', [0]),
        ]),
        watch: 'Qubit 0 now reads 0 with certainty. The answer flipped with one gate.',
      },
      {
        heading: 'The pattern to remember',
        body:
          'Almost every quantum algorithm has the same three-part shape.\n\n' +
          '- Spread into superposition, usually with Hadamards\n- Do something that writes the answer into the phases\n- Interfere the paths back together, so the wrong answers cancel\n\n' +
          'Grover, Deutsch–Jozsa and Shor are all variations on that skeleton. Once you can pick out those three parts, an unfamiliar algorithm stops being a wall of gates.',
      },
    ],
  },

  // ------------------------------------------------------------------ algorithms
  {
    id: 'grover',
    concept: 'algorithms',
    title: 'Grover’s search',
    minutes: 10,
    summary: 'Interference put to work: marking an answer with a phase, then turning phase into probability.',
    steps: [
      {
        heading: 'Start with everything equally likely',
        body:
          'Grover searches a list with no structure to it. No sorting, no index, nothing to exploit — you can only check entries one at a time.\n\n' +
          'Two qubits give four entries: 00, 01, 10 and 11. We start with all four equally likely.\n\n' +
          'Say the answer is 11. Right now we would find it one time in four, which is exactly what guessing gets you.',
        circuit: circuit(2, 'Four candidates', [g('h', [0]), g('h', [1])]),
        watch: 'Four outcomes at 25% each.',
      },
      {
        heading: 'The oracle marks the answer with a phase',
        body:
          'Add a CZ gate. It flips the sign of the |11⟩ amplitude and leaves the other three untouched.\n\n' +
          'Run it and look at the probabilities: still 25% each. Nothing has changed that you could measure.\n\n' +
          'The answer has been marked, but the mark is hiding in the phase. Watch the **colour** of the |11⟩ bar rather than its height.',
        circuit: circuit(2, 'Oracle applied', [g('h', [0]), g('h', [1]), g('cz', [0, 1])]),
        watch: 'Probabilities unchanged at 25%. The |11⟩ amplitude bar has changed colour.',
      },
      {
        heading: 'The diffuser turns phase into probability',
        body:
          'The second half — H, X, CZ, X, H on both qubits — is called the diffuser. It reflects every amplitude about their average.\n\n' +
          'The marked amplitude was the only one below the average, so reflecting sends it well above. The three unmarked ones shrink to nothing and |11⟩ grows to certainty.\n\n' +
          'Run it: |11⟩ now comes up 100% of the time. Nothing was searched. The wrong answers cancelled themselves out.',
        circuit: circuit(2, 'Grover, one iteration', [
          g('h', [0]), g('h', [1]), g('cz', [0, 1]),
          g('h', [0]), g('h', [1]), g('x', [0]), g('x', [1]),
          g('cz', [0, 1]), g('x', [0]), g('x', [1]), g('h', [0]), g('h', [1]),
        ]),
        watch: '|11⟩ at 100%. Change the oracle to mark a different state and the answer follows.',
        animation: {
          title: 'Grover, amplitude by amplitude',
          show: ['amplitudes', 'ket'],
          circuit: circuit(2, 'anim', [
            g('h', [0]), g('h', [1]), g('cz', [0, 1]),
            g('h', [0]), g('h', [1]), g('x', [0]), g('x', [1]),
            g('cz', [0, 1]), g('x', [0]), g('x', [1]), g('h', [0]), g('h', [1]),
          ]),
          beats: [
            beat(0, 'Everything starts at ket 00.', 2.4),
            beat(2, 'Two Hadamards spread it across all four candidates, 25% each. Guessing would find the answer one time in four.', 4.4),
            beat(3, 'The oracle marks ket 11. Look at the bars: no length has changed at all. Only the colour of the last one flipped. The answer is marked but still invisible.', 5.6, 'key'),
            beat(7, 'The diffuser begins — Hadamards, then X gates, then the second CZ. The amplitudes are being reflected about their average.', 4.6),
            beat(12, 'And ket 11 reaches 100% while the other three cancel to nothing. Nothing was searched. The wrong answers destroyed themselves.', 6.4, 'key'),
          ],
        },
      },
      {
        heading: 'Why this matters, and what it is not',
        body:
          'Classically, finding one entry among N takes about N/2 guesses. Grover takes about the square root of N.\n\n' +
          'For four entries that is one step instead of two, which is unimpressive. For a million entries it is a thousand steps instead of five hundred thousand.\n\n' +
          'It is a **quadratic** speed-up, not an exponential one. Knowing that difference is worth more than being able to recite the circuit — it is also the thing people most often get wrong about quantum computing.',
      },
    ],
  },
];

// ---------------------------------------------------------------- challenges

const CORE_CHALLENGES: Challenge[] = [
  {
    id: 'ch-flip', title: 'Flip a qubit', concept: 'qubit',
    brief: 'Get the qubit from |0⟩ to |1⟩ with certainty.',
    starter: emptyCircuit(1, 'Flip'),
    solution: circuit(1, 'sol', [g('x', [0])]),
    constraints: { qubits: 1, maxGates: 1 },
    hints: ['One gate is enough.', 'You want the quantum equivalent of NOT.', 'It is the X gate — drag it onto the wire.'],
  },
  {
    id: 'ch-basis-101', title: 'Build |101⟩', concept: 'qubit',
    brief: 'Set the three-qubit register to the basis state |101⟩. Remember qubit 0 is the rightmost digit.',
    starter: emptyCircuit(3, '101'),
    solution: circuit(3, 'sol', [g('x', [0]), g('x', [2])]),
    constraints: { qubits: 3, maxGates: 2 },
    hints: [
      'Only two of the three qubits need flipping.',
      '|101⟩ means q2 = 1, q1 = 0, q0 = 1.',
      'X on qubit 0 and X on qubit 2.',
    ],
  },
  {
    id: 'ch-superposition', title: 'Make an even superposition', concept: 'superposition',
    brief: 'Put a single qubit into an equal mix of |0⟩ and |1⟩.',
    starter: emptyCircuit(1, 'Superposition'),
    solution: circuit(1, 'sol', [g('h', [0])]),
    constraints: { qubits: 1, maxGates: 1 },
    hints: ['One gate again.', 'It should land the Bloch arrow on the equator.', 'Hadamard.'],
  },
  {
    id: 'ch-super-all', title: 'Eight outcomes at once', concept: 'superposition',
    brief: 'Put a three-qubit register into an even superposition over all eight basis states.',
    starter: emptyCircuit(3, 'All eight'),
    solution: circuit(3, 'sol', [g('h', [0]), g('h', [1]), g('h', [2])]),
    constraints: { qubits: 3, maxGates: 3 },
    hints: ['Every qubit needs the same treatment.', 'Three gates, all the same.', 'A Hadamard on each of q0, q1 and q2.'],
  },
  {
    id: 'ch-plus-i', title: 'Land on the +Y axis', concept: 'bloch',
    brief: 'Get the Bloch vector to x = 0, y = 1, z = 0 — the state 0.707|0⟩ + 0.707i|1⟩.',
    starter: emptyCircuit(1, '+Y'),
    solution: circuit(1, 'sol', [g('h', [0]), g('s', [0])]),
    constraints: { qubits: 1, maxGates: 2 },
    hints: [
      'First get onto the equator, then rotate around the vertical axis.',
      'A Hadamard puts you on +X. You need a quarter turn from there.',
      'Hadamard, then S.',
    ],
  },
  {
    id: 'ch-minus', title: 'Make the minus state', concept: 'phase',
    brief: 'Produce 0.707|0⟩ − 0.707|1⟩ — same probabilities as |+⟩, opposite phase.',
    starter: emptyCircuit(1, 'Minus'),
    solution: circuit(1, 'sol', [g('x', [0]), g('h', [0])]),
    constraints: { qubits: 1, maxGates: 2 },
    hints: [
      'The measurement outcomes are identical to a plain Hadamard — only the phase differs.',
      'Two gates. Order matters.',
      'Flip the qubit first, then apply the Hadamard.',
    ],
  },
  {
    id: 'ch-hzh', title: 'Build an X gate without using X', concept: 'interference',
    brief: 'Turn |0⟩ into |1⟩ with certainty, but you may not use X, Y or any rotation.',
    starter: emptyCircuit(1, 'No X allowed'),
    solution: circuit(1, 'sol', [g('h', [0]), g('z', [0]), g('h', [0])]),
    constraints: { qubits: 1, maxGates: 3, forbiddenGates: ['x', 'y', 'rx', 'ry'] },
    hints: [
      'Spread into superposition, do something to the phase, then bring it back.',
      'A phase flip in the middle of two Hadamards.',
      'H, then Z, then H.',
    ],
  },
  {
    id: 'ch-bell', title: 'Build a Bell state', concept: 'entanglement',
    brief: 'Entangle two qubits so they always agree: 0.707|00⟩ + 0.707|11⟩.',
    starter: emptyCircuit(2, 'Bell'),
    solution: circuit(2, 'sol', [g('h', [0]), g('cx', [0, 1])]),
    constraints: { qubits: 2, maxGates: 2 },
    hints: [
      'Two gates: one to create a superposition, one to spread it.',
      'The CNOT only entangles if its control is already in superposition.',
      'Hadamard on qubit 0, then CNOT from qubit 0 to qubit 1.',
    ],
  },
  {
    id: 'ch-bell-psi', title: 'Make the qubits always disagree', concept: 'entanglement',
    brief: 'Build 0.707|01⟩ + 0.707|10⟩ — entangled, but now the two qubits are always opposite.',
    starter: emptyCircuit(2, 'Psi plus'),
    solution: circuit(2, 'sol', [g('h', [0]), g('cx', [0, 1]), g('x', [0])]),
    constraints: { qubits: 2, maxGates: 3 },
    hints: [
      'Start from the ordinary Bell state and change one of the qubits.',
      'Flipping either qubit after entangling turns agreement into disagreement.',
      'H, CNOT, then X on qubit 0.',
    ],
  },
  {
    id: 'ch-ghz', title: 'Entangle three qubits', concept: 'entanglement',
    brief: 'Build the GHZ state 0.707|000⟩ + 0.707|111⟩ — all three qubits always agree.',
    starter: emptyCircuit(3, 'GHZ'),
    solution: circuit(3, 'sol', [g('h', [0]), g('cx', [0, 1]), g('cx', [0, 2])]),
    constraints: { qubits: 3, maxGates: 3 },
    hints: [
      'Same idea as the Bell state, extended.',
      'One Hadamard. Then reach every other qubit from it.',
      'H on q0, CNOT q0→q1, CNOT q0→q2.',
    ],
  },
  {
    id: 'ch-swap', title: 'Swap two qubits without the SWAP gate', concept: 'algorithms',
    brief: 'Exchange the states of two qubits using only CNOTs. Start from |10⟩ and end at |01⟩.',
    starter: circuit(2, 'Swap', [g('x', [1])]),
    solution: circuit(2, 'sol', [g('x', [1]), g('cx', [0, 1]), g('cx', [1, 0]), g('cx', [0, 1])]),
    constraints: { qubits: 2, forbiddenGates: ['swap'], maxGates: 4 },
    hints: [
      'Three CNOTs will do it.',
      'Alternate the direction each time.',
      'CNOT 0→1, then CNOT 1→0, then CNOT 0→1 again.',
    ],
  },
  {
    id: 'ch-dj', title: 'Deutsch–Jozsa', concept: 'interference',
    brief: 'Build the circuit that decides in one query whether a one-bit function is constant or balanced, for the balanced case.',
    starter: emptyCircuit(2, 'Deutsch–Jozsa'),
    solution: circuit(2, 'sol', [g('x', [1]), g('h', [1]), g('h', [0]), g('cx', [0, 1]), g('h', [0])]),
    constraints: { qubits: 2, maxGates: 5 },
    hints: [
      'The ancilla qubit needs to start in the |−⟩ state.',
      'X then H on qubit 1 gives you |−⟩. Hadamard the query qubit before and after the oracle.',
      'X q1, H q1, H q0, CNOT q0→q1, H q0.',
    ],
  },
  {
    id: 'ch-measure', title: 'Entangle, then measure', concept: 'measurement',
    brief: 'Build a Bell state and measure both qubits — with the measurements in the right place.',
    starter: emptyCircuit(2, 'Measure'),
    solution: circuit(2, 'sol', [g('h', [0]), g('cx', [0, 1]), g('measure', [0]), g('measure', [1])]),
    constraints: { qubits: 2, requiredGates: ['measure'] },
    compareBy: 'distribution',
    hints: [
      'Build the Bell state first, exactly as before.',
      'Measurements go at the end, after every gate.',
      'H, CNOT, then a Measure on each qubit.',
    ],
  },
  {
    id: 'ch-grover', title: 'Run Grover on two qubits', concept: 'algorithms',
    brief: 'Find the marked entry |11⟩ with certainty in a single iteration.',
    starter: circuit(2, 'Grover start', [g('h', [0]), g('h', [1])]),
    solution: circuit(2, 'sol', [
      g('h', [0]), g('h', [1]), g('cz', [0, 1]),
      g('h', [0]), g('h', [1]), g('x', [0]), g('x', [1]),
      g('cz', [0, 1]), g('x', [0]), g('x', [1]), g('h', [0]), g('h', [1]),
    ]),
    constraints: { qubits: 2 },
    compareBy: 'distribution',
    hints: [
      'Two stages: an oracle that marks the answer, then a diffuser that amplifies it.',
      'CZ marks |11⟩ with a phase flip.',
      'The diffuser is H, X on both, CZ, X on both, H — sandwiching the reflection.',
    ],
  },
  {
    id: 'ch-grover-01', title: 'Grover, different answer', concept: 'algorithms',
    brief: 'Mark |01⟩ instead of |11⟩ and find it with certainty. The diffuser stays the same — only the oracle changes.',
    starter: circuit(2, 'Grover 01', [g('h', [0]), g('h', [1])]),
    solution: circuit(2, 'sol', [
      g('h', [0]), g('h', [1]),
      g('x', [1]), g('cz', [0, 1]), g('x', [1]),
      g('h', [0]), g('h', [1]), g('x', [0]), g('x', [1]),
      g('cz', [0, 1]), g('x', [0]), g('x', [1]), g('h', [0]), g('h', [1]),
    ]),
    constraints: { qubits: 2 },
    compareBy: 'distribution',
    hints: [
      'CZ always marks |11⟩. To mark something else, temporarily turn it into |11⟩.',
      'Wrap the CZ in X gates on whichever qubits should be 0 in your target.',
      '|01⟩ has q1 = 0, so put an X on q1 either side of the CZ.',
    ],
  },
];

/**
 * The challenge set the app shows: the core ones above, then one behind each of the
 * algorithm lessons. Kept in a separate file because the two grow independently.
 */
export const CHALLENGES: Challenge[] = [...CORE_CHALLENGES, ...ALGORITHM_CHALLENGES];

// ---------------------------------------------------------------- quizzes

export type QuizItem =
  | {
      kind: 'mcq';
      id: string; concept: string; question: string;
      options: string[]; answer: number; explain: string;
    }
  | {
      kind: 'truefalse';
      id: string; concept: string; question: string;
      answer: boolean; explain: string;
    }
  | {
      /** Predict what the circuit produces. Marked against the real simulator output,
       *  so the answer key is computed rather than stored — it cannot go stale. */
      kind: 'predict';
      id: string; concept: string; question: string;
      circuit: Circuit;
      /** Which property of the output the learner is predicting. */
      ask: 'most-likely' | 'outcome-count' | 'certain';
      explain: string;
    };

export const QUIZZES: QuizItem[] = [
  // ---------------------------------------------------------------- Module 0 maths
  {
    kind: 'mcq', id: 'q-pre-i2', concept: 'maths-complex',
    question: 'What is i squared?',
    options: ['1', '−1', 'i', '0'],
    answer: 1,
    explain: 'i squared is −1. No ordinary number does that, which is exactly why i is a new kind of number rather than a rearrangement of the old ones.',
  },
  {
    kind: 'mcq', id: 'q-pre-polar', concept: 'maths-complex',
    question: 'In a quantum amplitude, what does the angle of the complex number carry?',
    options: ['The probability', 'The phase', 'The number of qubits', 'Nothing measurable or useful'],
    answer: 1,
    explain: 'The magnitude squared gives the probability; the angle is the phase. Phase is invisible to a single measurement but decides how paths interfere.',
  },
  {
    kind: 'truefalse', id: 'q-pre-basis', concept: 'maths-vectors',
    question: 'Ket zero and ket one are the only possible basis for a single qubit.',
    answer: false,
    explain: 'Other bases are equally valid — the plus and minus states form one. Which basis you measure in is a choice, and it changes what you can learn.',
  },
  {
    kind: 'mcq', id: 'q-pre-inner', concept: 'maths-vectors',
    question: 'Two states have an inner product of zero. What does that mean?',
    options: [
      'They are the same state',
      'They are orthogonal, so perfectly distinguishable',
      'One of them is invalid',
      'They are entangled',
    ],
    answer: 1,
    explain: 'An inner product of zero means orthogonal. A measurement designed to test for one will never accept the other.',
  },
  {
    kind: 'mcq', id: 'q-pre-unitary', concept: 'maths-matrices',
    question: 'Why must every quantum gate be unitary?',
    options: [
      'So it runs faster on hardware',
      'So it is reversible and keeps the probabilities totalling one',
      'So it can be written as a square grid',
      'So it commutes with every other gate',
    ],
    answer: 1,
    explain: 'Unitary is the mathematical statement of two physical facts: the evolution can be undone, and a valid state stays valid because the total probability is preserved.',
  },
  {
    kind: 'truefalse', id: 'q-pre-commute', concept: 'maths-matrices',
    question: 'Applying gate A then gate B always gives the same result as B then A.',
    answer: false,
    explain: 'Matrix multiplication does not commute in general, which is the same fact as gates giving different results in different orders. Try it in the builder.',
  },
  {
    kind: 'mcq', id: 'q-pre-born', concept: 'maths-probability',
    question: 'An amplitude is −0.707. What is the probability of that outcome?',
    options: ['−0.5', '0.5', '0.707', '0'],
    answer: 1,
    explain: 'Probability is the square of the magnitude, so the sign disappears: 0.707 squared is 0.5. That is why phase is invisible to a single measurement.',
  },
  {
    kind: 'truefalse', id: 'q-pre-cancel', concept: 'maths-probability',
    question: 'Two paths leading to the same outcome always make that outcome more likely.',
    answer: false,
    explain: 'True for classical probabilities, false for amplitudes. Amplitudes add before they are squared, so +0.5 and −0.5 cancel to nothing. Every quantum speed-up lives in that gap.',
  },
  {
    kind: 'mcq', id: 'q-pre-halfangle', concept: 'maths-trig',
    question: 'RY(π) turns a qubit by a half turn. Why does that flip ket zero all the way to ket one?',
    options: [
      'Because π radians is 180 degrees on the circle of amplitudes',
      'Because rotation gates use half the angle, so cos(π/2) = 0 and sin(π/2) = 1',
      'Because sine and cosine are equal at π',
      'It does not — it lands on the equator',
    ],
    answer: 1,
    explain: 'RY(θ) sends ket zero to cos(θ/2) ket zero plus sin(θ/2) ket one. At θ = π the halves give cos(π/2) = 0 and sin(π/2) = 1, which is exactly ket one.',
  },

  // qubit
  {
    kind: 'mcq', id: 'q-ket', concept: 'qubit',
    question: 'In a three-qubit register, which qubit does the rightmost digit of |101⟩ refer to?',
    options: ['Qubit 0', 'Qubit 1', 'Qubit 2', 'It depends on the simulator'],
    answer: 0,
    explain: 'Qubit 0 is the least significant bit and sits on the right. |101⟩ means q2=1, q1=0, q0=1. Qiskit uses the same convention, which is why our cross-check lines up.',
  },
  {
    kind: 'truefalse', id: 'q-xx', concept: 'qubit',
    question: 'Applying the X gate twice returns a qubit to its original state.',
    answer: true,
    explain: 'X is its own inverse. Two flips cancel — the optimiser in this platform removes exactly that pair.',
  },
  {
    kind: 'predict', id: 'q-pred-101', concept: 'qubit',
    question: 'This circuit puts an X on qubit 0 and qubit 2. What outcome will you measure?',
    circuit: circuit(3, 'predict', [g('x', [0]), g('x', [2])]),
    ask: 'certain',
    explain: 'X on q0 and q2 sets both to 1, and q1 stays 0. Written with q0 on the right, that is 101.',
  },

  // superposition
  {
    kind: 'mcq', id: 'q-h-prob', concept: 'superposition',
    question: 'A qubit is in the state 0.6|0⟩ + 0.8|1⟩. What is the probability of measuring 1?',
    options: ['0.8', '0.64', '0.5', '0.36'],
    answer: 1,
    explain: 'Probability is the amplitude squared: 0.8² = 0.64. The amplitudes must satisfy 0.6² + 0.8² = 1.',
  },
  {
    kind: 'truefalse', id: 'q-random', concept: 'superposition',
    question: 'A qubit in superposition is simply a random bit that we have not looked at yet.',
    answer: false,
    explain: 'If it were, applying a Hadamard twice would leave it random. It does not — two Hadamards return the qubit exactly to |0⟩. A random bit cannot be un-randomised; a rotation can be reversed.',
  },
  {
    kind: 'predict', id: 'q-pred-hhh', concept: 'superposition',
    question: 'Three qubits each get a Hadamard. How many different outcomes can you measure?',
    circuit: circuit(3, 'predict', [g('h', [0]), g('h', [1]), g('h', [2])]),
    ask: 'outcome-count',
    explain: 'Each Hadamard doubles the number of basis states with non-zero amplitude, so three give 2³ = 8, each at 12.5%.',
  },

  // bloch
  {
    kind: 'mcq', id: 'q-bloch-h', concept: 'bloch',
    question: 'Where on the Bloch sphere does H|0⟩ sit?',
    options: ['North pole', 'South pole', 'The +X point on the equator', 'The centre'],
    answer: 2,
    explain: 'A Hadamard rotates |0⟩ from the north pole down to +X on the equator: x = 1, y = 0, z = 0.',
  },
  {
    kind: 'truefalse', id: 'q-bloch-ent', concept: 'bloch',
    question: 'An entangled qubit still has a Bloch vector of length 1.',
    answer: false,
    explain: 'Its Bloch vector shrinks to zero. An entangled qubit has no state of its own — that empty sphere with a dot at the centre is the honest picture.',
  },

  // phase
  {
    kind: 'mcq', id: 'q-phase-z', concept: 'phase',
    question: 'You apply Z to the state |+⟩. What changes in the measurement outcomes?',
    options: ['0 becomes more likely', '1 becomes more likely', 'Nothing changes', 'Both become certain'],
    answer: 2,
    explain: 'Z flips the sign of the |1⟩ amplitude. Probability is the square of the magnitude, so the sign disappears and the outcomes stay 50/50. The state has genuinely changed, but not in a way one measurement can see.',
  },
  {
    kind: 'mcq', id: 'q-phase-tt', concept: 'phase',
    question: 'Two T gates in a row are equivalent to which single gate?',
    options: ['Z', 'S', 'H', 'The identity'],
    answer: 1,
    explain: 'T is an eighth turn about the vertical axis, S is a quarter turn, Z is a half turn. Two Ts make an S, and two Ss make a Z.',
  },
  {
    kind: 'predict', id: 'q-pred-hzh', concept: 'interference',
    question: 'H, then Z, then H, applied to |0⟩. What do you measure?',
    circuit: circuit(1, 'predict', [g('h', [0]), g('z', [0]), g('h', [0])]),
    ask: 'certain',
    explain: 'The Z is invisible in the middle, but it makes the |0⟩ paths cancel when the second Hadamard brings them back together. H-Z-H is exactly an X gate.',
  },

  // measurement
  {
    kind: 'truefalse', id: 'q-meas-one', concept: 'measurement',
    question: 'A single shot of a circuit is enough to tell you the quantum state it produced.',
    answer: false,
    explain: 'One shot gives one bitstring. You need many runs to see the distribution — and even then you never see the phases directly.',
  },
  {
    kind: 'mcq', id: 'q-meas-after', concept: 'measurement',
    question: 'What happens if you apply a Hadamard to a qubit after measuring it?',
    options: [
      'It goes back into superposition as normal',
      'It acts on a collapsed 0 or 1, not a superposition',
      'It is ignored by the simulator',
      'The measurement is undone',
    ],
    answer: 1,
    explain: 'Measurement collapses the qubit. Anything after it operates on a definite classical value — the tutor flags this because it is almost never what a learner intended.',
  },

  // entanglement
  {
    kind: 'mcq', id: 'q-ent-cnot', concept: 'entanglement',
    question: 'Why does a CNOT fail to create entanglement when its control is |0⟩?',
    options: [
      'CNOT never creates entanglement',
      'The control must be in superposition for the gate to do two things at once',
      'The target must be |1⟩ first',
      'Because |0⟩ has no phase',
    ],
    answer: 1,
    explain: 'Entanglement needs the CNOT to both flip and not flip the target. That only happens if the control is in a superposition of |0⟩ and |1⟩.',
  },
  {
    kind: 'predict', id: 'q-pred-bell', concept: 'entanglement',
    question: 'A Hadamard on qubit 0 followed by a CNOT onto qubit 1. How many outcomes appear?',
    circuit: circuit(2, 'predict', [g('h', [0]), g('cx', [0, 1])]),
    ask: 'outcome-count',
    explain: 'Only 00 and 11 — the two qubits always agree. |01⟩ and |10⟩ have zero amplitude, which is the signature of this Bell state.',
  },
  {
    kind: 'truefalse', id: 'q-ent-signal', concept: 'entanglement',
    question: 'Entanglement lets you send information faster than light.',
    answer: false,
    explain: 'The correlations are real, but each side sees only random outcomes until the two results are compared over an ordinary channel. Nothing is transmitted.',
  },

  // algorithms
  {
    kind: 'mcq', id: 'q-grover-speed', concept: 'algorithms',
    question: 'Grover’s algorithm searches N items in roughly how many steps?',
    options: ['log N', '√N', 'N/2', 'Constant time'],
    answer: 1,
    explain: 'A quadratic speed-up, not an exponential one. For a million items that is about a thousand steps instead of five hundred thousand.',
  },
  {
    kind: 'predict', id: 'q-pred-grover', concept: 'algorithms',
    question: 'One full Grover iteration marking |11⟩. What will you measure?',
    circuit: circuit(2, 'predict', [
      g('h', [0]), g('h', [1]), g('cz', [0, 1]),
      g('h', [0]), g('h', [1]), g('x', [0]), g('x', [1]),
      g('cz', [0, 1]), g('x', [0]), g('x', [1]), g('h', [0]), g('h', [1]),
    ]),
    ask: 'certain',
    explain: 'For two qubits a single iteration is exactly enough: the marked state reaches amplitude 1 and the other three cancel to zero.',
  },
  {
    kind: 'mcq', id: 'q-dj', concept: 'interference',
    question: 'Deutsch–Jozsa on a one-bit function needs how many queries to the oracle?',
    options: ['One', 'Two', 'Four', 'It depends on the function'],
    answer: 0,
    explain: 'One query, against two classically. The oracle is asked about both inputs simultaneously and interference extracts the answer.',
  },
];

import { ALGORITHM_LESSONS } from './algorithms';

/**
 * Everything the Learn page can show. The algorithm lessons live in their own file
 * because every circuit in them is asserted against the simulator by
 * tests/algorithms.test.ts.
 */
/**
 * Every lesson, prerequisites first.
 *
 * Module 0 leads because its whole purpose is to come before the quantum content;
 * a learner who meets superposition before vectors has been failed by the ordering,
 * not by the explanation.
 */
export const ALL_LESSONS: Lesson[] = [...PREREQUISITE_LESSONS, ...LESSONS, ...ALGORITHM_LESSONS];

export const QUIZ_BY_CONCEPT = (concept: string) => QUIZZES.filter(q => q.concept === concept);
export const CHALLENGE_BY_CONCEPT = (concept: string) => CHALLENGES.filter(c => c.concept === concept);
export const LESSON_BY_CONCEPT = (concept: string) => LESSONS.find(l => l.concept === concept);
