<p align="center">
  <img src="public/brand/logo.png" width="120" alt="Qurious">
</p>

<h1 align="center">Qurious</h1>
<p align="center"><em>Learn quantum computing by building it.</em></p>

<p align="center">
  Smart India Hackathon 2026 &middot; <b>SIH26140</b> &middot; Team <b>X FORCE</b><br>
  AI-Based Interactive Quantum Algorithm Learning Platform &middot; Smart Education
</p>

---

A quantum lab, a self-checking AI tutor and a real-machine noise simulator in one app.
It runs in a browser and installs as an offline Android APK.

## What it does

**Build circuits and watch the state.** Drag or tap gates onto a canvas. A full statevector
simulator runs on the device — up to 12 qubits, no server, no account. Amplitudes, Bloch
spheres, measurement outcomes and a probability table update as you go.

**Write it as code, either way round.** The same circuit exports to OpenQASM 3, Qiskit,
Cirq and PennyLane. Edit the code and the canvas rebuilds; edit the canvas and the code
follows. Both write the same object, so they cannot drift apart.

**A tutor that checks itself.** It proposes an answer, runs it on the simulator, and throws
the answer away if the output disagrees with the claim. With no network it answers from
1,090 topics: 193 written by hand, and 897 that it computes on the spot by running the
circuit in question, so they cannot contradict the simulator. It labels which of the
three — written, computed, or a configured language model — produced the answer.

**The Noise Lab.** Run your circuit the way a real machine would — depolarising Pauli
errors, amplitude damping, dephasing and readout flips, as Monte Carlo trajectories.
A Bell state at today's superconducting error rates produces |01⟩ and |10⟩, outcomes
ideal physics forbids. Four presets: Ideal, Trapped ion, Today's superconducting,
Early hardware.

**Graded on physics, not on string matching.** Challenges compare the state your circuit
produces against the target with a global-phase-insensitive fidelity, so a different but
correct answer passes.

**A tutor you can see.** A rigged 3D avatar that talks, listens for "hey tutor", gestures,
and wanders the screen. On Android it uses the platform's own TextToSpeech and
SpeechRecognizer, in nine Indian languages.

**Algorithms, not just gates.** Oracles and phase kickback, Deutsch–Jozsa,
Bernstein–Vazirani, Grover, GHZ states, superdense coding, teleportation, the quantum
Fourier transform and phase estimation — each a runnable circuit, not a diagram.

Also: 16 lessons across 5 modules, each ending in a check that earns a badge;
23 challenges, 19 quiz questions, Bayesian Knowledge Tracing over a concept graph,
and an instructor view.

## Correctness

The simulator is cross-checked against Qiskit Aer over 22 circuits. Worst disagreement:
**6.66 × 10⁻¹⁶**.

Lesson content is held to the same standard: `tests/algorithms.test.ts` asserts every
physics claim the algorithm lessons make against the simulator, so prose that lies about
its own circuit fails the build. Phase estimation gets a second, independent check —
its bit ordering is confirmed against Qiskit rather than against our own engine, because
a shared misunderstanding between simulator and test would otherwise go unnoticed.

```bash
npx vitest run                    # 312 tests
python server/crosscheck.py       # the Qiskit comparison (needs qiskit + qiskit-aer)
python server/qpe_crosscheck.py   # phase estimation, verified independently
```

## Running it

```bash
npm install
npm run dev
```

Build the web bundle, or the Android APK:

```bash
npm run build
npm run apk       # needs the Android SDK; writes Qurious.apk to the parent folder
```

The APK's launcher icons and splash screens are generated from `public/brand/logo.png`:

```bash
python scripts/make-android-branding.py
```

## Connecting a language model (optional)

The tutor works with no key at all. To let it answer beyond the built-in topics, open
**Settings** in the app and paste a key — it is stored in your own browser and never
leaves the device except to the provider you chose. Groq, Gemini, OpenRouter and a local
Ollama are supported.

Never commit a key. `.env` is gitignored; `.env.example` shows the variable names, and a
key baked in at build time would ship inside the bundle for anyone to read.

## Layout

```
src/core/      simulator, circuit IR, transpilers, noise, grading, knowledge base, tutor
src/ui/        canvas, code panel, state views, Noise Lab, 3D avatar
src/content/   lessons, challenges, quizzes — data, not code
tests/         312 tests: physics, content claims, prose readability, and the Qiskit cross-check fixtures
server/        optional FastAPI service and the Qiskit comparison script
scripts/       APK build and Android branding generation
docs/          the SIH submission deck and the competitive comparison
```

## Licence

MIT — see [LICENSE](LICENSE).
