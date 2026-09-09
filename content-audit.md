# Content audit

What each concept claims, how it was checked, and what remains for a human.

There are two kinds of verification here and they are not equivalent. Conflating them
would be the whole problem this file exists to prevent.

- **Simulator-verified** — a machine ran the circuit and compared the number. This is a
  proof, and it runs on every commit. If the content and the physics disagree, the build
  fails.
- **Source-cited** — a person can check the explanation against a named, reliable
  reference. This is a pointer, not a proof. It has *not* been machine-diffed against the
  source text, and this file does not pretend otherwise.

Anything that is neither is flagged `NEEDS REVIEW` and should be read by someone who
knows the subject before it is defended to anyone.

---

## How the automated half works

| Check | File | What it catches |
|---|---|---|
| Lesson circuits produce the stated outcome | `tests/algorithms.test.ts` | A lesson whose circuit stops doing what the prose says |
| Numbers quoted in `watch` lines match the state | `tests/content-claims.test.ts` | "Both outcomes at 50%" after the circuit changed |
| Challenge briefs match their solutions | `tests/algorithm-challenges.test.ts` | A brief that lies about its own answer |
| Computed tutor answers | `tests/knowledge-derived.test.ts` | 897 entries that cannot contradict the simulator, because they *are* it |
| Engine vs Qiskit Aer | `server/crosscheck.py` | Our simulator drifting from the reference implementation |
| Phase estimation, three ways | `server/qpe_crosscheck.py` | Bit-ordering errors that look right until they are not |
| Curriculum shape and prerequisites | `tests/curriculum-structure.test.ts` | Broken prerequisite ids, cycles, stranded lessons |
| Readability | `tests/lesson-prose.test.ts` | Prose drifting away from beginner-readable |

**Claim checking is scoped to `watch` lines, deliberately.** A watch line's contract is
"this is what you will see when you run this circuit", so every number in it is an
assertion. Body prose legitimately uses illustrative numbers — the measurement lesson
says "an amplitude of 0.707 gives a probability of 0.5" while its own circuit is an RY
rotation with magnitudes 0.866 and 0.5. Checking the body flagged that as a defect when
the lesson is correct, which is how a useful checker becomes one people switch off.

---

## Primary sources

Standard, well-established references. No blogs, no unsourced sites, no content farms.

- **[NC]** Nielsen & Chuang, *Quantum Computation and Quantum Information*,
  10th Anniversary Edition, Cambridge University Press, 2010.
- **[IBM]** IBM Quantum Learning — <https://learning.quantum.ibm.com>
- **[QK]** Qiskit documentation — <https://quantum.cloud.ibm.com/docs> / `qiskit.org`

Chapter-level citations only. Where I was not certain of a precise section number I have
given the chapter rather than invent a decimal, because a confidently wrong citation is
worse than a coarse one.

---

## Concept register

| Concept | Lesson | Numeric check | Sources | Status |
|---|---|---|---|---|
| Qubit, ket notation, register order | `qubits` | simulator | NC ch.1; IBM; QK | verified + cited |
| Superposition, Hadamard | `superposition` | simulator | NC ch.1; IBM | verified + cited |
| Born rule, measurement, collapse | `measurement` | simulator | NC ch.2; IBM | verified + cited |
| Bloch sphere | `bloch` | simulator | NC ch.1; IBM | verified + cited |
| Phase, Z/S/T family | `phase` | simulator | NC ch.4; QK | verified + cited |
| Interference, cancellation | `interference` | simulator | NC ch.1, ch.6 | verified + cited |
| Entanglement, Bell states | `entanglement` | simulator | NC ch.1, ch.2 | verified + cited |
| GHZ states | `ghz` | simulator | NC ch.1 | verified + cited |
| Superdense coding | `superdense` | simulator | NC ch.2 | verified + cited |
| Teleportation (deferred measurement) | `teleportation` | simulator | NC ch.1, ch.4 | verified + cited |
| Oracles, phase kickback | `oracles` | simulator | NC ch.1, ch.6 | verified + cited |
| Deutsch–Jozsa | `deutsch` | simulator | NC ch.1 | verified + cited |
| Bernstein–Vazirani | `bernstein-vazirani` | simulator | NC ch.1 (problem class) | verified + cited |
| Grover search, diffuser | `grover` | simulator | NC ch.6 | verified + cited |
| Quantum Fourier transform | `qft` | simulator + Qiskit | NC ch.5 | verified + cited |
| Phase estimation | `phase-estimation` | simulator + Qiskit ×3 | NC ch.5 | verified + cited |
| Noise channels, trajectories | Noise Lab | Monte Carlo | NC ch.8 | verified + cited |
| **Complex numbers, Euler's formula** | `pre-complex` | partial — one circuit | standard undergraduate mathematics | cited |
| **Vectors, basis, inner product** | `pre-vectors` | partial — one circuit | NC ch.2 (§2.1 linear algebra); standard | cited |
| **Matrices, unitarity, inverse** | `pre-matrices` | simulator (S · S† = I) | NC ch.2 | verified + cited |
| **Probability, amplitudes, normalisation** | `pre-probability` | simulator | NC ch.2 | verified + cited |
| **Angles, half-angle convention** | `pre-trig` | simulator (RY π/2) | NC ch.4 (rotation operators) | verified + cited |

---

## NEEDS REVIEW

Honest list of what a machine cannot settle and I have not independently confirmed in
this pass.

1. **Cross-source reconciliation has not been performed mechanically.** The brief asks
   for each concept to be checked against two to three independent sources and
   discrepancies reconciled. The citations above are accurate references to standard
   works, but I have not fetched each source and diffed it line-by-line against our
   prose in this session. Treat the register as "traceable", not "reconciled".
2. **Historical and attribution claims** — e.g. Deutsch–Jozsa described as the first
   proof of provable separation. Widely stated, but the precise framing is a matter of
   scholarly nuance and deserves a specialist read.
3. **Hardware and industry figures** in the knowledge base (error rates, qubit counts,
   who is ahead) age fast. They are written cautiously and mostly qualitatively, but
   should be re-read before any public presentation.
4. **The India-specific entries** (National Quantum Mission hubs, DRDO/ISRO QKD
   demonstrations, company names) are from general knowledge with a May 2026 cutoff.
   Verify against current official sources before quoting them to a jury.
5. **Cirq and PennyLane exports are unverified** — emit-only, no parser, no cross-check
   against those libraries. See `BACKEND_AUDIT.md`.

---

## Rules for adding content

1. Never state a constant, gate matrix or example state from memory. Put the circuit in
   the lesson and let the simulator produce the number.
2. If a claim can be executed, it must be — a `watch` line is checked automatically, so
   put verifiable numbers there.
3. Cite the source when adding a conceptual explanation, and add a row here.
4. If you cannot verify it and cannot source it, mark it `NEEDS REVIEW` rather than
   letting it pass silently. Content that quietly assumes it is right is the failure mode
   this whole file is built against.
