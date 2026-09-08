/**
 * The second batch of written entries, checked the way the first batch is.
 *
 * Integrity — links resolving, bodies existing, nothing unspeakable — is covered by the
 * loops in knowledge.test.ts, which run over every entry from every source. What is not
 * covered there, and is the thing most likely to be quietly wrong, is whether a new entry
 * can actually be *reached*. An entry nobody's phrasing finds is the same as an entry
 * that was never written, and it fails silently: the tutor just says it does not know.
 *
 * So every new topic gets a question asked the way a learner would ask it.
 */

import { describe, expect, it } from 'vitest';
import { EXTRA_ENTRIES } from '../src/core/knowledgeExtra';
import { CURATED_ENTRIES, search, byId } from '../src/core/knowledge';

const top = (q: string) => search(q)[0]?.entry.id;
const within = (q: string, n = 3) => search(q, n).map(m => m.entry.id);

describe('the second batch is wired in', () => {
  it('adds a substantial number of written topics', () => {
    expect(EXTRA_ENTRIES.length).toBeGreaterThanOrEqual(70);
    expect(CURATED_ENTRIES.length).toBeGreaterThanOrEqual(175);
  });

  it('has no id that collides with the first batch', () => {
    const ids = CURATED_ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is all hand-written, none of it computed', () => {
    expect(EXTRA_ENTRIES.every(e => !e.computed)).toBe(true);
  });
});

