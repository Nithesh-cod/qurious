/**
 * Offline knowledge base.
 *
 * This is what the tutor knows with no network at all. It is bounded and the tutor says
 * so — an offline app cannot know everything, and pretending otherwise is how a demo
 * falls apart under questioning. Anything outside this base is answered by the language
 * model when one is configured, or honestly declined.
 *
 * Every body is written to be *spoken* as well as read: "ket zero" rather than "|0>",
 * no markdown, no symbols a text-to-speech voice would stumble over.
 *
 * Retrieval is a keyword and phrase scorer rather than embeddings, because it has to
 * run instantly on a mid-range phone with no model download.
 */

import { DERIVED_ENTRIES } from './knowledgeDerived';
import { EXTRA_ENTRIES } from './knowledgeExtra';

export type Category =
  | 'basics' | 'gates' | 'algorithms' | 'maths' | 'hardware'
  | 'errors' | 'applications' | 'india' | 'app' | 'study';

export const CATEGORY_LABEL: Record<Category, string> = {
  basics: 'Core concepts',
  gates: 'Gates',
  algorithms: 'Algorithms',
  maths: 'The mathematics',
  hardware: 'Real machines',
  errors: 'Noise and error correction',
  applications: 'What it is used for',
  india: 'India and careers',
  app: 'Using this app',
  study: 'How to learn it',
};

export interface Entry {
  id: string;
  category: Category;
  /** Concept id from the learning graph, when it maps to one. */
  concept?: string;
  title: string;
  /** Words that pull this entry up. Include the phrasings people actually type. */
  keys: string[];
  body: string;
  related?: string[];
  /**
   * True when the body is produced by running the circuit on the simulator rather than
   * being written by hand. See knowledgeDerived.ts. Reading it may run a simulation, so
   * nothing should touch it speculatively.
   */
  computed?: boolean;
}

