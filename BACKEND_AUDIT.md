# Backend audit — Task 0

Verification pass over the engine, transpilers, grader, grounding loop and server, run
against the code as it exists rather than as documented. Every claim below was checked by
running something, not by reading a comment.

Date: 2026-09-09 · commit `51dbf92` · 337 tests passing.

---

## 1. The brief's stack description does not match this repository

Five points in the supplied architecture are not what is here. This matters because
Tasks 1–6 are specified against it.

| Brief says | Actually here | Checked by |
|---|---|---|
| Rust → WASM statevector simulator | **TypeScript** (`src/core/simulator.ts`) | no `Cargo.toml`, no `.rs`/`.wasm` in the tree; `package.json` has no wasm toolchain |
| PostgreSQL | **SQLite** (`sqlite3`, `server/main.py`) | `init_db()` |
| Redis | **absent** | no dependency, no import |
| Job queue | **absent** — `/simulate` is synchronous | endpoint is a plain `def` |
| Qiskit Aer / PennyLane / Cirq server sims | `main.py` declares all three; **only Qiskit is installed and only Qiskit is cross-checked** | import probe; `crosscheck.py` imports Qiskit alone |

One further structural fact: **the frontend never calls the server.** The only outbound
`fetch` calls are to the LLM provider and to local avatar assets. Every simulation a
learner sees is computed on-device. The FastAPI service is a standalone side-car used for
cross-checking and cohort storage, not a runtime dependency.

None of this is a defect — the app is deliberately offline-first and it works. But a plan
written against Postgres, Redis, a job queue and a WASM core is planning for a different
system, and the difference changes what Tasks 1–6 should build.

---

## 2. Circuit IR as single source of truth — confirmed

`src/core/ir.ts` defines one `Circuit` type. The canvas, the code panel, the simulator,
the grader, the tutor, the optimiser, the noise model and the transpilers all read and
write that same object. No parallel circuit state was found.

The canvas↔code sync is genuinely two-way through the IR: `CodePanel` parses edited
source back into a `Circuit` (`fromQasm`, `fromQiskit`) rather than keeping its own model.

---

## 3. Transpilers

| Direction | Status |
|---|---|
| IR → OpenQASM 3 → IR | Round-trips, **state-verified** (`core.test.ts`) |
| IR → Qiskit → IR | Round-trips, **state-verified** — added in this task (`qiskit-roundtrip.test.ts`, 13 cases) |
| IR → Cirq | **Emit only.** No parser, so no round-trip and no equivalence check |
| IR → PennyLane | **Emit only.** Same |

`fromQiskit` was previously untested despite sitting on a path where a learner types
Python directly into the editor. It now has coverage across every gate family, rotations,
negative and zero angles, comments, imports, a non-`qc` variable name, and unparseable
lines (which it reports rather than dropping silently). No bug was found — the parser was
already correct.

**Gap:** Cirq and PennyLane output is generated and never verified against those
libraries. Neither package is installed in this environment.

---

## 4. Simulator agreement — confirmed for Qiskit

`server/crosscheck.py`, run today:

```
22 circuits · worst disagreement 6.661e-16 · tolerance 1e-10 — all agree
```

Importantly this runs through the **exported OpenQASM**, so it verifies the transpiler and
the engine together rather than either alone. Phase estimation is separately verified
three ways (theory, our engine, Qiskit) in `qpe_crosscheck.py`.

**Gap:** no equivalent cross-check exists for PennyLane or Cirq.

---

## 5. Auto-grader — correct, including the edge cases named

`grade()` compares produced state to target via `fidelity()`, which is
`|<a|b>|²` and therefore **insensitive to global phase** by construction. Covered in
`core.test.ts`:

- a solution differing only by a global phase passes (fidelity 1.0 to 10 dp)
- a structurally different circuit reaching the same state passes
- a near-miss fails with fidelity < 1
- mismatched qubit counts fail with a specific message rather than throwing

There is also a distribution-based mode (`compareCounts`) for challenges where only the
measurement statistics should matter.

---

## 6. AI grounding loop — one real gap

**What is wired and does verify:** the offline repair search in `tutor.ts`. It enumerates
candidate single-gate edits, **runs each on the simulator**, and only surfaces one whose
fidelity against the target clears the bar. `TutorPanel` shows those, and every "Apply
this fix" button comes from a candidate that was executed first. This is sound.

**What is not wired:** `askLlmFix()` in `src/core/llm.ts` — the function that asks a
language model to repair a circuit — is **exported and has no caller anywhere in the
app.** Its doc comment says "the caller runs it on the simulator and discards it if it
does not produce the target", and no caller exists to do that.

So the LLM's role today is prose answers only (`askLlm`, used by `TutorAvatar`), which are
labelled as model-produced rather than verified — an honest design, since prose cannot be
checked the way a circuit can.

The consequence for the plan: **Task 6's "after N failed attempts, offer a
simulator-verified AI hint" has no plumbing.** Building it means wiring `askLlmFix`
behind a verification gate, or deleting it and escalating through `searchRepair` instead.
Either is defensible; it is a decision, not an oversight to code around.

---

## 7. API, storage and error handling

SQLite schema (`learner`, `mastery`, `submission`) is coherent for its scope: per-concept
mastery keyed by learner, submissions recording pass/fidelity/circuit. Endpoints:
`/health`, `/simulate`, `/progress` (GET/POST), `/submission`, `/cohort/{cohort}`,
`/crosscheck`. Errors are raised as `HTTPException` rather than leaking tracebacks.

For the current load — a side-car for cohort reporting — this is adequate. It has no
queue, no migrations, no auth, and no concurrency story, none of which it currently needs.

---

## Summary of gaps

1. **Cirq and PennyLane output is unverified.** Emit-only, no parser, no cross-check.
2. **`askLlmFix` is dead code.** The LLM circuit-repair path is not wired to anything, so
   the verified-AI-hint flow Task 6 asks for does not exist yet.
3. **The documented stack is not the built stack** (WASM / Postgres / Redis / queue).
4. Server-side PennyLane and Cirq backends are declared in `main.py` but the packages are
   not installed here, so those code paths are unexercised.

Nothing found contradicts the physics or the grading. The engine agrees with Qiskit to
floating-point noise, the grader handles the equivalence cases correctly, and the IR is a
genuine single source of truth.
