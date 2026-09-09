/**
 * Module 0 — the maths a beginner needs before any of the quantum content lands.
 *
 * Every quantum explanation in this app leans on four things: complex numbers, vectors,
 * matrices and probability. The rest of the curriculum was written assuming a learner
 * already had them, which is exactly the assumption that loses people in the first ten
 * minutes. This module stops assuming.
 *
 * Two rules held while writing it:
 *
 *   1. Nothing here is taught for its own sake. Every topic states which quantum topic
 *      needs it and why, so a learner is never doing algebra with no idea what it is for.
 *   2. Where a claim can be checked by the simulator, the lesson embeds the circuit that
 *      checks it. A maths lesson that asserts H takes ket zero to an even superposition
 *      shows the circuit doing it rather than asking to be believed.
 *
 * Sources are recorded in content-audit.md. Nothing here is novel mathematics — it is
 * standard first-year material, and the point is the ordering and the plain language,
 * not the content.
 */

import { newId, type Circuit, type GateName } from '../core/ir';
import type { Lesson } from './curriculum';

const g = (name: GateName, qubits: number[], params?: number[]) => ({
  id: newId(), name, qubits, ...(params ? { params } : {}),
});
const circuit = (qubits: number, name: string, ops: ReturnType<typeof g>[]): Circuit =>
  ({ version: 1, name, qubits, ops });

const PI = Math.PI;