/** The first batch of hand-written entries. The rest are in knowledgeExtra.ts. */
const BASE_ENTRIES: Entry[] = [
  // ================================================================ basics
  {
    id: 'qubit', category: 'basics', concept: 'qubit', title: 'What is a qubit?',
    keys: ['qubit', 'qbit', 'quantum bit', 'cubit'],
    body: 'A classical bit is either 0 or 1. A qubit is a direction in a two dimensional space, and the two reference directions are called ket 0 and ket 1. Because it is a direction rather than a value, it can point anywhere in between — that in-between is superposition. Every qubit in this app starts pointing straight up, at ket 0.',
    related: ['superposition', 'bloch'],
  },
  {
    id: 'superposition', category: 'basics', concept: 'superposition', title: 'What is superposition?',
    keys: ['superposition', 'super position', 'both at once', 'plus state'],
    body: 'Superposition means a qubit points somewhere between ket 0 and ket 1, so measuring it can give either answer. It is not simple randomness. If it were, applying a Hadamard twice would leave it random — but it does not, it returns the qubit exactly to ket 0. A coin flipped twice is still random; a qubit rotated twice is back where it started.',
    related: ['qubit', 'measurement', 'interference'],
  },
  {
    id: 'entanglement', category: 'basics', concept: 'entanglement', title: 'What is entanglement?',
    keys: ['entanglement', 'entangled', 'entangle', 'spooky action'],
    body: 'Two qubits are entangled when neither has a state of its own — only the pair does. In the Bell state the two qubits always agree when measured, but before measurement neither has decided anything. You can see it in this app: the Bloch arrow disappears and a dot appears at the centre of the sphere, because there is genuinely no single direction to draw for that qubit alone.',
    related: ['bell', 'cnot', 'bloch', 'bell-inequality'],
  },
  {
    id: 'measurement', category: 'basics', concept: 'measurement', title: 'What happens when you measure?',
    keys: ['measure', 'measurement', 'collapse', 'wave function collapse'],
    body: 'Measuring forces the qubit to one basis state and throws away the rest. The probability of each outcome is the square of the magnitude of its amplitude. Because squaring removes the sign, phase is invisible to a single measurement. A real quantum computer gives you one bitstring per run, so you run it thousands of times and look at the distribution.',
    related: ['born-rule', 'phase', 'shots'],
  },
  {
    id: 'born-rule', category: 'basics', title: 'What is the Born rule?',
    keys: ['born rule', 'probability from amplitude', 'square the amplitude', 'why squared'],
    body: 'The Born rule says the probability of an outcome is the square of the magnitude of its amplitude. An amplitude of 0.707 gives a probability of one half. It is why amplitudes must satisfy the sum of their squares equalling one, and why a negative amplitude gives the same probability as a positive one.',
    related: ['measurement', 'amplitude'],
  },
  {
    id: 'amplitude', category: 'basics', title: 'What is an amplitude?',
    keys: ['amplitude', 'complex amplitude', 'what are the numbers'],
    body: 'An amplitude is the complex number attached to each basis state. Its magnitude squared gives the probability of that outcome, and its angle carries the phase. Amplitudes are what actually evolve when you apply a gate; probabilities are only what you get when you look. Amplitudes can be negative or complex, which is exactly what lets them cancel.',
    related: ['born-rule', 'phase', 'interference'],
  },
  {
    id: 'phase', category: 'basics', concept: 'phase', title: 'What is phase?',
    keys: ['phase', 'relative phase', 'sign of amplitude'],
    body: 'Phase is the part of a quantum state that measurement cannot see directly. Apply a Z gate to the plus state and the probabilities do not change at all, but the state genuinely has — the ket 1 amplitude is now negative. Phase becomes visible the moment paths interfere. Hadamard, then Z, then Hadamard turns ket 0 into ket 1 with certainty.',
    related: ['interference', 'global-phase', 'measurement'],
  },
  {
    id: 'global-phase', category: 'basics', title: 'Global phase versus relative phase',
    keys: ['global phase', 'overall phase', 'phase difference', 'unobservable phase'],
    body: 'A global phase multiplies the whole state by the same factor and is completely unobservable — two states differing only by one are physically identical. That is why this app ignores global phase when grading. Relative phase is the difference between the amplitudes inside a superposition, and that one matters enormously, because it decides how the paths interfere.',
    related: ['phase', 'how-graded'],
  },
  {
    id: 'interference', category: 'basics', concept: 'interference', title: 'What is quantum interference?',
    keys: ['interference', 'cancel', 'cancellation', 'why is quantum faster'],
    body: 'Amplitudes can be negative; probabilities cannot. If two paths lead to the same outcome with amplitudes plus one half and minus one half, they add to zero and that outcome never happens. Classical probabilities can only pile up. Every quantum speed-up comes from arranging for wrong answers to cancel and right answers to reinforce.',
    related: ['grover', 'phase', 'amplitude'],
  },
  {
    id: 'bloch', category: 'basics', concept: 'bloch', title: 'What is the Bloch sphere?',
    keys: ['bloch', 'bloch sphere', 'sphere', 'why is the arrow gone'],
    body: 'The Bloch sphere draws one qubit as a point on a ball. North is ket 0, south is ket 1, and the equator holds the even superpositions. Every single qubit gate is a rotation of that ball. It works perfectly for one qubit and not at all for entangled qubits — when a qubit becomes entangled its arrow shrinks to the centre, which is the picture telling you the truth.',
    related: ['qubit', 'entanglement', 'rotations'],
  },
  {
    id: 'no-cloning', category: 'basics', title: 'Why can you not copy a qubit?',
    keys: ['no cloning', 'copy a qubit', 'clone', 'duplicate qubit'],
    body: 'The no-cloning theorem says there is no operation that copies an arbitrary unknown quantum state. It follows from gates being linear. This is why you cannot back up a quantum computation the way you copy a file, why quantum error correction had to be invented from scratch, and why quantum key distribution is secure — an eavesdropper cannot copy the qubits without disturbing them.',
    related: ['error-correction', 'qkd', 'teleport'],
  },
  {
    id: 'reversible', category: 'basics', title: 'Why are quantum gates reversible?',
    keys: ['reversible', 'undo a gate', 'unitary', 'why reversible'],
    body: 'Every quantum gate is a unitary operation, which means it always has an inverse. Run the inverse and you are exactly back where you started. Measurement is the one exception — it is irreversible and destroys information. This is why quantum circuits have no delete and no overwrite, and why classical logic has to be rebuilt in reversible form using gates like Toffoli.',
    related: ['unitary', 'toffoli', 'measurement'],
  },
  {
    id: 'shots', category: 'basics', title: 'What are shots?',
    keys: ['shots', 'how many runs', 'sampling', 'repeat the circuit', 'statistics'],
    body: 'A shot is one run of the circuit, giving one bitstring. Because a single shot tells you almost nothing about a superposition, you run the circuit many times and build a histogram. More shots give a smoother estimate; the error shrinks roughly with the square root of the number of shots. In this app you can drag the shots slider and watch the noise settle.',
    related: ['measurement', 'born-rule'],
  },
  {
    id: 'basis', category: 'basics', title: 'What is a basis state?',
    keys: ['basis state', 'computational basis', 'ket notation', 'what does ket mean'],
    body: 'A basis state is one of the definite outcomes you can measure — ket 0, ket 1, and for several qubits things like ket 101. The angle bracket notation is called a ket, and it is just a label. Any state of the register is a weighted combination of basis states, and those weights are the amplitudes.',
    related: ['qubit', 'little-endian', 'amplitude'],
  },
  {
    id: 'little-endian', category: 'basics', title: 'Which qubit is which in the bitstring?',
    keys: ['bit order', 'endian', 'which qubit', 'reading outcome', 'rightmost'],
    body: 'Qubit zero is the rightmost digit. So ket 101 means qubit two is one, qubit one is zero, and qubit zero is one. This matches Qiskit, which is why our cross-check against Qiskit lines up exactly. Getting this backwards is the single most common source of confusion when moving between tools.',
    related: ['basis', 'how-graded'],
  },
  {
    id: 'decoherence', category: 'basics', title: 'What is decoherence?',
    keys: ['decoherence', 'lose coherence', 'why do qubits fail', 'coherence time'],
    body: 'Decoherence is a qubit leaking its quantum information into its surroundings. Any stray interaction — heat, vibration, a passing photon — effectively measures the qubit and destroys the superposition. It is the central engineering problem of quantum computing, and it is why real machines run cold, isolated, and only for microseconds at a time.',
    related: ['t1-t2', 'nisq', 'error-correction'],
  },
  {
    id: 'mixed-state', category: 'basics', title: 'Pure states and mixed states',
    keys: ['mixed state', 'pure state', 'density matrix', 'statistical mixture'],
    body: 'A pure state is one you can write as a single vector — the app simulates only these. A mixed state is a statistical mixture, which is what you get when a qubit is entangled with something you are not tracking, or when noise has crept in. Mixed states need a density matrix rather than a vector. A qubit inside a Bell pair, looked at alone, is maximally mixed — which is why its Bloch arrow has zero length.',
    related: ['entanglement', 'bloch', 'decoherence'],
  },
  {
    id: 'bell-inequality', category: 'basics', title: 'What is Bell’s inequality?',
    keys: ['bell inequality', 'chsh', 'local realism', 'einstein wrong', 'hidden variables'],
    body: 'Bell showed that any theory where particles carry pre-decided answers and nothing travels faster than light must obey a certain limit on how strongly measurements can correlate. Entangled quantum states break that limit, and experiments have confirmed it repeatedly. It means the correlations in a Bell state are not explained by hidden instructions written in advance — nature really is not locally realistic.',
    related: ['entanglement', 'faster-than-light'],
  },
  {
    id: 'faster-than-light', category: 'basics', title: 'Does entanglement send information faster than light?',
    keys: ['faster than light', 'ftl', 'instant communication', 'spooky'],
    body: 'No. Each side of an entangled pair sees only random outcomes. The correlation is only visible once the two results are compared, and that comparison travels over an ordinary channel at ordinary speed. Nothing is transmitted by the measurement itself. This is called the no-signalling principle.',
    related: ['entanglement', 'bell-inequality', 'teleport'],
  },
  {
    id: 'observer', category: 'basics', title: 'Does a conscious observer cause collapse?',
    keys: ['observer effect', 'consciousness', 'who is watching', 'observer'],
    body: 'No. Measurement means any interaction that leaks which-path information into the environment — a detector, a stray air molecule, a photon bouncing off. Consciousness plays no role in the mathematics. The word observer is a historical accident of terminology and it has confused people for a century.',
    related: ['measurement', 'decoherence'],
  },

  // ================================================================ gates
  {
    id: 'gate', category: 'gates', title: 'What is a quantum gate?',
    keys: ['quantum gate', 'what is a gate', 'gates do what'],
    body: 'A quantum gate is a rotation applied to one or more qubits. It is not a lookup table like a classical logic gate — it is a reversible transformation described by a unitary matrix. Single qubit gates rotate a point on the Bloch sphere; multi qubit gates can create entanglement between them.',
    related: ['unitary', 'bloch', 'reversible'],
  },
  {
    id: 'hadamard', category: 'gates', title: 'What does the Hadamard gate do?',
    keys: ['hadamard', 'h gate'],
    body: 'The Hadamard turns a definite state into an even superposition. It takes ket 0 to the plus state, which is half ket 0 and half ket 1, and it moves the Bloch arrow from the north pole to the equator. It is its own inverse, so two Hadamards in a row do nothing. Almost every quantum algorithm starts with one.',
    related: ['superposition', 'plus-minus'],
  },
  {
    id: 'pauli', category: 'gates', title: 'What are the X, Y and Z gates?',
    keys: ['x gate', 'y gate', 'z gate', 'pauli', 'bit flip', 'phase flip', 'not gate'],
    body: 'X is the bit flip, the quantum NOT — it swaps ket 0 and ket 1. Z is the phase flip — it leaves ket 0 alone and negates ket 1. Y does both at once. On the Bloch sphere each is a half turn about its own axis, and each is its own inverse.',
    related: ['pauli-matrices', 'phase'],
  },
  {
    id: 'st-gates', category: 'gates', title: 'What are the S and T gates?',
    keys: ['s gate', 't gate', 'sdg', 'tdg', 'dagger', 'quarter turn'],
    body: 'S and T are smaller phase rotations about the vertical axis. Z is a half turn, S is a quarter turn, T is an eighth. Two T gates make an S, and two S gates make a Z. The dagger versions turn the other way. They change nothing you can measure on their own, but they set up the interference that algorithms depend on.',
    related: ['phase', 't-gate-cost'],
  },
  {
    id: 'rotations', category: 'gates', title: 'What are RX, RY and RZ?',
    keys: ['rx', 'ry', 'rz', 'rotation gate', 'angle', 'theta'],
    body: 'They rotate the qubit by any angle you choose about the X, Y or Z axis. Select one on the canvas and drag the angle slider — you will see the Bloch arrow sweep continuously and the measurement probabilities follow it. This is the clearest demonstration that a quantum gate is a rotation, not a lookup table.',
    related: ['bloch', 'gate'],
  },
  {
    id: 'phase-gate', category: 'gates', title: 'What is the P or phase gate?',
    keys: ['p gate', 'phase gate', 'u1', 'lambda'],
    body: 'The P gate adds a chosen phase to the ket 1 amplitude and leaves ket 0 alone. Z, S and T are all special cases of it, with phases of pi, pi over two, and pi over four. It is the general tool for writing an arbitrary phase into part of a superposition, which is what oracles do.',
    related: ['st-gates', 'phase', 'oracle'],
  },
  {
    id: 'cnot', category: 'gates', title: 'What does the CNOT gate do?',
    keys: ['cnot', 'cx', 'controlled not', 'control target', 'how to entangle'],
    body: 'CNOT flips the target qubit when the control is ket 1, and does nothing when the control is ket 0. On its own that is ordinary classical logic. It only creates entanglement when the control is already in a superposition — then it both flips and does not flip the target at the same time. That is why a Hadamard almost always comes before a CNOT.',
    related: ['entanglement', 'bell', 'controlled-gates'],
  },
  {
    id: 'controlled-gates', category: 'gates', title: 'What is a controlled gate?',
    keys: ['controlled gate', 'control qubit', 'cz', 'cy', 'controlled u'],
    body: 'A controlled gate applies its operation only when the control qubit is ket 1. CZ adds a minus sign only when both qubits are ket 1, and unlike CNOT it is symmetric — swapping control and target changes nothing. Any single qubit gate can be given a control this way, and controls are how one qubit influences another.',
    related: ['cnot', 'toffoli'],
  },
  {
    id: 'swap', category: 'gates', title: 'What does the SWAP gate do?',
    keys: ['swap', 'exchange qubits', 'swap gate'],
    body: 'SWAP exchanges the states of two qubits. It can be built from three CNOTs alternating direction, which is a nice puzzle and also matters in practice — on real hardware where qubits are not all connected, chains of swaps are how information is moved across the chip.',
    related: ['connectivity', 'cnot'],
  },
  {
    id: 'toffoli', category: 'gates', title: 'What is the Toffoli gate?',
    keys: ['toffoli', 'ccx', 'ccnot', 'fredkin', 'cswap'],
    body: 'Toffoli flips its target only when both control qubits are ket 1 — a controlled controlled NOT. Fredkin swaps two qubits only when a control is ket 1. Both are reversible versions of classical logic, and Toffoli alone is enough to build any classical circuit, which is how quantum computers can do everything a classical one can.',
    related: ['reversible', 'universal-gates'],
  },
  {
    id: 'universal-gates', category: 'gates', title: 'What is a universal gate set?',
    keys: ['universal gate set', 'universal', 'clifford t', 'which gates are enough'],
    body: 'A universal set is a handful of gates that can approximate any quantum operation to any accuracy. Hadamard, T and CNOT is one such set. Clifford gates alone — Hadamard, S and CNOT — are not universal and can in fact be simulated efficiently on a classical computer. The T gate is what pushes you past that, and it is also the expensive one to make fault tolerant.',
    related: ['t-gate-cost', 'toffoli'],
  },
  {
    id: 't-gate-cost', category: 'gates', title: 'Why is the T gate expensive?',
    keys: ['t gate cost', 't count', 'magic state', 'why is t hard'],
    body: 'In a fault tolerant machine, Clifford gates are comparatively cheap but T gates are not — they need a process called magic state distillation, which consumes many physical qubits. That is why researchers count T gates when they estimate whether an algorithm is practical. Reducing T count is a whole subfield.',
    related: ['universal-gates', 'error-correction'],
  },
  {
    id: 'identity-gate', category: 'gates', title: 'What is the identity gate?',
    keys: ['identity gate', 'i gate', 'does nothing'],
    body: 'The identity gate does nothing at all. It is useful as a placeholder, for keeping circuit diagrams aligned, and for characterising hardware — running a long chain of identity gates and seeing how fast the state decays is a standard way to measure coherence time.',
    related: ['t1-t2'],
  },
  {
    id: 'barrier', category: 'gates', title: 'What is a barrier?',
    keys: ['barrier', 'divider', 'what does barrier do'],
    body: 'A barrier is a visual and structural divider with no effect on the quantum state. It stops the compiler from optimising across it, which is useful when you want to keep two parts of a circuit distinct, and it makes diagrams easier to read.',
    related: ['optimiser'],
  },
  {
    id: 'plus-minus', category: 'gates', title: 'What are the plus and minus states?',
    keys: ['plus state', 'minus state', 'ket plus', 'x basis'],
    body: 'The plus state is an even superposition with both amplitudes positive; the minus state has a negative sign on ket 1. They sit at opposite ends of the X axis of the Bloch sphere. Measured in the usual basis they look identical — fifty fifty — but a Hadamard separates them perfectly, sending plus to ket 0 and minus to ket 1.',
    related: ['hadamard', 'phase'],
  },

  // ================================================================ algorithms
  {
    id: 'bell', category: 'algorithms', title: 'How do I build a Bell state?',
    keys: ['bell', 'bell pair', 'bell state', 'entangle two qubits'],
    body: 'Two gates. Put a Hadamard on qubit zero, then a CNOT from qubit zero to qubit one. The result is 0.707 ket 00 plus 0.707 ket 11 — the two qubits always agree. Notice what is missing: ket 01 and ket 10 never appear.',
    related: ['entanglement', 'cnot', 'ghz'],
  },
  {
    id: 'ghz', category: 'algorithms', title: 'What is a GHZ state?',
    keys: ['ghz', 'greenberger', 'three qubit entangled', 'w state'],
    body: 'A GHZ state entangles three or more qubits so they all agree — 0.707 ket 000 plus 0.707 ket 111. Build it with one Hadamard and a CNOT from that qubit to every other. The related W state spreads a single excitation across the qubits instead, and the two behave very differently when you lose one qubit: the GHZ collapses completely, the W survives.',
    related: ['bell', 'entanglement'],
  },
  {
    id: 'grover', category: 'algorithms', concept: 'algorithms', title: 'How does Grover search work?',
    keys: ['grover', 'search algorithm', 'diffuser', 'amplitude amplification'],
    body: 'Grover has two stages that repeat. The oracle flips the sign of the answer you are looking for, which changes nothing you can measure because it lives in the phase. Then the diffuser reflects every amplitude about their average, which shrinks the unmarked ones and grows the marked one. On two qubits a single round is enough. It gives a square root speed-up.',
    related: ['oracle', 'diffuser', 'interference'],
  },
  {
    id: 'diffuser', category: 'algorithms', title: 'What is the Grover diffuser?',
    keys: ['diffuser', 'inversion about the mean', 'amplitude amplification'],
    body: 'The diffuser reflects every amplitude about their average value. Because the oracle made the marked amplitude negative, it sits far below the average, and reflecting it sends it far above. The unmarked ones barely move down. Repeat and the marked amplitude grows until it dominates. Too many repeats and it overshoots and starts shrinking again.',
    related: ['grover', 'oracle'],
  },
  {
    id: 'oracle', category: 'algorithms', title: 'What is an oracle?',
    keys: ['oracle', 'black box', 'marking function', 'phase kickback'],
    body: 'An oracle is a circuit that recognises the answer without telling you what it is — it flips the phase of the states you are looking for. It is a black box in the analysis, but in a real program you have to build it out of gates, and that construction is usually the hard part of implementing an algorithm.',
    related: ['grover', 'phase-kickback', 'deutsch'],
  },
  {
    id: 'phase-kickback', category: 'algorithms', title: 'What is phase kickback?',
    keys: ['phase kickback', 'kickback', 'ancilla minus state'],
    body: 'Phase kickback is the trick that makes oracles work. If you put an ancilla qubit in the minus state and apply a controlled operation, the phase that should have landed on the ancilla appears on the control instead. It turns a function that computes a bit into a function that writes into the phase, which is where interference can reach it.',
    related: ['oracle', 'deutsch', 'phase'],
  },
  {
    id: 'deutsch', category: 'algorithms', concept: 'interference', title: 'What is the Deutsch–Jozsa algorithm?',
    keys: ['deutsch', 'jozsa', 'constant or balanced', 'one query'],
    body: 'You are given a function and told it is either constant, giving the same output for every input, or balanced, giving each output equally often. Classically you must test more than half the inputs. Deutsch–Jozsa answers it with one query, by asking about every input at once in superposition and then interfering the results so the answer appears in a single measurement.',
    related: ['interference', 'oracle', 'bernstein'],
  },
  {
    id: 'bernstein', category: 'algorithms', title: 'What is the Bernstein–Vazirani algorithm?',
    keys: ['bernstein', 'vazirani', 'find hidden string'],
    body: 'A hidden binary string is inside an oracle, and you can only ask for its dot product with inputs you choose. Classically you need one query per bit. Bernstein–Vazirani recovers the whole string in a single query, using Hadamards either side of the oracle so that every bit is written into a phase and read out at once.',
    related: ['deutsch', 'phase-kickback'],
  },
  {
    id: 'simon', category: 'algorithms', title: 'What is Simon’s algorithm?',
    keys: ['simon', 'simons algorithm', 'hidden period', 'exponential speedup'],
    body: 'Simon’s problem asks you to find a hidden repeating pattern in a function. It was the first problem shown to have an exponential separation between quantum and classical query complexity, and its structure directly inspired Shor’s algorithm. It matters historically far more than practically.',
    related: ['shor', 'qft'],
  },
  {
    id: 'shor', category: 'algorithms', title: 'What is Shor’s algorithm?',
    keys: ['shor', 'factoring', 'rsa', 'break encryption', 'period finding'],
    body: 'Shor factors large numbers in polynomial time, which classically is believed to be hard, and that is why it threatens RSA encryption. It works by turning factoring into a period finding problem and using the quantum Fourier transform to read the period out. It needs far more qubits and far lower error rates than machines available today.',
    related: ['qft', 'rsa-threat', 'post-quantum'],
  },
  {
    id: 'qft', category: 'algorithms', title: 'What is the quantum Fourier transform?',
    keys: ['qft', 'fourier transform', 'quantum fourier'],
    body: 'The quantum Fourier transform is the quantum version of the discrete Fourier transform, and it is the engine inside Shor’s algorithm and phase estimation. It converts amplitudes encoding a period into amplitudes concentrated on the frequency, so a measurement reveals it. It runs in a number of gates that grows only with the square of the qubit count.',
    related: ['shor', 'phase-estimation'],
  },
  {
    id: 'phase-estimation', category: 'algorithms', title: 'What is quantum phase estimation?',
    keys: ['phase estimation', 'qpe', 'eigenvalue'],
    body: 'Phase estimation finds the eigenvalue of a unitary operator given its eigenstate. It is one of the most reused subroutines in the field — Shor’s algorithm, chemistry simulation and the HHL linear solver all sit on top of it. It works by writing the phase into an ancilla register using controlled operations, then reading it with an inverse Fourier transform.',
    related: ['qft', 'shor', 'chemistry'],
  },
  {
    id: 'teleport', category: 'algorithms', title: 'What is quantum teleportation?',
    keys: ['teleport', 'teleportation', 'send a qubit'],
    body: 'Quantum teleportation moves a qubit state from one place to another using a shared entangled pair and two classical bits. Nothing travels faster than light, because the classical bits have to be sent normally before the receiver can reconstruct the state. It teleports the state, not matter, and the original is destroyed in the process — which is consistent with no-cloning.',
    related: ['entanglement', 'no-cloning', 'faster-than-light'],
  },
  {
    id: 'superdense', category: 'algorithms', title: 'What is superdense coding?',
    keys: ['superdense', 'dense coding', 'two bits one qubit'],
    body: 'Superdense coding sends two classical bits by physically transmitting one qubit, provided the sender and receiver already share an entangled pair. The sender applies one of four operations to their half, and the receiver undoes the entanglement to read both bits. It is teleportation run in the opposite direction, trading the same resources the other way.',
    related: ['teleport', 'entanglement', 'bell'],
  },
  {
    id: 'vqe', category: 'algorithms', title: 'What is VQE?',
    keys: ['vqe', 'variational', 'variational quantum eigensolver', 'hybrid algorithm'],
    body: 'The variational quantum eigensolver finds the lowest energy state of a molecule using a short parameterised circuit on the quantum machine and a classical optimiser adjusting the parameters. Because the circuits are shallow it tolerates noise, which is why it is one of the few algorithms considered realistic on today’s hardware.',
    related: ['qaoa', 'chemistry', 'nisq'],
  },
  {
    id: 'qaoa', category: 'algorithms', title: 'What is QAOA?',
    keys: ['qaoa', 'approximate optimization', 'combinatorial optimisation'],
    body: 'The quantum approximate optimisation algorithm attacks combinatorial problems like max-cut by alternating two kinds of layer and tuning their angles with a classical optimiser. Like VQE it is hybrid and shallow. Whether it actually beats good classical heuristics on useful problem sizes is still an open question, and worth saying honestly.',
    related: ['vqe', 'optimisation', 'nisq'],
  },
  {
    id: 'hhl', category: 'algorithms', title: 'What is the HHL algorithm?',
    keys: ['hhl', 'linear systems', 'solve equations'],
    body: 'HHL solves systems of linear equations with an exponential speed-up in the size of the system, under strict conditions. The catch is severe: you cannot read out the whole solution vector, only certain summary properties, and loading the input efficiently is its own unsolved problem. It is often quoted without those caveats, which is misleading.',
    related: ['phase-estimation', 'qml'],
  },

  // ================================================================ maths
  {
    id: 'pauli-matrices', category: 'maths', title: 'What are the Pauli matrices?',
    keys: ['pauli matrices', 'sigma x', 'sigma y', 'sigma z', 'matrices'],
    body: 'The Pauli matrices are the two by two matrices for the X, Y and Z gates. Together with the identity they form a basis for every two by two operator, so any single qubit operation can be written as a combination of them. They are also the axes of the Bloch sphere, which is why the gates are rotations about them.',
    related: ['pauli', 'bloch', 'unitary'],
  },
  {
    id: 'unitary', category: 'maths', title: 'What does unitary mean?',
    keys: ['unitary', 'unitary matrix', 'preserves norm'],
    body: 'A unitary matrix is one whose inverse equals its conjugate transpose. That property means it preserves total probability — the amplitudes still square-sum to one after you apply it. Every quantum gate must be unitary, which is exactly why every gate is reversible and why you cannot build a quantum gate that deletes information.',
    related: ['reversible', 'hermitian', 'gate'],
  },
  {
    id: 'hermitian', category: 'maths', title: 'What does Hermitian mean?',
    keys: ['hermitian', 'observable', 'self adjoint'],
    body: 'A Hermitian matrix equals its own conjugate transpose. Observables — the physical quantities you can measure — are represented by Hermitian operators, because that guarantees their eigenvalues are real numbers, and a measurement result has to be a real number. Unitary matrices describe evolution; Hermitian ones describe measurement.',
    related: ['unitary', 'measurement', 'eigenvalue'],
  },
  {
    id: 'eigenvalue', category: 'maths', title: 'What are eigenvalues and eigenstates?',
    keys: ['eigenvalue', 'eigenstate', 'eigenvector'],
    body: 'An eigenstate of an operator is a state the operator leaves pointing in the same direction, only scaled. The scale factor is the eigenvalue. Measurement outcomes are eigenvalues of the observable, and the state collapses to the matching eigenstate. Ket 0 and ket 1 are the eigenstates of Z, which is why measuring in the usual basis is called measuring Z.',
    related: ['hermitian', 'measurement', 'phase-estimation'],
  },
  {
    id: 'tensor', category: 'maths', title: 'What is the tensor product?',
    keys: ['tensor product', 'kronecker', 'combine qubits', 'why 2^n'],
    body: 'The tensor product is how you combine the state spaces of separate qubits. Two qubits with two dimensions each give four dimensions, not four states in the classical sense. It is the reason n qubits carry 2 to the n amplitudes, and the reason simulating them costs exponentially more memory with each qubit added.',
    related: ['hilbert', 'why-12'],
  },
  {
    id: 'hilbert', category: 'maths', title: 'What is Hilbert space?',
    keys: ['hilbert space', 'state space', 'vector space'],
    body: 'Hilbert space is the vector space quantum states live in — complex valued, with an inner product that lets you talk about angles and lengths. For n qubits it has 2 to the n dimensions. The name sounds intimidating but for a beginner it just means: states are vectors, gates are matrices, and the inner product tells you how similar two states are.',
    related: ['tensor', 'fidelity'],
  },
  {
    id: 'fidelity', category: 'maths', title: 'What is fidelity?',
    keys: ['fidelity', 'how close are two states', 'overlap'],
    body: 'Fidelity measures how close two quantum states are, running from zero for perfectly distinguishable to one for identical. It is computed from the overlap between them. This app grades challenges on fidelity with the target state, ignoring global phase, which is why a different but correct circuit still passes.',
    related: ['how-graded', 'global-phase'],
  },
  {
    id: 'complex', category: 'maths', title: 'Why are the numbers complex?',
    keys: ['complex numbers', 'imaginary', 'why i', 'why complex'],
    body: 'Amplitudes are complex because they need to carry both a size and an angle. The size gives probability; the angle gives phase, and phase is what makes interference possible. If amplitudes were only real and positive you would have ordinary probability theory and no quantum advantage at all.',
    related: ['amplitude', 'phase', 'interference'],
  },
  {
    id: 'entropy', category: 'maths', title: 'What is entanglement entropy?',
    keys: ['entropy', 'von neumann entropy', 'measure entanglement'],
    body: 'Entanglement entropy quantifies how entangled a subsystem is with the rest. It is zero for a qubit in a state of its own, and maximal for one half of a Bell pair. It is the formal version of what the Bloch arrow shows you visually in this app: as entanglement rises, the individual qubit’s own state becomes less and less definite.',
    related: ['entanglement', 'mixed-state', 'bloch'],
  },

  // ================================================================ hardware
  {
    id: 'hardware-types', category: 'hardware', title: 'What kinds of quantum computers exist?',
    keys: ['types of quantum computer', 'hardware', 'superconducting', 'trapped ion', 'photonic'],
    body: 'Superconducting circuits, used by IBM and Google, are fast but need dilution refrigerators near absolute zero. Trapped ions, used by IonQ and Quantinuum, are slower but more accurate and better connected. Photonic, neutral atom and topological approaches are all being pursued too. No approach has clearly won, and that is a genuine open question, not marketing.',
    related: ['superconducting', 'trapped-ion', 'nisq'],
  },
  {
    id: 'superconducting', category: 'hardware', title: 'How do superconducting qubits work?',
    keys: ['superconducting', 'transmon', 'josephson', 'dilution refrigerator'],
    body: 'A superconducting qubit is a tiny circuit containing a Josephson junction, cooled to around ten millikelvin — colder than deep space. Its two lowest energy levels act as ket 0 and ket 1, and microwave pulses drive the gates. They are fast, with gates in tens of nanoseconds, but coherence times are short and the refrigeration is enormous.',
    related: ['hardware-types', 't1-t2'],
  },
  {
    id: 'trapped-ion', category: 'hardware', title: 'How do trapped ion qubits work?',
    keys: ['trapped ion', 'ion trap', 'ionq', 'laser qubit'],
    body: 'Trapped ion machines hold individual charged atoms in electromagnetic fields and manipulate them with lasers. Because every ion is identical by nature, they are extremely uniform, they hold coherence for seconds rather than microseconds, and any ion can interact with any other. The trade-off is gate speed — they are far slower than superconducting circuits.',
    related: ['hardware-types', 'connectivity'],
  },
  {
    id: 'annealing', category: 'hardware', title: 'What is quantum annealing?',
    keys: ['annealing', 'd-wave', 'dwave', 'adiabatic'],
    body: 'Quantum annealing, which D-Wave builds, is a different model aimed only at optimisation problems. It is not a universal gate-based quantum computer and cannot run Shor’s algorithm. Whether it offers a genuine speed-up over good classical optimisers remains contested. It is worth knowing the distinction, because the two are often confused in news coverage.',
    related: ['hardware-types', 'optimisation'],
  },
  {
    id: 'nisq', category: 'hardware', title: 'What does NISQ mean?',
    keys: ['nisq', 'noisy intermediate scale', 'current era'],
    body: 'NISQ stands for noisy intermediate scale quantum — the era we are in now. Machines have tens to hundreds of qubits, too many to simulate classically with ease but far too few and too noisy for error correction. NISQ algorithms like VQE and QAOA are designed to be shallow enough to finish before noise ruins them.',
    related: ['vqe', 'qaoa', 'decoherence', 'error-correction'],
  },
  {
    id: 't1-t2', category: 'hardware', title: 'What are T1 and T2?',
    keys: ['t1', 't2', 'coherence time', 'relaxation', 'dephasing'],
    body: 'T1 is the relaxation time — how long before a qubit in ket 1 decays to ket 0. T2 is the dephasing time — how long the relative phase survives. T2 is usually the shorter and more limiting of the two. Together they set how many gates you can run before the state is meaningless, which is the real constraint on circuit depth.',
    related: ['decoherence', 'depth'],
  },
  {
    id: 'connectivity', category: 'hardware', title: 'Why can qubits not all talk to each other?',
    keys: ['connectivity', 'topology', 'coupling map', 'why swap'],
    body: 'On most hardware each qubit is physically wired only to its neighbours. If your algorithm needs a gate between two distant qubits, the compiler inserts chains of SWAP gates to move the state across the chip. Those extra gates add noise, so circuit layout is a real optimisation problem. Trapped ion machines largely avoid this by being all-to-all connected.',
    related: ['swap', 'transpiler', 'trapped-ion'],
  },
  {
    id: 'transpiler', category: 'hardware', title: 'What does the transpiler do?',
    keys: ['transpiler', 'transpile', 'compile circuit', 'native gates', 'basis gates'],
    body: 'The transpiler rewrites your circuit into something the hardware can actually run. It decomposes gates into the machine’s native set, inserts SWAP chains where two qubits are not physically connected, and optimises what it can along the way. The circuit that runs is often much longer than the one you wrote, which is a common surprise the first time you look.',
    related: ['connectivity', 'depth', 'optimiser'],
  },
  {
    id: 'depth', category: 'hardware', title: 'What is circuit depth and why does it matter?',
    keys: ['depth', 'circuit depth', 'how deep', 'moments'],
    body: 'Depth is the number of layers of gates that must run one after another — gates on different qubits in the same layer run simultaneously. It matters because coherence time is a clock: exceed it and your result is noise. Reducing depth is often more important than reducing total gate count.',
    related: ['t1-t2', 'optimiser'],
  },
  {
    id: 'qubit-count', category: 'hardware', title: 'How many qubits do machines have?',
    keys: ['how many qubits', 'qubit count', 'biggest quantum computer'],
    body: 'Leading superconducting machines are in the hundreds to low thousands of physical qubits, and trapped ion systems in the tens with much higher fidelity. Raw count is a poor measure on its own — error rate, connectivity and coherence matter just as much. A hundred good qubits beat a thousand bad ones. Check current figures before quoting any specific number.',
    related: ['nisq', 'logical-qubit'],
  },
  {
    id: 'supremacy', category: 'hardware', title: 'What is quantum supremacy or advantage?',
    keys: ['supremacy', 'quantum advantage', 'google supremacy', 'beat classical'],
    body: 'Quantum advantage means performing some task faster than any classical computer could. Google claimed it in 2019 on a sampling task with no practical use, and classical algorithms later narrowed the gap considerably. The honest position is that advantage on a genuinely useful problem has not yet been demonstrated, and claiming otherwise in a pitch invites a hard question.',
    related: ['nisq', 'hardware-types'],
  },

  // ================================================================ errors
  {
    id: 'error-correction', category: 'errors', title: 'What is quantum error correction?',
    keys: ['error correction', 'qec', 'correct errors', 'logical qubit'],
    body: 'Quantum error correction spreads one logical qubit across many physical qubits so errors can be detected and undone without measuring the state itself. It is harder than the classical version because you cannot copy a qubit and because errors are continuous rather than just bit flips. It is the bridge between today’s noisy machines and useful ones.',
    related: ['surface-code', 'logical-qubit', 'no-cloning'],
  },
  {
    id: 'bit-flip-code', category: 'errors', title: 'What is the three qubit bit flip code?',
    keys: ['bit flip code', 'three qubit code', 'repetition code', 'simplest error correction'],
    body: 'The simplest error correcting code spreads one qubit across three using two CNOTs. If one of the three flips, comparing them in pairs reveals which — without ever measuring the encoded value itself. It only fixes bit flips, not phase flips, but it is the clearest illustration of the central idea: measure the disagreement, not the data.',
    related: ['error-correction', 'shor-code'],
  },
  {
    id: 'shor-code', category: 'errors', title: 'What is the Shor code?',
    keys: ['shor code', 'nine qubit code', 'first error correcting code'],
    body: 'The nine qubit Shor code was the first to correct any single qubit error, by nesting a phase flip code inside a bit flip code. It proved quantum error correction was possible at all, which was not obvious at the time given no-cloning. Modern codes are far more efficient, but this is the historical landmark.',
    related: ['error-correction', 'bit-flip-code', 'surface-code'],
  },
  {
    id: 'surface-code', category: 'errors', title: 'What is the surface code?',
    keys: ['surface code', 'topological code', 'leading error correction'],
    body: 'The surface code arranges qubits on a two dimensional grid where each only talks to its neighbours, which suits real hardware. It has a relatively forgiving error threshold, around one percent, and is the leading candidate for fault tolerance. The cost is steep: current estimates need roughly a thousand physical qubits per logical one.',
    related: ['error-correction', 'logical-qubit', 'threshold'],
  },
  {
    id: 'logical-qubit', category: 'errors', title: 'What is a logical qubit?',
    keys: ['logical qubit', 'physical vs logical', 'encoded qubit'],
    body: 'A logical qubit is an error corrected qubit built from many physical ones. It is the unit that actually matters for running real algorithms. When you read that a machine has a thousand qubits, those are physical; the number of logical qubits available today is in the low single digits at best.',
    related: ['surface-code', 'error-correction', 'qubit-count'],
  },
  {
    id: 'threshold', category: 'errors', title: 'What is the threshold theorem?',
    keys: ['threshold theorem', 'error threshold', 'fault tolerant'],
    body: 'The threshold theorem says that if the physical error rate is below a certain level, error correction removes errors faster than it introduces them — so arbitrarily long computations become possible by adding more qubits. It is the theoretical guarantee that fault tolerant quantum computing is achievable at all, rather than merely hoped for.',
    related: ['error-correction', 'surface-code'],
  },
  {
    id: 'noise-types', category: 'errors', title: 'What kinds of errors do qubits have?',
    keys: ['types of error', 'noise types', 'readout error', 'gate error', 'crosstalk'],
    body: 'Gate errors come from imperfect control pulses. Readout errors mistake a zero for a one at measurement. Decoherence loses the state to the environment over time. Crosstalk means operating one qubit disturbs its neighbours. Real characterisation reports all of these separately, and the worst one usually dominates.',
    related: ['decoherence', 't1-t2', 'noise'],
  },
  {
    id: 'noise', category: 'errors', title: 'Does this app simulate noise?',
    keys: ['noise', 'noisy simulation', 'does this have errors', 'realistic'],
    body: 'No. You are seeing ideal quantum mechanics, with no decoherence and no gate errors. Real hardware has both. It is on the roadmap for this platform, and worth knowing that what you learn here is the clean case — moving to real hardware will surprise you.',
    related: ['noise-types', 'real-hardware'],
  },

  // ================================================================ applications
  {
    id: 'what-is-it-good-for', category: 'applications', title: 'What is quantum computing actually good for?',
    keys: ['what is it good for', 'use cases', 'applications', 'why do we need it', 'practical'],
    body: 'The strongest candidates are simulating quantum systems themselves — chemistry and materials — plus certain optimisation problems and breaking some current cryptography. It is not a faster computer in general. For most everyday computing, a classical machine will always be better. Being clear about that is a sign you understand the field.',
    related: ['chemistry', 'optimisation', 'shor', 'qml'],
  },
  {
    id: 'chemistry', category: 'applications', title: 'How is quantum computing used in chemistry?',
    keys: ['chemistry', 'molecule', 'drug discovery', 'materials', 'simulation'],
    body: 'Molecules are quantum systems, so simulating them on a classical computer costs exponentially more as they grow. A quantum computer represents them naturally. Applications include catalyst design, battery materials and drug discovery. This is widely considered the most likely first genuinely useful application, because the problem is quantum to begin with.',
    related: ['vqe', 'what-is-it-good-for'],
  },
  {
    id: 'optimisation', category: 'applications', title: 'Can quantum computers solve optimisation problems?',
    keys: ['optimisation', 'optimization', 'logistics', 'scheduling', 'travelling salesman'],
    body: 'They can attack them, with QAOA and annealing being the usual approaches, and logistics and scheduling are commonly cited. But the honest position is that a clear advantage over good classical heuristics has not been demonstrated on realistic problem sizes. Treat confident claims here with caution.',
    related: ['qaoa', 'annealing'],
  },
  {
    id: 'qml', category: 'applications', title: 'What is quantum machine learning?',
    keys: ['qml', 'quantum machine learning', 'quantum ai', 'quantum neural network'],
    body: 'Quantum machine learning explores using quantum circuits as models, often as parameterised circuits trained like neural networks. It is an active research area with real open questions, particularly around loading classical data efficiently and the barren plateau problem, where gradients vanish as circuits grow. Promising, but not yet a solved advantage.',
    related: ['vqe', 'hhl', 'what-is-it-good-for'],
  },
  {
    id: 'rsa-threat', category: 'applications', title: 'Will quantum computers break encryption?',
    keys: ['break encryption', 'rsa', 'security', 'is my data safe', 'cryptography'],
    body: 'Shor’s algorithm would break RSA and elliptic curve cryptography, which secure most of the internet today. The machines needed are far beyond current capability — millions of physical qubits by most estimates. The real concern now is harvest now decrypt later: data stolen today could be decrypted once such a machine exists, which is why migration has already begun.',
    related: ['shor', 'post-quantum', 'qkd'],
  },
  {
    id: 'post-quantum', category: 'applications', title: 'What is post-quantum cryptography?',
    keys: ['post quantum', 'pqc', 'quantum safe', 'nist standards'],
    body: 'Post-quantum cryptography means classical algorithms believed to resist quantum attack, based on lattices and similar hard problems. NIST has standardised several. Importantly this runs on ordinary computers — it is not quantum technology, it is defence against it, and it is being deployed now rather than later.',
    related: ['rsa-threat', 'qkd'],
  },
  {
    id: 'qkd', category: 'applications', title: 'What is quantum key distribution?',
    keys: ['qkd', 'bb84', 'quantum cryptography', 'quantum key'],
    body: 'Quantum key distribution shares an encryption key using qubits, so that any eavesdropper necessarily disturbs them and is detected. BB84 is the classic protocol. It gives security based on physics rather than computational hardness, but it needs special hardware and has practical range limits, so it complements post-quantum cryptography rather than replacing it.',
    related: ['no-cloning', 'post-quantum'],
  },
  {
    id: 'quantum-internet', category: 'applications', title: 'What is the quantum internet?',
    keys: ['quantum internet', 'quantum network', 'repeater'],
    body: 'A quantum internet would distribute entanglement between distant nodes, enabling secure communication, linked quantum processors and better sensing. The hard part is that entanglement degrades with distance and cannot be amplified by copying, so it needs quantum repeaters. Small networks exist experimentally; a general one is a long way off.',
    related: ['qkd', 'teleport', 'no-cloning'],
  },
  {
    id: 'sensing', category: 'applications', title: 'What is quantum sensing?',
    keys: ['sensing', 'quantum sensor', 'metrology', 'magnetometer'],
    body: 'Quantum sensing uses quantum states to measure magnetic fields, gravity, time and rotation far more precisely than classical instruments. It is arguably the most commercially mature quantum technology today — atomic clocks and quantum magnetometers are already in use — and it usually gets far less attention than computing.',
    related: ['what-is-it-good-for'],
  },

  // ================================================================ india & careers
  {
    id: 'nqm', category: 'india', title: 'What is India’s National Quantum Mission?',
    keys: ['national quantum mission', 'nqm', 'india quantum', 'government mission'],
    body: 'The National Quantum Mission was approved in April 2023 with an outlay of about six thousand crore rupees, running to 2030 and 31. It funds research in quantum computing, communication, sensing and materials, and it includes building a skilled workforce — including a quantum curriculum developed with AICTE and hands-on teaching labs in a hundred engineering colleges.',
    related: ['careers', 'learn-path'],
  },
  {
    id: 'careers', category: 'india', title: 'What careers exist in quantum computing?',
    keys: ['career', 'jobs', 'quantum job', 'work in quantum', 'placement'],
    body: 'Roles split into hardware engineering, quantum software and algorithms, error correction research, and applications work in chemistry or finance. Software roles are the most accessible from a computer science background — they need linear algebra, Python and Qiskit or PennyLane more than they need a physics doctorate. Sensing and communication also employ far more people than headlines suggest.',
    related: ['learn-path', 'nqm', 'maths-needed'],
  },
  {
    id: 'learn-path', category: 'study', title: 'How should I learn quantum computing?',
    keys: ['how to learn', 'where to start', 'learning path', 'roadmap', 'beginner'],
    body: 'Start with single qubits until the Bloch sphere feels natural, then superposition, then entanglement, then interference — because every algorithm is built from interference. Only then move to algorithms. Build circuits as you go rather than only reading; the gap between recognising a concept and being able to use it is exactly what this app exists to close.',
    related: ['maths-needed', 'careers', 'what-is-app'],
  },
  {
    id: 'maths-needed', category: 'study', title: 'What maths do I need?',
    keys: ['maths', 'math required', 'prerequisites', 'do i need physics'],
    body: 'Linear algebra is the one that matters — vectors, matrices, eigenvalues, and complex numbers. You do not need quantum physics, and you do not need advanced calculus to start. IBM makes the point that the concepts are only a little more complex than high school algebra, and for the introductory material that is fair.',
    related: ['learn-path', 'complex', 'pauli-matrices'],
  },
  {
    id: 'frameworks', category: 'study', title: 'Which quantum framework should I use?',
    keys: ['qiskit', 'pennylane', 'cirq', 'which framework', 'sdk'],
    body: 'Qiskit from IBM has the largest community and the best learning material, and is the usual first choice. PennyLane is strongest for quantum machine learning and differentiable circuits. Cirq from Google suits low level hardware control. This app exports all three from the same circuit, so you can compare them directly.',
    related: ['learn-path', 'code-editor'],
  },
  {
    id: 'resources', category: 'study', title: 'Where else can I learn?',
    keys: ['resources', 'books', 'course', 'nielsen chuang', 'ibm learning'],
    body: 'Nielsen and Chuang is the standard textbook, though it is heavy going for a first read. IBM Quantum Learning is the best free structured course and it is genuinely good. Qiskit and PennyLane both have tutorial collections. Use those for depth, and use this app for the practice that reading alone will not give you.',
    related: ['frameworks', 'learn-path'],
  },

  // ================================================================ app
  {
    id: 'what-is-app', category: 'app', title: 'What can this app do?',
    keys: ['what is this app', 'what can you do', 'features', 'help'],
    body: 'You can learn from eight lessons, build circuits by dragging gates or writing code, watch the state change on a Bloch sphere, take practice questions, solve graded challenges, and track your progress. Everything runs on your device, offline.',
    related: ['how-to-build', 'how-graded', 'learn-path'],
  },
  {
    id: 'how-to-build', category: 'app', title: 'How do I build a circuit?',
    keys: ['how to build', 'how to add gate', 'drag gate', 'how to use'],
    body: 'Drag a gate from the palette onto a wire, or tap it to add it at the end. Tap a gate on the canvas to select it — then you can remove it, flip a control and target, or drag an angle slider for rotation gates. The state updates instantly as you build.',
    related: ['what-is-app', 'code-editor'],
  },
  {
    id: 'code-editor', category: 'app', title: 'Can I write code instead of dragging?',
    keys: ['write code', 'code editor', 'python', 'qasm', 'type instead'],
    body: 'Yes. The code panel shows your circuit as OpenQASM, Qiskit, Cirq or PennyLane. OpenQASM and Qiskit are editable — change the text, press apply, and the canvas rebuilds from your code. Both directions work because the canvas and the code are two views of the same underlying circuit.',
    related: ['frameworks', 'how-to-build'],
  },
  {
    id: 'how-graded', category: 'app', title: 'How are challenges graded?',
    keys: ['grading', 'graded', 'how is it marked', 'wrong answer'],
    body: 'Your circuit is run and the quantum state it produces is compared against the target, ignoring global phase. Not by matching your gates against ours — so a different but correct solution passes. The percentage you see is fidelity, and it needs to reach one hundred percent.',
    related: ['fidelity', 'global-phase'],
  },
  {
    id: 'why-12', category: 'app', title: 'Why is the simulator limited to 12 qubits?',
    keys: ['12 qubits', 'qubit limit', 'why capped', 'more qubits'],
    body: 'Every extra qubit doubles the number of amplitudes to track. Twelve qubits is 4096 complex numbers, which a phone handles instantly. Twenty is a million, and thirty is a billion. That growth is physics, not a limitation of this app — and it is exactly why quantum computers are interesting. Larger circuits can be sent to the server backends.',
    related: ['tensor', 'real-hardware'],
  },
  {
    id: 'real-hardware', category: 'app', title: 'Why not run on a real quantum computer?',
    keys: ['real hardware', 'real quantum computer', 'ibm quantum', 'why simulator'],
    body: 'A beginner needs thousands of instant, free, forgiving runs. Real machines are queued, remote, noisy and rationed — you might get a handful of jobs a day. Simulating on your own device removes the queue, the account, the cost and the internet entirely. Connecting to real hardware is a sensible later step, not a missing feature.',
    related: ['why-12', 'noise', 'nisq'],
  },
  {
    id: 'how-tutor-works', category: 'app', title: 'How does this tutor work?',
    keys: ['how do you work', 'are you ai', 'llm', 'do you use internet', 'hallucinate'],
    body: 'I check everything before I say it. When I suggest a circuit fix I actually run it on the simulator first, and if it does not produce the result I claimed, I throw it away and try another. For quantum questions I answer from a built in knowledge base that works with no internet. If you have connected a language model key I can also answer wider questions, and I will tell you which of the two answered.',
    related: ['offline', 'what-is-app'],
  },
  {
    id: 'offline', category: 'app', title: 'Does this work without internet?',
    keys: ['offline', 'no internet', 'without network', 'data'],
    body: 'Yes. The simulator, the lessons, the challenges, the quizzes and my built in knowledge all run on your device with no connection at all. Only two things need a network: the optional language model, and speech recognition on Android. Everything else works on a plane.',
    related: ['how-tutor-works', 'what-is-app'],
  },
  {
    id: 'optimiser', category: 'app', title: 'What does the simplify suggestion do?',
    keys: ['optimiser', 'simplify', 'remove gates', 'redundant'],
    body: 'It cancels gates that undo each other, merges rotations about the same axis, and drops identities. Every rewrite is checked by running both circuits and comparing the states, so the shorter version is guaranteed to do exactly the same thing. It reports the gate count and depth before and after.',
    related: ['depth', 'how-tutor-works'],
  },
  {
    id: 'step-through', category: 'app', title: 'How do I see the state at each step?',
    keys: ['step through', 'step by step', 'slider', 'watch it change'],
    body: 'Use the step slider under the circuit. It moves through the circuit one operation at a time and shows the state at that point, so you can find exactly where things stop matching what you expected. It is the fastest way to debug a circuit that is nearly right.',
    related: ['how-to-build', 'bloch'],
  },
];

