/**
 * The second batch of hand-written knowledge.
 *
 * knowledge.ts covered the questions a learner asks in the first hour. These are the ones
 * that come after: the vocabulary of the field, the parts of real hardware, the error
 * models, and the India-specific questions a judge or a student here will actually ask.
 *
 * Kept in its own file because the first list was already long enough to be hard to read,
 * not because it is different in kind. Same rules apply: written to be spoken as well as
 * read, no ket bars, no markdown, and no claim stated more confidently than it deserves.
 * Where a fact could go stale — a company's qubit count, who is ahead — the entry says
 * what is durable and leaves the rest alone.
 */

import type { Entry } from './knowledge';

export const EXTRA_ENTRIES: Entry[] = [
  // ================================================================ basics
  {
    id: 'quantum-state', category: 'basics', title: 'What is a quantum state?',
    keys: ['quantum state', 'what is a state', 'state vector', 'statevector'],
    body: 'A quantum state is the complete description of what a system is doing. For n qubits it is a list of 2 to the n complex numbers, one amplitude per basis state. Everything you can predict about the system is in that list. The state is not what you see — it is what decides the odds of what you see.',
    related: ['amplitude', 'measurement', 'normalisation'],
  },
  {
    id: 'normalisation', category: 'basics', title: 'Why must the squares add up to one?',
    keys: ['normalisation', 'normalization', 'add up to one', 'sum of squares', 'normalised'],
    body: 'The squared magnitudes of the amplitudes are probabilities, and something must happen when you measure, so they have to total one. Every quantum gate is unitary, which is precisely the property that keeps that total at one no matter how long the circuit runs. If a simulator ever showed a total drifting away from one, that would be a bug rather than physics.',
    related: ['born-rule', 'unitary', 'quantum-state'],
  },
  {
    id: 'purity-length', category: 'basics', title: 'What does the length of the Bloch arrow mean?',
    keys: ['arrow length', 'bloch vector length', 'purity', 'why is the arrow short'],
    body: 'A full length arrow means the qubit has a definite state of its own. A shorter arrow means some of the information about that qubit lives somewhere else, either in a partner qubit or in the environment. Length zero, a dot at the centre, means the qubit alone tells you nothing at all. In this app you see that the moment a CNOT entangles two qubits.',
    related: ['bloch', 'entanglement', 'mixed-state'],
  },
  {
    id: 'product-vs-entangled', category: 'basics', title: 'How do I tell if two qubits are entangled?',
    keys: ['product state', 'is it entangled', 'separable', 'entangled or not'],
    body: 'If you can describe each qubit on its own and the pair is just the two descriptions together, the state is a product state and there is no entanglement. If you cannot, it is entangled. In this app the test is visual: look at the Bloch arrows. Two full length arrows means a product state. Two arrows collapsed to dots means the qubits are entangled with each other.',
    related: ['entanglement', 'purity-length', 'bell'],
  },
  {
    id: 'w-state', category: 'basics', title: 'What is a W state?',
    keys: ['w state', 'other entangled state', 'w vs ghz'],
    body: 'A W state on three qubits is an equal superposition of exactly one qubit being 1 and the rest 0, so the readings 001, 010 and 100 each come up a third of the time. It is entangled in a different way from GHZ. Lose one qubit from a GHZ state and the rest is left with no entanglement at all, but lose one from a W state and the other two are still entangled. That robustness is why W states get used in networking proposals.',
    related: ['ghz', 'entanglement'],
  },
  {
    id: 'basis-change', category: 'basics', title: 'Can you measure in a different basis?',
    keys: ['measure in x basis', 'change of basis', 'different basis', 'measurement basis'],
    body: 'Hardware only ever measures in the Z basis, which is the zero versus one question. To ask a different question you rotate the state first. A Hadamard before the measurement turns an X basis question into a Z basis one, and an S dagger followed by a Hadamard does the same for the Y basis. Every measurement of a spin along any axis you have ever read about is this trick.',
    related: ['measurement', 'hadamard', 'bloch'],
  },
  {
    id: 'expectation-value', category: 'basics', title: 'What is an expectation value?',
    keys: ['expectation value', 'average value', 'observable average'],
    body: 'An expectation value is the average result you would get if you measured the same state many times. For a Z measurement it is the probability of 0 minus the probability of 1, which is exactly the z coordinate of the Bloch arrow. Most useful quantum algorithms in the near term, including the variational ones, produce an expectation value rather than a single answer.',
    related: ['measurement', 'bloch', 'vqe'],
  },
  {
    id: 'observable', category: 'basics', title: 'What is an observable?',
    keys: ['observable', 'hermitian operator', 'what can you measure'],
    body: 'An observable is anything you can measure, written as a Hermitian matrix. Its eigenvalues are the results you can get and its eigenvectors are the states that give those results with certainty. The Pauli matrices X, Y and Z are the three observables for a single qubit, and any measurement of one qubit is a combination of them.',
    related: ['hermitian', 'pauli-matrices', 'expectation-value'],
  },
  {
    id: 'uncertainty', category: 'basics', title: 'What is the uncertainty principle here?',
    keys: ['uncertainty principle', 'heisenberg', 'cannot know both'],
    body: 'Two observables that do not commute cannot both have definite values at the same time. For a qubit, X and Z are like that. A qubit sitting at ket zero has a completely definite Z value and a completely undecided X value, which is why measuring it in the X basis gives a coin flip. It is not a limit on your instruments. It is a statement about what a state can be.',
    related: ['observable', 'basis-change', 'measurement'],
  },
  {
    id: 'maximally-mixed', category: 'basics', title: 'What is the maximally mixed state?',
    keys: ['maximally mixed', 'completely mixed', 'no information state'],
    body: 'The maximally mixed state is the one that gives a coin flip for every possible measurement, in every basis. Its Bloch arrow has zero length, a dot at the centre of the sphere. You reach it either by losing a qubit to noise or by looking at one half of a perfectly entangled pair. Those two look identical from inside that one qubit, which is a deep fact rather than a coincidence.',
    related: ['mixed-state', 'purity-length', 'decoherence'],
  },
  {
    id: 'monogamy', category: 'basics', title: 'Can one qubit be entangled with two others?',
    keys: ['monogamy', 'entangled with two', 'share entanglement'],
    body: 'Not fully. Entanglement is monogamous: if two qubits are maximally entangled with each other, neither can be entangled with anything else at all. You can spread partial entanglement across several qubits, as GHZ and W states do, but the total is conserved. This is one of the reasons quantum key distribution is secure, because an eavesdropper cannot quietly join an existing pair.',
    related: ['entanglement', 'w-state', 'qkd'],
  },
  {
    id: 'chsh', category: 'basics', title: 'What is the CHSH test?',
    keys: ['chsh', 'bell test', 'chsh inequality', 'tsirelson'],
    body: 'CHSH is the practical version of Bell inequality. Two people measure their halves of an entangled pair along randomly chosen directions and combine the results into one number. Any theory where the answers were decided in advance caps that number at 2. Quantum mechanics reaches 2 times the square root of 2, about 2.83, and experiments have measured it. It is the closest thing physics has to a proof that the world is not secretly classical.',
    related: ['bell-inequality', 'entanglement', 'faster-than-light'],
  },
  {
    id: 'stabiliser', category: 'basics', title: 'What is a stabiliser state?',
    keys: ['stabiliser', 'stabilizer', 'stabiliser state'],
    body: 'A stabiliser state is one you can describe by listing the Pauli operators that leave it unchanged, rather than by writing out every amplitude. The Bell and GHZ states are stabiliser states. The description grows with the square of the number of qubits instead of doubling, which is why stabiliser states can be simulated on a laptop for hundreds of qubits and why error correction is built on them.',
    related: ['clifford', 'error-correction', 'pauli-matrices'],
  },
  {
    id: 'clifford', category: 'basics', title: 'What is the Clifford group?',
    keys: ['clifford', 'clifford gates', 'gottesman knill'],
    body: 'The Clifford gates are the ones built from Hadamard, S and CNOT. They are the workhorses of error correction, and they have a surprising property: a circuit made only of Clifford gates can be simulated efficiently on a classical computer. That is the Gottesman-Knill theorem. It means Clifford gates alone give no quantum advantage, and the T gate is what breaks the deadlock.',
    related: ['universal-gates', 't-gate-cost', 'stabiliser'],
  },
  {
    id: 'magic-states', category: 'basics', title: 'What are magic states?',
    keys: ['magic state', 'magic state distillation', 'how to get a t gate'],
    body: 'In a fault tolerant machine the Clifford gates are cheap and the T gate is not. The standard workaround is to prepare a special resource state, called a magic state, and consume it to perform a T gate. Producing clean ones takes many noisy copies and a distillation circuit, and that process is expected to dominate the cost of a large quantum computer, both in qubits and in time.',
    related: ['clifford', 't-gate-cost', 'error-correction'],
  },

  // ================================================================ gates
  {
    id: 'cp-gate', category: 'gates', title: 'What does the controlled phase gate do?',
    keys: ['controlled phase', 'cp gate', 'cphase', 'cp'],
    body: 'The controlled phase gate adds a phase to one basis state only, the one where both qubits read 1, and leaves the other three alone. It changes no probabilities on its own. It is the gate the quantum Fourier transform is built from, with the angle halving at each step, which is why this app added it before the Fourier and phase estimation lessons.',
    related: ['phase-gate', 'qft', 'controlled-gates'],
  },
  {
    id: 'y-gate', category: 'gates', title: 'What does the Y gate do?',
    keys: ['y gate', 'pauli y', 'what does y do'],
    body: 'The Y gate is a half turn about the Y axis of the Bloch sphere. It flips ket zero to ket one and back like X does, but it also applies a phase, so it is a bit flip and a phase flip at once. In fact Y equals X followed by Z, up to an overall factor nobody can measure. You can check that in this app by comparing the Bloch coordinates.',
    related: ['pauli', 'bloch', 'phase'],
  },
  {
    id: 'dagger', category: 'gates', title: 'What does the dagger on S and T mean?',
    keys: ['dagger', 'sdg', 'tdg', 's dagger', 't dagger', 'inverse gate'],
    body: 'The dagger means the inverse. S turns a quarter turn one way about the vertical axis and S dagger turns it back. Because every quantum gate is unitary, every one of them has an inverse, and running a circuit backwards with all its gates daggered returns you exactly to the start. That is how the inverse Fourier transform in phase estimation is built.',
    related: ['st-gates', 'reversible', 'phase-estimation'],
  },
  {
    id: 'sqrt-x', category: 'gates', title: 'What is the square root of X gate?',
    keys: ['sqrt x', 'square root of x', 'sx gate', 'half a flip'],
    body: 'Square root of X, often written SX, is the gate you apply twice to get an X. It is a quarter turn about the X axis rather than a half turn, so it takes ket zero to an equal superposition rather than to ket one. It is a native gate on several superconducting machines, which means their compilers rewrite Hadamards and rotations in terms of it.',
    related: ['rotations', 'native-gates', 'transpiler'],
  },
  {
    id: 'native-gates', category: 'gates', title: 'What is a native gate set?',
    keys: ['native gates', 'basis gates', 'what gates does hardware have'],
    body: 'Real hardware does not implement the palette you draw with. Each machine has a small set of operations its control electronics can actually perform, often one or two single qubit rotations and one two qubit gate. Everything else gets rewritten into that set by a compiler before it runs. That rewriting is why a four gate circuit on screen can become twenty gates on the machine.',
    related: ['transpiler', 'depth', 'real-hardware'],
  },
  {
    id: 'virtual-z', category: 'gates', title: 'Why are Z rotations free on some hardware?',
    keys: ['virtual z', 'free z gate', 'why is rz free', 'frame change'],
    body: 'On superconducting hardware a Z rotation can be done by shifting the phase of the microwave pulses that come afterwards, rather than by sending a pulse of its own. It takes no time and adds no error, so it is called a virtual Z. This is why compilers work hard to push rotations onto the Z axis, and why an RZ often costs nothing while an RX costs a real pulse.',
    related: ['native-gates', 'superconducting', 'transpiler'],
  },
  {
    id: 'multi-controlled', category: 'gates', title: 'How do gates with many controls work?',
    keys: ['multi controlled', 'many controls', 'ccz', 'multiple control qubits'],
    body: 'A gate with several controls acts only when every control reads 1. Toffoli is the two control version of X. Hardware has nothing like this natively, so a compiler breaks it into two qubit gates, and the cost grows quickly with the number of controls. Extra helper qubits can be traded for shorter circuits, which is a standard move in algorithm design.',
    related: ['toffoli', 'controlled-gates', 'transpiler'],
  },
  {
    id: 'euler-decomposition', category: 'gates', title: 'Can any single qubit gate be built from rotations?',
    keys: ['euler decomposition', 'any single qubit gate', 'three rotations', 'zyz'],
    body: 'Yes. Any single qubit gate at all can be written as three rotations, a Z rotation then a Y rotation then another Z rotation, with the right three angles. Nothing more is ever needed for one qubit. That is why the palette here is not missing anything, and why compilers can reduce a long run of single qubit gates to at most three.',
    related: ['rotations', 'universal-gates', 'optimiser'],
  },
  {
    id: 'iswap', category: 'gates', title: 'What is the iSWAP gate?',
    keys: ['iswap', 'i swap gate'],
    body: 'The iSWAP exchanges two qubits like a SWAP does, but it also adds a factor of i to the states where the two qubits differ. Some superconducting processors produce it more naturally than a CNOT, so their compilers build everything from it instead. It is a good example of the general point that the gate you write is rarely the gate that runs.',
    related: ['swap', 'native-gates', 'superconducting'],
  },
  {
    id: 'fredkin', category: 'gates', title: 'What is the Fredkin or controlled SWAP gate?',
    keys: ['fredkin', 'controlled swap', 'cswap'],
    body: 'Fredkin swaps two qubits only when a third control qubit reads 1. Like Toffoli it is universal for reversible classical computation, so any ordinary logic circuit can be rebuilt from it without losing information. It also appears in the swap test, which is how a quantum computer compares two states it cannot look at directly.',
    related: ['toffoli', 'swap', 'swap-test'],
  },
  {
    id: 'gate-fidelity', category: 'gates', title: 'What does gate fidelity mean?',
    keys: ['gate fidelity', 'gate error rate', 'how good is a gate'],
    body: 'Gate fidelity is how close a real gate comes to the ideal one, usually quoted as a percentage. Single qubit gates on good hardware are around 99.9 percent and two qubit gates around 99 percent. Those sound high until you multiply them: a hundred two qubit gates at 99 percent leaves you at about 37 percent, which is why circuit depth matters so much more than qubit count.',
    related: ['depth', 'noise', 'nisq'],
  },

  // ================================================================ algorithms
  {
    id: 'amplitude-amplification', category: 'algorithms', title: 'What is amplitude amplification?',
    keys: ['amplitude amplification', 'generalised grover', 'beyond grover'],
    body: 'Amplitude amplification is Grover written in general form. Instead of starting from an even superposition, you start from whatever state some other algorithm produced, and instead of marking one entry you mark whatever counts as success. Each round increases the amplitude of the good outcomes. It turns a procedure that succeeds sometimes into one that succeeds almost always, with a square root saving in the number of tries.',
    related: ['grover', 'diffuser', 'oracle'],
  },
  {
    id: 'grover-iterations', category: 'algorithms', title: 'How many Grover iterations do you need?',
    keys: ['grover iterations', 'how many iterations', 'too many grover steps'],
    body: 'About pi over four times the square root of N over M, where N is the number of entries and M is the number of answers. For four entries with one answer that is exactly one iteration, which is why the two qubit example in this app reaches certainty. Doing more than the right number makes things worse, not better, because the amplitude rotates past the answer and starts coming back down.',
    related: ['grover', 'amplitude-amplification', 'quantum-counting'],
  },
  {
    id: 'quantum-counting', category: 'algorithms', title: 'What is quantum counting?',
    keys: ['quantum counting', 'how many solutions', 'count answers'],
    body: 'Quantum counting works out how many answers an oracle has without finding any of them. It runs phase estimation on the Grover operator, because the angle that operator rotates by depends on the number of solutions. You need this before running Grover for real, since the right number of iterations depends on how many answers there are.',
    related: ['grover-iterations', 'phase-estimation', 'grover'],
  },
  {
    id: 'order-finding', category: 'algorithms', title: 'What is order finding, and why does Shor need it?',
    keys: ['order finding', 'period finding', 'shor period'],
    body: 'Order finding asks for the smallest r where a to the power r leaves remainder 1 when divided by N. Shor factoring is mostly classical number theory, and this is the one step it cannot do quickly. A quantum computer finds r using phase estimation, because r shows up as the period of a repeating pattern in the amplitudes. That single step is where the whole speed-up lives.',
    related: ['shor', 'phase-estimation', 'qft'],
  },
  {
    id: 'swap-test', category: 'algorithms', title: 'What is the swap test?',
    keys: ['swap test', 'compare two states', 'overlap of states'],
    body: 'The swap test measures how similar two quantum states are without ever looking at either one. A helper qubit controls a swap between them, and the chance of that helper reading 0 depends on their overlap. Identical states give 0 every time, and completely different states give a coin flip. It is used in quantum machine learning wherever a distance between two states is needed.',
    related: ['fredkin', 'fidelity', 'qml'],
  },
  {
    id: 'hadamard-test', category: 'algorithms', title: 'What is the Hadamard test?',
    keys: ['hadamard test', 'measure a matrix element', 'estimate overlap'],
    body: 'The Hadamard test puts a helper qubit in superposition, uses it to control an operation on the main register, and then interferes it back. The measurement statistics of the helper give you the average value of that operation on the state. It is the standard way of turning a quantity you cannot measure directly into one you can, and it is the pattern behind phase estimation.',
    related: ['phase-estimation', 'expectation-value', 'phase-kickback'],
  },
  {
    id: 'entanglement-swapping', category: 'algorithms', title: 'What is entanglement swapping?',
    keys: ['entanglement swapping', 'quantum repeater', 'link two pairs'],
    body: 'If A shares a pair with B, and B shares another pair with C, then B can perform a joint measurement that leaves A and C entangled with each other, even though they never interacted. This is how a quantum repeater extends a link further than a single fibre run allows, and it is the piece a real quantum internet is waiting on.',
    related: ['teleport', 'quantum-internet', 'entanglement'],
  },
  {
    id: 'hamiltonian-simulation', category: 'algorithms', title: 'What is Hamiltonian simulation?',
    keys: ['hamiltonian simulation', 'simulate physics', 'simulate a molecule'],
    body: 'A Hamiltonian describes how a physical system changes over time. Simulating one on a classical computer costs memory that doubles with system size, which is exactly the wall quantum computers were invented to get past. It is the oldest proposed application, going back to Feynman, and it remains the one where a clear advantage is most expected.',
    related: ['chemistry', 'trotter', 'vqe'],
  },
  {
    id: 'trotter', category: 'algorithms', title: 'What is Trotterisation?',
    keys: ['trotter', 'trotterisation', 'trotterization', 'time slicing'],
    body: 'A Hamiltonian is usually a sum of parts that are individually easy to apply but do not commute, so you cannot just apply them one after another. Trotterisation chops the time into small slices and alternates the parts within each slice. The error shrinks as the slices get smaller, and the circuit gets longer, so it is a direct trade between accuracy and how much noise you can afford.',
    related: ['hamiltonian-simulation', 'depth', 'gate-fidelity'],
  },
  {
    id: 'ansatz', category: 'algorithms', title: 'What is an ansatz?',
    keys: ['ansatz', 'variational circuit', 'parameterised circuit'],
    body: 'An ansatz is a circuit shape with adjustable angles left in it, used by variational algorithms like VQE and QAOA. A classical optimiser tunes the angles while the quantum computer reports how good each setting is. Choosing the shape is the hard part: too simple and the answer is out of reach, too general and the optimiser cannot find it.',
    related: ['vqe', 'qaoa', 'barren-plateaus'],
  },
  {
    id: 'barren-plateaus', category: 'algorithms', title: 'What is a barren plateau?',
    keys: ['barren plateau', 'vanishing gradient', 'why variational is hard'],
    body: 'For a randomly chosen deep ansatz on many qubits, the landscape the optimiser is searching becomes almost perfectly flat, with gradients that shrink exponentially as you add qubits. The optimiser then has nothing to follow. It is the main theoretical obstacle facing variational algorithms, and it is why serious proposals build structure into the ansatz rather than picking one at random.',
    related: ['ansatz', 'vqe', 'qml'],
  },
  {
    id: 'quantum-walk', category: 'algorithms', title: 'What is a quantum walk?',
    keys: ['quantum walk', 'random walk quantum', 'walk algorithm'],
    body: 'A quantum walk is the quantum version of a random walk. A classical walker spreads out with the square root of the number of steps; a quantum walker spreads out linearly, because the paths interfere instead of averaging. Several search and graph algorithms are built on that difference, and it is one of the few genuinely different algorithmic tools the field has.',
    related: ['interference', 'grover', 'amplitude-amplification'],
  },

  // ================================================================ maths
  {
    id: 'bra-ket', category: 'maths', title: 'What does the ket notation mean?',
    keys: ['ket notation', 'bra ket', 'dirac notation', 'angle brackets'],
    body: 'A ket is a column of numbers describing a state, written with a name inside angle brackets so that ket zero and ket one are just labels. A bra is the same thing as a row, with the numbers conjugated. Putting a bra next to a ket gives a single number, the overlap between two states. It is notation rather than physics, but it makes the physics much easier to write down.',
    related: ['inner-product', 'quantum-state', 'complex'],
  },
  {
    id: 'inner-product', category: 'maths', title: 'What is the inner product of two states?',
    keys: ['inner product', 'overlap', 'dot product of states'],
    body: 'The inner product is a single complex number measuring how much two states have in common. Multiply the conjugate of each amplitude of the first by the matching amplitude of the second and add them up. Its magnitude squared is the probability that a measurement designed to test for one state accepts the other. Orthogonal states have inner product zero and can be told apart perfectly.',
    related: ['bra-ket', 'fidelity', 'swap-test'],
  },
  {
    id: 'eigenvector', category: 'maths', title: 'What is an eigenvector?',
    keys: ['eigenvector', 'eigenstate', 'unchanged by a gate'],
    body: 'An eigenvector of a gate is a state the gate does not move, except to multiply it by a number. That number is the eigenvalue. Ket zero and ket one are the eigenvectors of Z; the plus and minus states are the eigenvectors of X. Phase estimation is entirely about finding the eigenvalue of a gate given one of its eigenvectors.',
    related: ['eigenvalue', 'phase-estimation', 'observable'],
  },
  {
    id: 'adjoint', category: 'maths', title: 'What is the adjoint or conjugate transpose?',
    keys: ['adjoint', 'conjugate transpose', 'dagger matrix', 'hermitian conjugate'],
    body: 'The adjoint of a matrix is its transpose with every entry conjugated, written with a dagger. A matrix is unitary when its adjoint is also its inverse, which is what every quantum gate satisfies. A matrix is Hermitian when it equals its own adjoint, which is what every observable satisfies. Those two conditions between them define almost everything in the subject.',
    related: ['unitary', 'hermitian', 'dagger'],
  },
  {
    id: 'euler-formula', category: 'maths', title: 'Why do phases use e to the i theta?',
    keys: ['eulers formula', 'e to the i theta', 'exponential phase', 'why exponential'],
    body: 'e to the i theta is the point on the unit circle at angle theta, equal to cosine theta plus i sine theta. A phase is exactly a point on that circle, so writing it this way makes combining phases the same as adding angles. It is why a Z gate, which turns by 180 degrees, is written as a minus sign, and why two T gates make an S.',
    related: ['complex', 'phase', 'phase-gate'],
  },
  {
    id: 'radians', category: 'maths', title: 'Why are gate angles in radians?',
    keys: ['radians', 'degrees or radians', 'pi over two', 'angle units'],
    body: 'Radians measure an angle by the arc length it cuts on a unit circle, so a full turn is 2 pi and a half turn is pi. Every formula in the subject comes out cleaner in them. In practice: pi over two is 90 degrees, pi over four is 45, and the sliders in this app show both so you never have to convert in your head.',
    related: ['rotations', 'euler-formula'],
  },
  {
    id: 'complex-conjugate', category: 'maths', title: 'What is a complex conjugate?',
    keys: ['complex conjugate', 'conjugate', 'flip the sign of i'],
    body: 'The conjugate of a complex number flips the sign of its imaginary part. Multiplying a number by its own conjugate gives the magnitude squared, which is always a real number and never negative. That is precisely the operation behind the Born rule, and it is why phase disappears the moment you compute a probability.',
    related: ['complex', 'born-rule', 'inner-product'],
  },
  {
    id: 'matrix-order', category: 'maths', title: 'Why is the matrix order reversed from the circuit?',
    keys: ['matrix order', 'reverse order', 'why is the matrix backwards', 'multiplication order'],
    body: 'A circuit reads left to right, but matrices act on the state from the right, so the gate applied first sits rightmost in the product. A circuit of H then Z has the matrix Z times H. Matrix multiplication also does not commute in general, which is not a quirk of notation but the same fact as gates giving different results in different orders.',
    related: ['unitary', 'gate', 'euler-decomposition'],
  },
  {
    id: 'big-o', category: 'maths', title: 'What do the speed-up claims actually mean?',
    keys: ['big o', 'speed up', 'quadratic vs exponential', 'how much faster'],
    body: 'A quadratic speed-up replaces N steps with the square root of N: a million becomes a thousand. That is Grover. An exponential speed-up replaces something growing by doubling with something growing gently, which is Shor. The distinction matters because a quadratic gain can be eaten entirely by the overhead of error correction, while an exponential one cannot.',
    related: ['grover', 'shor', 'error-correction'],
  },

  // ================================================================ hardware
  {
    id: 'photonic', category: 'hardware', title: 'How do photonic quantum computers work?',
    keys: ['photonic', 'photon qubits', 'light based quantum'],
    body: 'Photonic machines use single particles of light as qubits, encoded in polarisation or in which path the photon takes. They run at room temperature and the qubits travel naturally down fibre, which makes them the obvious choice for communication. The hard part is that photons barely interact, so two qubit gates have to be engineered indirectly, often with measurement and a lot of luck.',
    related: ['hardware-types', 'quantum-internet', 'qkd'],
  },
  {
    id: 'neutral-atom', category: 'hardware', title: 'How do neutral atom quantum computers work?',
    keys: ['neutral atom', 'rydberg', 'optical tweezers', 'cold atoms'],
    body: 'Neutral atom machines hold individual atoms in place with focused laser beams called optical tweezers, and make them interact by exciting them into large Rydberg states. The atoms are identical by nature, so there is no manufacturing variation, and the tweezers can be rearranged, which gives unusually flexible connectivity. Gate speeds are slower than superconducting.',
    related: ['hardware-types', 'connectivity', 'trapped-ion'],
  },
  {
    id: 'spin-qubit', category: 'hardware', title: 'What are silicon spin qubits?',
    keys: ['spin qubit', 'silicon qubit', 'quantum dot'],
    body: 'A spin qubit stores information in the spin of a single electron held in a tiny silicon structure. The appeal is manufacturing: these devices are made with much the same equipment as ordinary chips, so scaling to millions of qubits is at least imaginable. The difficulty is that tiny variations between devices make uniform control hard.',
    related: ['hardware-types', 'superconducting'],
  },
  {
    id: 'topological', category: 'hardware', title: 'What is a topological qubit?',
    keys: ['topological qubit', 'majorana', 'topological quantum computing'],
    body: 'A topological qubit would store information in a global property of a system rather than in one particle, making it naturally resistant to local noise. If it worked it would cut the cost of error correction enormously. It remains the least proven approach: the underlying physics is still being established experimentally, and no useful topological processor exists yet.',
    related: ['hardware-types', 'error-correction'],
  },
  {
    id: 'cryostat', category: 'hardware', title: 'Why do quantum computers need to be so cold?',
    keys: ['cryostat', 'dilution refrigerator', 'why so cold', 'millikelvin', 'cold'],
    body: 'Superconducting qubits are cooled to about ten to fifteen millikelvin, colder than deep space, in a dilution refrigerator. At room temperature the surrounding heat would knock them out of their states faster than any gate could run. Trapped ion and photonic machines need much less cooling, and the pictures of gold chandeliers you have seen are mostly the refrigerator, not the computer.',
    related: ['superconducting', 'decoherence', 't1-t2'],
  },
  {
    id: 'readout', category: 'hardware', title: 'How does a real machine read a qubit?',
    keys: ['readout', 'how is a qubit measured', 'measurement hardware'],
    body: 'On superconducting hardware a microwave pulse is bounced off a resonator coupled to the qubit, and the returned signal differs slightly depending on whether the qubit is 0 or 1. That signal is amplified and classified. It is slower than a gate and noticeably less accurate, which is why readout error is quoted separately from gate error.',
    related: ['readout-error', 'superconducting', 'measurement'],
  },
  {
    id: 'calibration', category: 'hardware', title: 'Why do quantum computers need recalibrating?',
    keys: ['calibration', 'recalibrate', 'drift', 'why do results change'],
    body: 'Qubit frequencies and gate pulses drift over hours as the hardware and its environment change. Machines are recalibrated regularly, often daily, and the published error rates come from the last calibration. This is why the same circuit can give measurably different results on the same machine on different days, and why serious work records which calibration it ran against.',
    related: ['real-hardware', 'gate-fidelity', 'noise'],
  },
  {
    id: 'crosstalk', category: 'hardware', title: 'What is crosstalk?',
    keys: ['crosstalk', 'cross talk', 'gates interfering'],
    body: 'Crosstalk is a gate on one qubit disturbing a neighbour it was not meant to touch, either through stray coupling or through control signals leaking. It means the error of a circuit is not simply the sum of its individual gate errors, and it gets worse when many gates run at the same time. Schedulers sometimes deliberately slow a circuit down to avoid it.',
    related: ['noise', 'gate-fidelity', 'connectivity'],
  },
  {
    id: 'routing', category: 'hardware', title: 'What happens when two qubits are not connected?',
    keys: ['routing', 'swap overhead', 'not connected', 'qubit mapping'],
    body: 'Most hardware only allows two qubit gates between neighbours. If your circuit needs a gate between two qubits that are not adjacent, the compiler inserts SWAP gates to walk one of them across the chip. Each SWAP is three two qubit gates, so routing can easily double or triple the real length of a circuit. It is the main reason connectivity matters as much as qubit count.',
    related: ['connectivity', 'transpiler', 'depth'],
  },
  {
    id: 'quantum-volume', category: 'hardware', title: 'What is quantum volume?',
    keys: ['quantum volume', 'qv', 'how to compare machines'],
    body: 'Quantum volume is a single number that tries to capture how large a circuit a machine can run reliably, taking width and depth together rather than counting qubits alone. It rewards good error rates and good connectivity as well as size. It is more honest than a qubit count, though like any single number it can be optimised for, so it is best read alongside the raw error rates.',
    related: ['qubit-count', 'gate-fidelity', 'nisq'],
  },

  // ================================================================ errors
  {
    id: 'depolarising', category: 'errors', title: 'What is a depolarising channel?',
    keys: ['depolarising', 'depolarizing', 'depolarising noise'],
    body: 'Depolarising noise replaces the qubit state with a completely random one, with some small probability, and leaves it alone otherwise. It is the least specific noise model there is, which makes it the usual default when you do not know what is actually going wrong. The Noise Lab in this app lets you dial it up and watch a Bell state lose its correlation.',
    related: ['noise-types', 'noise', 'maximally-mixed'],
  },
  {
    id: 'amplitude-damping', category: 'errors', title: 'What is amplitude damping?',
    keys: ['amplitude damping', 'energy loss', 't1 noise', 'relaxation'],
    body: 'Amplitude damping is the qubit losing energy and falling from ket one towards ket zero, the way an excited atom decays. It is not symmetric: it pushes the state in one particular direction rather than randomising it. This is the noise that T1 measures, and it is why circuits that leave qubits sitting in ket one for a long time do worse than ones that do not.',
    related: ['t1-t2', 'noise-types', 'decoherence'],
  },
  {
    id: 'phase-damping', category: 'errors', title: 'What is phase damping or dephasing?',
    keys: ['phase damping', 'dephasing', 't2 noise', 'losing phase'],
    body: 'Phase damping destroys the relative phase between ket zero and ket one without changing either probability. The Bloch arrow shrinks towards the vertical axis rather than towards a pole. No energy is lost, and yet everything that makes the qubit quantum is. It is usually the faster of the two decay processes, and it is what T2 measures.',
    related: ['t1-t2', 'phase', 'decoherence'],
  },
  {
    id: 'readout-error', category: 'errors', title: 'What is readout error?',
    keys: ['readout error', 'measurement error', 'misread qubit'],
    body: 'Readout error is the machine reporting 1 when the qubit was 0, or the reverse. It is typically around one to a few percent, worse than a good single qubit gate, and it is often asymmetric because a qubit can decay during the measurement itself. It can be partly undone afterwards by measuring the error rates and correcting the statistics, which is the simplest form of error mitigation.',
    related: ['readout', 'mitigation', 'shots'],
  },
  {
    id: 'syndrome', category: 'errors', title: 'How does error correction check for errors without looking?',
    keys: ['syndrome', 'syndrome measurement', 'check without measuring', 'parity check'],
    body: 'The trick is to measure a comparison rather than a value. Extra qubits are used to ask whether two data qubits agree, which reveals nothing about what either one actually is, so the superposition survives. The pattern of those answers is called the syndrome, and it identifies which error occurred without ever collapsing the information you are protecting.',
    related: ['error-correction', 'bit-flip-code', 'surface-code'],
  },
  {
    id: 'steane-code', category: 'errors', title: 'What is the Steane code?',
    keys: ['steane code', 'seven qubit code'],
    body: 'The Steane code protects one logical qubit using seven physical ones, and corrects any single bit flip or phase flip. It is built from a classical Hamming code applied twice over, once for each kind of error, which makes it far more elegant than stacking codes by hand. It is a standard teaching example, though the surface code is what large machines are actually being built around.',
    related: ['shor-code', 'surface-code', 'error-correction'],
  },
  {
    id: 'mitigation', category: 'errors', title: 'What is error mitigation, and how is it different from correction?',
    keys: ['error mitigation', 'mitigation vs correction', 'zero noise extrapolation'],
    body: 'Error correction removes errors during the run and needs many physical qubits per logical one. Error mitigation leaves the errors in place and cleans up the statistics afterwards, using many repeated runs. One common method deliberately makes the noise worse in a controlled way, then extrapolates back to what a noiseless machine would have said. Mitigation works on today machines; correction is what tomorrow needs.',
    related: ['error-correction', 'nisq', 'readout-error'],
  },
  {
    id: 'fault-tolerance', category: 'errors', title: 'What does fault tolerant mean?',
    keys: ['fault tolerant', 'fault tolerance', 'when will it be useful'],
    body: 'A fault tolerant computer keeps working even though its components are failing, because errors are caught and corrected faster than they accumulate, and because the correction machinery does not itself spread errors around. It requires error rates below a threshold and a large overhead in physical qubits. It is the line between the machines that exist now and the ones that could run Shor at a useful size.',
    related: ['threshold', 'error-correction', 'logical-qubit'],
  },

  // ================================================================ applications
  {
    id: 'drug-discovery', category: 'applications', title: 'Will quantum computing help discover drugs?',
    keys: ['drug discovery', 'pharma', 'medicine', 'protein'],
    body: 'The realistic contribution is simulating how molecules bind, which today relies on approximations that quantum chemistry cannot fully justify. A quantum computer could in principle compute those energies exactly. It is a genuine prospect rather than a near term product: current machines are far too small and noisy, and no drug has been designed this way. Anyone claiming otherwise is selling something.',
    related: ['chemistry', 'hamiltonian-simulation', 'nisq'],
  },
  {
    id: 'materials', category: 'applications', title: 'What could quantum computing do for materials?',
    keys: ['materials', 'new materials', 'superconductor design', 'catalyst'],
    body: 'Designing better catalysts, batteries and magnets all come down to computing the behaviour of strongly interacting electrons, which is exactly the problem classical methods struggle with. Nitrogen fixation, the reaction behind fertiliser, is the most quoted example because its industrial process is enormously energy hungry. It needs a fault tolerant machine, not a current one.',
    related: ['chemistry', 'hamiltonian-simulation', 'fault-tolerance'],
  },
  {
    id: 'finance', category: 'applications', title: 'What is quantum computing used for in finance?',
    keys: ['finance', 'banking', 'portfolio', 'risk', 'monte carlo'],
    body: 'The two candidates are portfolio optimisation, which is a hard combinatorial problem, and risk analysis, where amplitude estimation offers a quadratic saving over classical Monte Carlo sampling. Banks fund serious research here. The honest caveat is that a quadratic saving has to overcome a large constant overhead before it wins, so the crossover point is still an open question.',
    related: ['optimisation', 'qaoa', 'big-o'],
  },
  {
    id: 'logistics', category: 'applications', title: 'Can quantum computers solve routing problems?',
    keys: ['logistics', 'routing problem', 'travelling salesman', 'supply chain', 'scheduling'],
    body: 'Vehicle routing and scheduling map naturally onto the kind of optimisation QAOA and quantum annealing target, and there have been many pilot studies with logistics companies. So far none has beaten a good classical solver on a real instance. The value in these pilots is mostly in learning to state the problem in the right form, which is not nothing.',
    related: ['optimisation', 'qaoa', 'annealing'],
  },
  {
    id: 'qrng', category: 'applications', title: 'Can quantum computers generate true random numbers?',
    keys: ['random number', 'qrng', 'true randomness', 'random generator'],
    body: 'Yes, and it is the one quantum application already in commercial use. Put a qubit in superposition, measure it, and the outcome is unpredictable as a matter of physics rather than because the algorithm is complicated. Dedicated quantum random number generators are already sold as hardware, and you can see the principle in this app with a single Hadamard.',
    related: ['superposition', 'measurement', 'qkd'],
  },

  // ================================================================ india
  {
    id: 'india-institutes', category: 'india', title: 'Where is quantum research done in India?',
    keys: ['indian institutes', 'iisc quantum', 'tifr', 'where in india', 'research india'],
    body: 'The National Quantum Mission set up thematic hubs around established groups: quantum computing centred on IISc Bengaluru, communication on IIT Madras, sensing and metrology on IIT Bombay, and materials and devices on IIT Delhi. Beyond those, TIFR, RRI Bengaluru, IISER Pune, the IITs generally and C-DAC all have active work. If you are looking for a place to study, start from the hubs.',
    related: ['nqm', 'careers', 'india-skills'],
  },
  {
    id: 'india-startups', category: 'india', title: 'Are there Indian quantum companies?',
    keys: ['indian startups', 'quantum companies india', 'qpiai', 'industry india'],
    body: 'Yes, and the ecosystem is young but real. QpiAI in Bengaluru works on quantum hardware and software, and there are startups in quantum communication, sensing and software tooling. TCS, Infosys and Wipro all run quantum groups, mostly on applications and algorithms rather than hardware. The mission funds startups directly, so the list changes quickly.',
    related: ['nqm', 'careers', 'india-institutes'],
  },
  {
    id: 'india-qkd', category: 'india', title: 'Has India demonstrated quantum communication?',
    keys: ['india qkd', 'quantum communication india', 'drdo quantum', 'isro quantum'],
    body: 'Yes. DRDO and IIT Delhi demonstrated quantum key distribution over about a hundred kilometres of fibre in 2022, and ISRO demonstrated free space key distribution between two buildings in 2021. Quantum communication is one of the four pillars of the National Quantum Mission, and it is the area where India is closest to deployment rather than research.',
    related: ['qkd', 'nqm', 'quantum-internet'],
  },
  {
    id: 'india-skills', category: 'india', title: 'What should I learn to work in quantum in India?',
    keys: ['skills for quantum india', 'what to study india', 'prepare for quantum job'],
    body: 'Linear algebra and probability first, then Python, then Qiskit or PennyLane. After that pick a direction: algorithms and software need computer science, hardware needs electronics or physics, and error correction needs comfort with abstraction. A bachelor degree with strong linear algebra plus a real project is enough to get an internship. A doctorate is needed for hardware research, not for software work.',
    related: ['maths-needed', 'careers', 'learn-path'],
  },
  {
    id: 'india-education', category: 'india', title: 'Is quantum computing taught in Indian colleges?',
    keys: ['quantum in indian colleges', 'curriculum india', 'aicte quantum', 'teaching india'],
    body: 'It is arriving. The National Quantum Mission includes developing a curriculum with AICTE and setting up teaching labs across engineering colleges, and several IITs and IISc already run courses. The gap it is trying to close is real: most students meet the subject first through a video rather than through anything they can run. That gap is exactly what an app like this one exists to fill.',
    related: ['nqm', 'india-institutes', 'what-is-app'],
  },

  // ================================================================ app
  {
    id: 'modules-badges', category: 'app', title: 'How do the modules and badges work?',
    keys: ['modules', 'badges', 'badge', 'how do modules work'],
    body: 'The lessons are grouped into modules, each ending in a short check. To earn a module badge you have to read every lesson in it and pass the check, not one or the other. Badges appear on your dashboard and feed the progress tracker. The checks are deliberately small: they are there to catch a gap before you move on, not to grade you.',
    related: ['practice-quiz', 'progress-tracking', 'what-is-app'],
  },
  {
    id: 'practice-quiz', category: 'app', title: 'How does the practice section work?',
    keys: ['practice', 'quiz', 'questions', 'how does practice work'],
    body: 'Practice asks questions drawn from the concepts you have studied, and many of them are answered by running a circuit on the simulator rather than by looking up a stored answer. That means the correct answer is computed at the moment you are asked, so it cannot drift away from what the app itself does. Your results feed the mastery estimate on the dashboard.',
    related: ['progress-tracking', 'how-graded', 'modules-badges'],
  },
  {
    id: 'noise-lab-app', category: 'app', title: 'What is the Noise Lab for?',
    keys: ['noise lab', 'noise tab', 'simulate noise', 'try noise'],
    body: 'The Noise Lab runs your circuit many times with realistic errors injected, so you can see what it would do on a real machine rather than on a perfect one. Turn the noise up on a GHZ state and forbidden outcomes start appearing within a few hundred shots. It is the fastest way to understand why depth matters more than qubit count.',
    related: ['noise', 'gate-fidelity', 'real-hardware'],
  },
  {
    id: 'languages', category: 'app', title: 'What languages does the tutor speak?',
    keys: ['language', 'languages', 'hindi', 'tamil', 'change language', 'regional language'],
    body: 'The tutor speaks and listens in nine languages, including Hindi, Tamil, Telugu, Bengali, Marathi, Kannada and Gujarati alongside English. Change it in settings. Speech uses the phone own voice engine, so it works with no internet, and the language you pick applies to both what you hear and what you can say back.',
    related: ['offline', 'avatar', 'how-tutor-works'],
  },
  {
    id: 'avatar', category: 'app', title: 'What is the floating tutor for?',
    keys: ['avatar', 'floating tutor', 'the character', 'tap the tutor'],
    body: 'The figure that moves around the screen is the tutor. Tap it to ask a question in words or by voice, and drag it anywhere if it is in your way. It reacts to what you are doing, so it will offer something relevant to the lesson or the circuit you are looking at. Everything it knows offline comes from the built in knowledge base.',
    related: ['how-tutor-works', 'languages', 'offline'],
  },
  {
    id: 'phasors-view', category: 'app', title: 'What does the Phasors tab show?',
    keys: ['phasors', 'phasor', 'arrows tab', 'complex arrows'],
    body: 'Phasors draws every amplitude as an arrow in its own complex plane: the length is the size of the amplitude and the direction is its phase. The flat view reduces phase to a colour, which cannot show you that two amplitudes are about to cancel. Arrows can. Build a Bell state and the empty rings where 01 and 10 would be are the missing amplitudes made visible.',
    related: ['amplitude', 'phase', 'interference'],
  },
  {
    id: 'progress-tracking', category: 'app', title: 'How does the app track my progress?',
    keys: ['progress', 'progress tracker', 'mastery', 'dashboard'],
    body: 'The dashboard keeps an estimate of how well you know each concept, updated every time you answer a question or finish a challenge. It uses Bayesian knowledge tracing, which means a right answer raises confidence and a wrong one lowers it, weighted by how likely a guess or a slip was. It is stored on your device and nowhere else.',
    related: ['modules-badges', 'practice-quiz', 'offline'],
  },
  {
    id: 'export-qiskit', category: 'app', title: 'Can I export my circuit to Qiskit?',
    keys: ['export', 'qiskit code', 'openqasm', 'get the code', 'copy circuit'],
    body: 'Yes. The code panel next to the builder shows your circuit as Qiskit Python and as OpenQASM, updated as you edit. Copy either one and it will run unchanged on IBM hardware or in a local Qiskit install. The qubit numbering matches Qiskit, with qubit 0 as the rightmost digit, so the outputs line up without any reordering.',
    related: ['how-to-build', 'little-endian', 'real-hardware'],
  },

  // ================================================================ study
  {
    id: 'how-long', category: 'study', title: 'How long does it take to learn quantum computing?',
    keys: ['how long to learn', 'time to learn', 'how many months'],
    body: 'To read circuits, understand superposition and entanglement, and build the standard algorithms yourself, a few focused weeks is realistic if your linear algebra is solid. To do research is years, as with any field. The step most people underestimate is not the physics but the habit of thinking in amplitudes instead of probabilities, and that comes from building things rather than reading.',
    related: ['learn-path', 'maths-needed', 'physics-background'],
  },
  {
    id: 'physics-background', category: 'study', title: 'Do I need a physics background?',
    keys: ['do i need physics', 'physics background', 'without physics', 'engineering student'],
    body: 'For quantum software, no. You need linear algebra, complex numbers and probability, and none of those are physics. Most working quantum software engineers came from computer science. For hardware research the answer changes completely, because you are then building the devices. The subject has a reputation for requiring physics that its software side does not deserve.',
    related: ['maths-needed', 'careers', 'india-skills'],
  },
  {
    id: 'misconceptions', category: 'study', title: 'What do people most often get wrong?',
    keys: ['misconceptions', 'common mistakes', 'what people get wrong', 'myths'],
    body: 'Four things. Superposition is not the qubit secretly being one of the two. Entanglement does not send signals. A quantum computer does not try all answers in parallel and pick the best, because measuring returns only one. And Grover is a quadratic speed-up, not an exponential one. Getting these right puts you ahead of most popular coverage of the subject.',
    related: ['superposition', 'faster-than-light', 'big-o'],
  },
  {
    id: 'practice-how', category: 'study', title: 'What is the best way to practise?',
    keys: ['how to practice', 'best way to practise', 'get better'],
    body: 'Predict before you run. Decide what the state should be, then run the circuit and see whether you were right. Being wrong and finding out why teaches far more than reading a correct explanation. The step slider is the tool for this: when the result surprises you, walk through the circuit one gate at a time and find the exact point where your expectation and the simulator parted company.',
    related: ['step-through', 'learn-path', 'how-to-build'],
  },
  {
    id: 'next-steps', category: 'study', title: 'What should I do after finishing this app?',
    keys: ['what next', 'after this', 'next steps', 'where to go next'],
    body: 'Install Qiskit and run your circuits on a real IBM machine, which are available free in limited amounts. Then work through one algorithm end to end in code rather than in a builder, Shor or QAOA being the usual choices. After that, pick between algorithms, error correction and hardware, because they diverge quickly and it is better to go deep in one.',
    related: ['frameworks', 'resources', 'real-hardware'],
  },
];
