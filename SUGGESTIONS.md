# Suggestions

For review, not for automatic implementation. Ordered by what I think the payoff is per
unit of work, with the reasoning stated so you can disagree with it.

---

## Where the product actually stands

Worth being clear before proposing more, because the honest summary is unusual: the
differentiator here is not any single feature, it is that **the content cannot lie about
its own physics**. 448 tests, 22 circuits cross-checked against Qiskit Aer to 6.66e-16,
897 tutor answers computed at the moment of asking rather than stored, numeric claims in
lesson prose checked against the simulator that produces them. Most educational software
cannot say any of that.

Every suggestion below is judged against whether it protects or dilutes that.

---

## High payoff

**1. Localisation of lesson content, not just the tutor's voice.**
The tutor already speaks and listens in nine languages, but every lesson, quiz and
challenge brief is English-only. For the stated audience — Tier-2 and Tier-3 colleges —
that is the single biggest reach limitation left. The content is already data rather than
code, so translation is a content job, not an engineering one. Start with Hindi and Tamil
and measure whether completion actually moves before doing all nine.

**2. On-device model fallback for offline hints.**
The hint ladder ends in a verified repair from the offline search, which works with no
network. The language-model rung needs one. A small quantised model running locally would
close that, and the verification gate already built means a weak local model is *safe* to
use — anything it proposes is executed before display, so the worst case is that it gets
discarded and the offline answer is shown. Few products can adopt a small model this
cheaply, precisely because of the gate.

**3. Teacher curriculum authoring.**
The scaling argument in the pitch is that a subject teacher can add material without an
engineer. Today that is true in principle — lessons are data — and false in practice,
because adding one means editing TypeScript. A simple authoring form that writes the same
objects, plus the existing verification suite run against the result, would make the claim
literally true. This is the suggestion most likely to matter in a year.

**4. Accessibility beyond contrast.**
Contrast is now measured in both themes. Keyboard navigation of the circuit canvas, screen
reader labelling of the state views, and reduced-motion handling for the 3D animations are
not. A drag-and-drop-only builder excludes anyone who cannot drag, and that is a
correctness problem rather than a nicety.

---

## Medium payoff

**5. Spaced repetition over the existing mastery model.**
Bayesian knowledge tracing already estimates per-concept mastery, and quiz items are
already tagged by concept. Scheduling review by decaying mastery is a small addition on
top of machinery that exists, and retention is the thing a course like this is actually
judged on.

**6. Cohort leaderboard, carefully.**
Points and streaks exist per learner; the server has a cohort endpoint. A class-level
board is a short step. The caution: leaderboards reward speed and volume, and this app
rewards understanding. If it ships, rank by concepts mastered rather than by points, or it
will teach people to farm easy challenges.

**7. Verify the Cirq and PennyLane exports.**
Both are emit-only with no parser and no cross-check — the only place in the codebase
where output is generated and never verified. The Qiskit path shows the pattern: export,
run in the real library, compare statevectors. Until then those two exports are the least
trustworthy thing shipped, which is uncomfortable given everything else is checked.

**8. Wire the circuit playground as a first-class surface.**
The builder can already be used for free experimentation, but a learner has to know to
clear it and start over. A dedicated "try any gate on one qubit and watch" surface, linked
from every gate mentioned in a lesson, would lower the barrier to the thing the app is
best at.

---

## Lower payoff, or deferred with reasons

**9. Real hardware submission.** Tempting for a demo and a poor trade for a learner: an
IBM queue can take hours, which breaks the tight feedback loop the whole design depends
on. The Noise Lab already teaches what hardware feels like without the wait. If added, it
should be an export-and-inspect flow, not the default path.

**10. Rust/WASM simulator.** The plan this work came from assumed one; the built simulator
is TypeScript and agrees with Qiskit to floating-point noise. Rewriting it would risk the
one thing the project has actually proven in exchange for speed nobody has complained
about. Revisit only if profiling on a real phone shows the simulator — not rendering — is
the bottleneck.

**11. Postgres, Redis, a job queue.** Same reasoning. The frontend never calls the server;
every simulation a learner sees is computed on-device, which is what makes the app work
offline. Adding infrastructure the product does not use would be complexity with no user
on the other end of it.

**12. Social features beyond a cohort view.** Sharing circuits and commenting sound
appealing and bring moderation, abuse and privacy obligations that a small team should not
take on without a specific reason.

---

## Two risks worth naming

**Content volume is the real constraint, not features.** Sixteen quantum lessons plus five
maths ones is a strong foundation and not yet a course. The temptation will be to
generate more with a model; the reason this app is trustworthy is that it does not do
that. Whatever is added should go through the same verification, and that has a cost
per lesson which should be planned for rather than discovered.

**The knowledge base's India-specific and hardware-specific entries will age.** They are
written cautiously and mostly qualitatively, which helps, but qubit counts, error rates
and mission details move. Re-read them before any public presentation. `content-audit.md`
flags them.