/**
 * Everything the tutor knows offline: the curated entries above, plus the ones the
 * simulator works out on demand.
 *
 * The two halves answer different kinds of question. A person writes "what is
 * entanglement" — that needs judgement about what to say and what to leave out, and no
 * generator can supply it. A person also asks "what does T do to the plus state", and
 * that has one right answer which the simulator already knows; writing it out by hand
 * would only be a chance to get it wrong.
 */
/** Everything a person wrote and checked, across both files. */
export const CURATED_ENTRIES: Entry[] = [...BASE_ENTRIES, ...EXTRA_ENTRIES];

export const ENTRIES: Entry[] = [...CURATED_ENTRIES, ...DERIVED_ENTRIES];

export interface Match {
  entry: Entry;
  score: number;
}

const STOP = new Set([
  'what', 'is', 'the', 'a', 'an', 'how', 'do', 'does', 'i', 'you', 'me', 'to', 'of', 'in',
  'on', 'and', 'why', 'can', 'it', 'tell', 'about', 'explain', 'this', 'that', 'for', 'my',
  'are', 'was', 'be', 'with', 'if', 'or', 'so', 'we', 'us', 'get', 'work', 'works', 'mean',
  'means', 'there', 'their', 'they', 'them', 'not', 'but', 'when', 'which', 'who', 'from',
]);

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function contentWords(s: string): string[] {
  return words(s).filter(w => !STOP.has(w));
}