export const PREREQUISITE_LESSONS: Lesson[] = [
  // ================================================================ complex numbers
  {
    id: 'pre-complex',
    concept: 'maths-complex',
    title: 'Complex numbers',
    minutes: 8,
    summary: 'The number line is not wide enough for quantum mechanics. Here is the extra direction.',
    steps: [
      {
        heading: 'A number with a direction',
        body:
          'Every number you have used so far lives on a line. You can go left or right, and that is all.\n\n' +
          'Complex numbers add a second direction, at right angles to the first. A complex number is written **a + bi**, where a is how far along the ordinary line you go and b is how far you go in the new direction. The letter i marks that second direction.\n\n' +
          'That is the whole idea. Not "imaginary" in the sense of made up — just a second axis, the way a map needs both north and east.',
      },
      {
        heading: 'The one rule that makes it work',
        body:
          '**i squared is −1.**\n\n' +
          'No ordinary number does that: positive times positive is positive, and negative times negative is also positive. So i is genuinely a new kind of number rather than a rearrangement of the old ones.\n\n' +
          'Everything else follows from that one rule plus ordinary algebra. To multiply two complex numbers you expand the brackets as usual and replace i squared with −1 wherever it appears.',
      },
      {
        heading: 'Length and angle: the polar form',
        body:
          'Because a complex number is a point on a plane, you can describe it two ways: by its coordinates, or by **how far it is from the origin and which way it points.**\n\n' +
          'The distance is called the magnitude, and for a + bi it is the square root of a squared plus b squared — the Pythagoras you already know. The direction is called the argument, and it is just an angle.\n\n' +
          'This second description is the one quantum mechanics uses constantly, because in a quantum state the magnitude decides a probability and the angle decides interference.',
      },
      {
        heading: 'Euler\'s formula, and why phases are written as exponentials',
        body:
          'A complex number of magnitude 1 sits somewhere on a circle of radius 1. Euler\'s formula says that point at angle θ can be written **e to the iθ**, which equals cos θ plus i sin θ.\n\n' +
          'You do not need to prove this to use it. What matters is what it buys: multiplying by e to the iθ **rotates** by θ. Two rotations in a row add their angles, which is why combining phases is addition rather than something messier.\n\n' +
          'This is why the Z gate is a half turn, S a quarter turn and T an eighth. They are all the same operation at different angles.',
      },
      {
        heading: 'Where you will need this',
        body:
          'Every amplitude in a quantum state is a complex number.\n\n' +
          '- Its **magnitude squared** is the probability of that outcome — you meet this as the Born rule\n' +
          '- Its **angle** is the phase — the thing measurement cannot see and interference depends on entirely\n\n' +
          'The circuit below puts a qubit in an even superposition and then turns its phase by a quarter turn with S. The probabilities do not move; the angle does. That is a complex number changing its argument while keeping its magnitude.',
        circuit: circuit(1, 'Turning a phase', [g('h', [0]), g('s', [0])]),
        watch: 'Both outcomes stay at 50%. The Bloch arrow swings from +X to +Y — same length, new direction.',
      },
    ],
  },

  // ================================================================ linear algebra
  {
    id: 'pre-vectors',
    concept: 'maths-vectors',
    title: 'Vectors and vector spaces',
    minutes: 8,
    summary: 'A quantum state is a list of numbers. This is what that list means and how to combine two of them.',
    steps: [
      {
        heading: 'A vector is an ordered list of numbers',
        body:
          'That is all a vector is. Two numbers describe a point on a plane; three describe a point in space; a hundred describe a point in a hundred-dimensional space that you cannot picture and do not need to.\n\n' +
          'Quantum states are vectors. A single qubit is a list of **two** complex numbers. Two qubits is a list of four. Ten qubits is a list of 1,024.\n\n' +
          'When this app shows you a state as 0.707 ket 00 plus 0.707 ket 11, that is a four-number list with two of the numbers set to zero.',
      },
      {
        heading: 'Adding vectors, and scaling them',
        body:
          'Two operations, both as simple as they look.\n\n' +
          '- **Add** two vectors by adding matching entries: the first to the first, the second to the second\n' +
          '- **Scale** a vector by multiplying every entry by the same number\n\n' +
          'Superposition is exactly these two operations. When a Hadamard turns ket zero into an even mixture of ket zero and ket one, it has scaled two vectors and added them.',
      },
      {
        heading: 'Basis: the directions everything is measured against',
        body:
          'A **basis** is a set of reference directions. On a map, north and east form a basis: any position can be written as so far north plus so far east.\n\n' +
          'For one qubit the standard basis is ket zero and ket one. Every possible state of that qubit is some amount of ket zero plus some amount of ket one.\n\n' +
          'Crucially, other bases exist and are equally valid. The plus and minus states form one.\n\n' +
          'Which basis you measure in is a choice, and it changes what you can learn. That is a quantum idea you will meet again. The underlying maths, though, is only ever choosing different reference directions.',
      },
      {
        heading: 'The inner product: how much two states overlap',
        body:
          'The inner product takes two vectors and returns a single number saying how much they have in common. You compute it by multiplying matching entries and adding the results, conjugating the first vector\'s entries as you go.\n\n' +
          'Two facts do all the work:\n\n' +
          '- If the inner product is **zero**, the states are orthogonal — perfectly distinguishable. Ket zero and ket one are orthogonal.\n' +
          '- Its **magnitude squared** is the probability that a test for one state accepts the other.\n\n' +
          'The grader in this app uses exactly this to decide whether your circuit matches the target.',
      },
      {
        heading: 'Where you will need this',
        body:
          'Superposition requires: vectors and adding them. Measurement requires: bases and the inner product.\n\n' +
          'The circuit below is the plainest possible example — one qubit, one Hadamard. Watch the state line: it shows a two-entry vector, and both entries are 0.707 because the state is an equal mix of the two basis directions.',
        circuit: circuit(1, 'A two-entry vector', [g('h', [0])]),
        watch: 'The state reads 0.707 ket 0 plus 0.707 ket 1 — a vector with two equal components.',
      },
    ],
  },

  // ================================================================ matrices
  {
    id: 'pre-matrices',
    concept: 'maths-matrices',
    title: 'Matrices and unitary operations',
    minutes: 9,
    summary: 'Every quantum gate is a matrix. Here is what one does, and why quantum gates are a special kind.',
    steps: [
      {
        heading: 'A matrix is a machine that moves vectors',
        body:
          'A matrix is a grid of numbers, but that is a description of how it is written rather than what it does.\n\n' +
          'What it **does** is take a vector in and give a different vector out. Feed it a point, get back another point. That is the whole job.\n\n' +
          'A quantum gate takes a state in and gives a state out. So a quantum gate is a matrix, and applying a gate is multiplying by one.',
      },
      {
        heading: 'How to multiply, and why the order matters',
        body:
          'To multiply a matrix by a vector, take each row of the matrix, multiply it entry-by-entry against the vector, and add up — that gives one entry of the answer.\n\n' +
          'The important part is not the arithmetic, it is this: **matrix multiplication does not commute.** A then B is generally not the same as B then A.\n\n' +
          'That is not a quirk of notation. It is the same fact as gates giving different results in different orders, which you can test yourself in the builder.',
      },
      {
        heading: 'The identity, and the inverse',
        body:
          'The **identity matrix** is the one that changes nothing — ones down the diagonal, zeros everywhere else. It is the matrix equivalent of multiplying by 1.\n\n' +
          'The **inverse** of a matrix undoes it. Apply a matrix and then its inverse and you are back exactly where you started, which is to say you get the identity.\n\n' +
          'Not every matrix has an inverse. Ones that squash information — that send two different inputs to the same output — cannot be undone.',
      },
      {
        heading: 'Unitary: the property every quantum gate must have',
        body:
          'A matrix is **unitary** when its inverse is its conjugate transpose — flip it over the diagonal, conjugate every entry, and you have something that undoes it.\n\n' +
          'This is not a technicality. It is the mathematical statement of two physical facts:\n\n' +
          '- **Quantum evolution is reversible.** Every gate can be undone, which is why quantum circuits have no delete.\n' +
          '- **Probabilities still add to one afterwards.** A unitary preserves the length of a vector, so a valid state stays a valid state no matter how long the circuit runs.\n\n' +
          'Measurement is the one operation that is not unitary — and it is exactly the one that is irreversible and destroys information.',
      },
      {
        heading: 'See it: a gate and its inverse',
        body:
          'S turns a quarter turn about the vertical axis. S dagger is its inverse and turns back.\n\n' +
          'The circuit applies a Hadamard, then S, then S dagger. If unitarity means what it claims, the two must cancel exactly and leave the plus state untouched.',
        circuit: circuit(1, 'S then S dagger', [g('h', [0]), g('s', [0]), g('sdg', [0])]),
        watch: 'Back on the +X axis: x = 1.00. Delete the S dagger and the arrow stops at +Y instead.',
      },
      {
        heading: 'Where you will need this',
        body:
          'Gates and circuits requires: matrix multiplication and the order rule. Reversibility requires: inverses and unitarity.\n\n' +
          'You will never be asked to multiply matrices by hand in this app — the simulator does that. What you need is to know what a gate **is**, so that "apply a gate" stops being a magic word.',
      },
    ],
  },

  // ================================================================ probability
  {
    id: 'pre-probability',
    concept: 'maths-probability',
    title: 'Probability, amplitudes and normalisation',
    minutes: 7,
    summary: 'Why quantum probabilities are squares of something else — and why that changes everything.',
    steps: [
      {
        heading: 'Ordinary probability, in one paragraph',
        body:
          'A probability is a number between 0 and 1 saying how likely something is. Zero means never, one means certainly.\n\n' +
          'For a set of outcomes where exactly one must happen, the probabilities **add up to 1**. A fair coin: one half and one half.\n\n' +
          'Classical probabilities can only ever pile up. Two ways of reaching the same outcome make it more likely, never less. Hold on to that sentence — it is the one quantum mechanics breaks.',
      },
      {
        heading: 'Amplitudes are not probabilities',
        body:
          'A quantum state does not store probabilities. It stores **amplitudes**, which are complex numbers, and the probability comes from squaring the magnitude.\n\n' +
          'An amplitude of 0.707 gives a probability of 0.5, because 0.707 squared is 0.5.\n\n' +
          'This is the **Born rule**, and it is the bridge between the maths and anything you can actually observe.',
      },
      {
        heading: 'Why the squaring matters so much',
        body:
          'Squaring throws away the sign. An amplitude of −0.707 gives the same 0.5 as +0.707.\n\n' +
          'So two states can be genuinely different and yet give identical measurement results. That difference is the phase, and it is invisible to any single measurement.\n\n' +
          'But amplitudes **add before they are squared.** If two paths lead to the same outcome carrying +0.5 and −0.5, they cancel to zero and that outcome never happens. Classical probabilities cannot do this. Every quantum speed-up lives in that gap.',
      },
      {
        heading: 'Normalisation: the total must stay at one',
        body:
          'The squared magnitudes of all the amplitudes must total exactly 1, because something has to happen when you measure.\n\n' +
          'Every quantum gate is unitary, which is precisely the property that keeps that total at 1 no matter how long the circuit runs.\n\n' +
          'If a simulator ever showed a total drifting from 1, that would be a bug rather than physics.',
        circuit: circuit(1, 'Squares that add to one', [g('ry', [0], [PI / 3])]),
        watch: 'Open the Table tab: the probability column is the amplitude column squared, and the two probabilities add to 1.00.',
      },
      {
        heading: 'Where you will need this',
        body:
          'Measurement requires: the Born rule and normalisation. Interference requires: knowing that amplitudes add before they are squared.\n\n' +
          'If you take one thing from this module, take this: **amplitudes can be negative, and probabilities cannot.** Almost everything surprising downstream is a consequence.',
      },
    ],
  },

  // ================================================================ trigonometry
  {
    id: 'pre-trig',
    concept: 'maths-trig',
    title: 'Angles and trigonometry (optional)',
    minutes: 6,
    summary: 'Optional refresher. Needed only for reading the Bloch sphere and rotation gates precisely.',
    steps: [
      {
        heading: 'Radians, not degrees',
        body:
          'Angles in quantum computing are written in **radians**. A full turn is 2π, a half turn is π, and a quarter turn is π over 2.\n\n' +
          'Radians measure an angle by the arc length it cuts on a circle of radius 1, which is why every formula comes out cleaner in them.\n\n' +
          'In practice: π over 2 is 90 degrees, π over 4 is 45. The sliders in this app show both, so you never have to convert in your head.',
      },
      {
        heading: 'Sine and cosine are coordinates on a circle',
        body:
          'Walk round a circle of radius 1 by an angle θ. **Cosine θ** is how far right you are; **sine θ** is how far up.\n\n' +
          'That is the whole definition. Everything else about them follows from going round a circle.\n\n' +
          'They show up in quantum mechanics because rotating a qubit is literally going round a sphere.',
      },
      {
        heading: 'Half angles, and why RY(π) flips a qubit',
        body:
          'Rotation gates use **half** the angle in their formulas. An RY rotation by θ sends ket zero to cos(θ/2) ket zero plus sin(θ/2) ket one.\n\n' +
          'That halving is why RY(π) — a half turn — gives cos(π/2) = 0 and sin(π/2) = 1, which is exactly ket one. A half turn on the sphere is a complete flip of the state.\n\n' +
          'It also explains why RY(π/2) lands you on the equator, in an even superposition: cos(π/4) and sin(π/4) are both 0.707.',
        circuit: circuit(1, 'RY of pi over 2', [g('ry', [0], [PI / 2])]),
        watch: 'Both amplitudes read 0.707, and the Bloch arrow sits on the equator. Change the angle and watch cos and sin move.',
      },
      {
        heading: 'Where you will need this',
        body:
          'The Bloch sphere requires: angles on a circle. Rotation gates require: the half-angle convention.\n\n' +
          'This topic is optional. You can read every other module without it — but the rotation sliders will make far more sense with it than without.',
      },
    ],
  },
];