describe('every new topic can be found by asking for it', () => {
  const cases: [question: string, expected: string][] = [
    // basics
    ['what is a quantum state', 'quantum-state'],
    ['why must the squares add up to one', 'normalisation'],
    ['why is the bloch arrow short', 'purity-length'],
    ['how do I tell if two qubits are entangled', 'product-vs-entangled'],
    ['what is a w state', 'w-state'],
    ['can you measure in the x basis', 'basis-change'],
    ['what is an expectation value', 'expectation-value'],
    ['what is an observable', 'observable'],
    ['what is the uncertainty principle', 'uncertainty'],
    ['what is the maximally mixed state', 'maximally-mixed'],
    ['what is monogamy of entanglement', 'monogamy'],
    ['what is the chsh inequality', 'chsh'],
    ['what is a stabiliser state', 'stabiliser'],
    ['what is the clifford group', 'clifford'],
    ['what are magic states', 'magic-states'],
    // gates
    ['what does the controlled phase gate do', 'cp-gate'],
    ['what does the y gate do', 'y-gate'],
    ['what does the dagger mean', 'dagger'],
    ['what is the sqrt x gate', 'sqrt-x'],
    ['what is a native gate set', 'native-gates'],
    ['why is rz free', 'virtual-z'],
    ['how do multi controlled gates work', 'multi-controlled'],
    ['what is euler decomposition', 'euler-decomposition'],
    ['what is the iswap gate', 'iswap'],
    ['what is the fredkin gate', 'fredkin'],
    ['what is gate fidelity', 'gate-fidelity'],
    // algorithms
    ['what is amplitude amplification', 'amplitude-amplification'],
    ['how many grover iterations do I need', 'grover-iterations'],
    ['what is quantum counting', 'quantum-counting'],
    ['what is order finding', 'order-finding'],
    ['what is the swap test', 'swap-test'],
    ['what is the hadamard test', 'hadamard-test'],
    ['what is entanglement swapping', 'entanglement-swapping'],
    ['what is hamiltonian simulation', 'hamiltonian-simulation'],
    ['what is trotterisation', 'trotter'],
    ['what is an ansatz', 'ansatz'],
    ['what is a barren plateau', 'barren-plateaus'],
    ['what is a quantum walk', 'quantum-walk'],
    // maths
    ['what does the ket notation mean', 'bra-ket'],
    ['what is the inner product', 'inner-product'],
    ['what is an eigenvector', 'eigenvector'],
    ['what is the conjugate transpose', 'adjoint'],
    ['why do phases use e to the i theta', 'euler-formula'],
    ['why are angles in radians', 'radians'],
    ['what is a complex conjugate', 'complex-conjugate'],
    ['why is the matrix order reversed', 'matrix-order'],
    ['what is the difference between a quadratic and exponential speed up', 'big-o'],
    // hardware
    ['how do photonic quantum computers work', 'photonic'],
    ['what are neutral atom quantum computers', 'neutral-atom'],
    ['what are silicon spin qubits', 'spin-qubit'],
    ['what is a topological qubit', 'topological'],
    ['why do quantum computers need to be cold', 'cryostat'],
    ['how does a machine read a qubit', 'readout'],
    ['why do quantum computers need recalibrating', 'calibration'],
    ['what is crosstalk', 'crosstalk'],
    ['what is swap overhead', 'routing'],
    ['what is quantum volume', 'quantum-volume'],
    // errors
    ['what is a depolarising channel', 'depolarising'],
    ['what is amplitude damping', 'amplitude-damping'],
    ['what is dephasing', 'phase-damping'],
    ['what is readout error', 'readout-error'],
    ['what is a syndrome measurement', 'syndrome'],
    ['what is the steane code', 'steane-code'],
    ['what is error mitigation', 'mitigation'],
    ['what does fault tolerant mean', 'fault-tolerance'],
    // applications
    ['will quantum computing help drug discovery', 'drug-discovery'],
    ['what could quantum do for materials', 'materials'],
    ['what is quantum computing used for in finance', 'finance'],
    ['can quantum computers solve routing problems', 'logistics'],
    ['can quantum computers generate random numbers', 'qrng'],
    // india
    ['where is quantum research done in india', 'india-institutes'],
    ['are there indian quantum companies', 'india-startups'],
    ['has india demonstrated quantum communication', 'india-qkd'],
    ['what skills do I need for a quantum job in india', 'india-skills'],
    ['is quantum computing taught in indian colleges', 'india-education'],
    // app
    ['how do badges work', 'modules-badges'],
    ['how does the practice section work', 'practice-quiz'],
    ['what is the noise lab for', 'noise-lab-app'],
    ['can I change the language', 'languages'],
    ['what is the floating tutor', 'avatar'],
    ['what does the phasors tab show', 'phasors-view'],
    ['how does the app track my progress', 'progress-tracking'],
    ['can I export my circuit to qiskit', 'export-qiskit'],
    // study
    ['how long does it take to learn quantum computing', 'how-long'],
    ['do I need a physics background', 'physics-background'],
    ['what do people get wrong about quantum', 'misconceptions'],
    ['what is the best way to practise', 'practice-how'],
    ['what should I do after this app', 'next-steps'],
  ];

  for (const [q, expected] of cases) {
    it(`"${q}" reaches ${expected}`, () => {
      expect(byId(expected), expected).toBeDefined();
      // Top three rather than top one: several of these sit next to a closely related
      // topic, and offering the neighbour first is a reasonable answer, not a failure.
      expect(within(q)).toContain(expected);
    });
  }

  it('covers every entry in the batch', () => {
    const tested = new Set(cases.map(c => c[1]));
    const missing = EXTRA_ENTRIES.map(e => e.id).filter(id => !tested.has(id));
    expect(missing).toEqual([]);
  });
});

describe('the new entries do not crowd out the old ones', () => {
  it('still answers the original questions with the original entries', () => {
    expect(top('what is a qubit')).toBe('qubit');
    expect(top('explain superposition')).toBe('superposition');
    expect(top('what is entanglement')).toBe('entanglement');
    expect(top('what does the hadamard gate do')).toBe('hadamard');
    expect(top('how does grover search work')).toBe('grover');
    expect(top('what is decoherence')).toBe('decoherence');
    expect(top('what is the national quantum mission')).toBe('nqm');
  });

  it('still says nothing when nothing was asked', () => {
    for (const q of ['hi', 'hey', 'ok', 'yes', 'no', 'um', 'a', 'the', 'is', 'it']) {
      expect(search(q), q).toEqual([]);
    }
    for (const q of ['what is the weather in chennai', 'who won the match', 'order me a pizza']) {
      expect(search(q), q).toEqual([]);
    }
  });
});