/**
 * Precomputed word sets.
 *
 * Matching is done on whole words, never substrings. An earlier version scored with
 * `haystack.includes(word)`, which meant typing "hi" matched "w-hi-ch" and the tutor
 * confidently answered a question nobody asked. Word-boundary matching is the fix, and
 * the test suite pins it.
 */
interface Indexed {
  entry: Entry;
  titleKeys: Set<string>;
  body: Set<string>;
  /** Multi-word keys, pre-tokenised and space-padded, ready to test with `includes`. */
  phrases: string[];
  /** Single-word keys, which score on an exact word match instead. */
  singles: string[];
}

/**
 * Computed entries are indexed on their title and keys only.
 *
 * Two reasons, and both matter. Reading a computed body runs a simulation, so indexing
 * one at import would turn a cheap module load into several hundred circuit runs on the
 * phone's main thread. And their bodies are mostly numbers — indexing "0.707" and
 * "percent" across nine hundred entries would add noise to retrieval, not signal.
 */
const NO_BODY: Set<string> = new Set();

const INDEX: Indexed[] = ENTRIES.map(entry => {
  const phrases: string[] = [];
  const singles: string[] = [];
  const keyWords: string[] = [];
  for (const key of entry.keys) {
    const kw = words(key);
    keyWords.push(...kw);
    if (kw.length > 1) phrases.push(' ' + kw.join(' ') + ' ');
    else if (kw.length === 1) singles.push(kw[0]);
  }
  return {
    entry,
    titleKeys: new Set([...words(entry.title), ...keyWords]),
    body: entry.computed ? NO_BODY : new Set(contentWords(entry.body)),
    phrases,
    singles,
  };
});

/**
 * Loose match so "entangle" finds "entangled" and "shors" finds "shor".
 *
 * The query word must be at least five characters, which keeps short words like "hi"
 * and "is" from matching anything. The indexed word only needs four, so real stems
 * like "gate" and "shor" stay reachable.
 */
function fuzzyHit(word: string, set: Set<string>): boolean {
  if (set.has(word)) return true;
  if (word.length < 5) return false;
  for (const w of set) {
    if (w.length >= 4 && (w.startsWith(word) || word.startsWith(w))) return true;
  }
  return false;
}

const MIN_SCORE = 3;

/** Score every entry against the question and return the best matches. */
export function search(question: string, limit = 3): Match[] {
  const q = ' ' + words(question).join(' ') + ' ';
  const asked = contentWords(question);
  if (!asked.length) return [];

  const askedSet = new Set(asked);

  const scored = INDEX.map(({ entry, titleKeys, body, phrases, singles }) => {
    let score = 0;

    // A whole key phrase present in the question is the strongest signal there is.
    for (const p of phrases) if (q.includes(p)) score += 7;
    for (const s of singles) if (askedSet.has(s)) score += 4;

    for (const w of asked) {
      if (titleKeys.has(w)) score += 2.5;
      else if (fuzzyHit(w, titleKeys)) score += 1.5;
      else if (w.length >= 5 && body.has(w)) score += 0.5;
    }

    // A written explanation beats a computed one when both fit the question equally well.
    // Somebody asking "what does the Hadamard gate do" wants the concept, not the Bloch
    // coordinates of one particular case — and the general answer is the better place to
    // start from either way.
    return { entry, score: entry.computed ? score * 0.9 : score };
  });

  return scored.filter(m => m.score >= MIN_SCORE).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------- small talk

const GREETINGS = new Set(['hi', 'hii', 'hey', 'hello', 'hai', 'yo', 'hola', 'namaste', 'vanakkam', 'sup']);
const THANKS = new Set(['thanks', 'thank', 'thx', 'ty', 'nice', 'cool', 'great', 'awesome', 'good']);
const BYES = new Set(['bye', 'goodbye', 'cya', 'later']);

/**
 * Catch greetings and pleasantries before the search runs.
 *
 * Without this a one-word "hi" gets forced through topic matching and comes back with
 * whatever scored least badly, which reads as the tutor not listening.
 */
export function smallTalk(question: string): string | null {
  const w = words(question);
  if (!w.length || w.length > 3) return null;

  if (w.some(x => GREETINGS.has(x))) {
    return `Hello. I am your quantum tutor, and I know ${ENTRIES.length} topics with no internet needed. ` +
      'Ask me anything — try "what is entanglement", or "how do I build a Bell state".';
  }
  if (w.some(x => THANKS.has(x))) {
    return 'Glad that helped. Ask me anything else whenever you like.';
  }
  if (w.some(x => BYES.has(x))) {
    return 'See you. Tap me any time you get stuck.';
  }
  if (w.length <= 2 && w.some(x => ['help', 'menu', 'options'].includes(x))) {
    return `I can explain quantum concepts, the gates, the algorithms, real hardware, error correction, ` +
      `and how to use this app — ${ENTRIES.length} topics in all. What would you like to know?`;
  }
  return null;
}

/** Indexed rather than scanned: with a thousand entries this is called in loops. */
const BY_ID = new Map(ENTRIES.map(e => [e.id, e]));

export function byId(id: string): Entry | undefined {
  return BY_ID.get(id);
}

/** Entries tied to a learning concept, for the avatar's contextual suggestions. */
export function forConcept(concept: string): Entry[] {
  return ENTRIES.filter(e => e.concept === concept);
}

export function byCategory(category: Category): Entry[] {
  return ENTRIES.filter(e => e.category === category);
}

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
export const TOPIC_COUNT = ENTRIES.length;
