# Backend architecture

How accounts, progress and admin work — and, just as importantly, what happens when there
is no account and no network, which is the normal case for this app.

Written alongside the implementation. Everything described here exists in the repository;
nothing is deployed, because deployment needs a Firebase project only a project owner can
create. The setup steps are at the end.

---

## 0. Two things the brief assumed that are not true here

The brief specifies a stack this repository does not have. Flagging rather than guessing,
as instructed.

| Brief says | Actually here |
|---|---|
| Rust → WASM simulator | **TypeScript** (`src/core/simulator.ts`). No `Cargo.toml`, no `.rs`, no `.wasm`. |
| PostgreSQL | **SQLite**, in a standalone FastAPI side-car (`server/main.py`). |
| Redis, job queue | Neither exists. `/simulate` is synchronous. |

**There is therefore no Firebase-versus-PostgreSQL conflict to resolve**, because there is
no PostgreSQL. The SQLite side-car stores cohort submissions for a classroom demo and is
not on any path the app depends on — the frontend never calls it. Two options, both fine:

- Leave it. It duplicates nothing that Firestore will own, and it works offline on a
  teacher's laptop.
- Retire it once Firestore cohort reporting lands, and keep `crosscheck.py` only.

Recommendation: **leave it until Firestore cohort reporting is actually in use**, then
retire it in one commit rather than running two half-migrated stores.

---

## 1. The rule that shapes everything: local first, cloud optional

The product's central claim — the one in the pitch and the one judges scored — is that it
runs on a mid-range phone with no account and no signal. Making Firestore the unconditional
source of truth would delete that.

So the rule is narrower:

- **Signed out → the device is the source of truth.** Identical to the app before Firebase
  existed. This is the default build.
- **Signed in and verified → the cloud is the source of truth**, and merging is
  *monotonic*.

### Why merging is safe

Progress is a set of things that **happened**: lessons finished, challenges solved, days
practised. Those facts do not un-happen, so the join is a union and **there is no such
thing as a conflict to resolve**. `mergeProgress()` is pure, total and order-independent —
`merge(a,b) === merge(b,a)` — which is what lets a phone in aeroplane mode and a laptop
both write without either having to "win".

The one non-set field is `mastery`, a per-concept probability. The **higher value wins**,
because mastery is evidence-driven and the higher figure came from the device that saw
more answers.

Not synced: saved circuit, theme, language. Those are properties of a device, not a person.

---

## 2. Firestore data model

```
users/{uid}
  displayName    string
  email          string
  institution?   string          // only because cohort reporting uses it
  goal?          string
  role           'admin'|'learner'   // MIRROR ONLY — see §3
  points         number          // written by Cloud Function, never the client
  lessonsDone    number
  challengesSolved number
  createdAt, lastActiveAt   timestamp

  progress/current            // one doc; mirrors the local save
    userId       string        // must equal the caller's uid (enforced in rules)
    lessonsDone  string[]
    solved       string[]
    practiceDays string[]      // ISO days
    quizAnswers  map<string, bool>
    mastery      map<string, number>
    updatedAt    timestamp

  badges/{badgeId}            // read-only to the learner
    topicId, name, emoji, earnedAt

  pointsHistory/{entryId}     // read-only to the learner
    delta, reason, at

  practiceSessions/{id}       // owner-writable
  noiseLabSessions/{id}       // owner-writable
  circuits/{id}               // playground saves; owner-only both ways

leaderboard/{uid}             // materialised hourly by Cloud Function
  displayName, points, rank, updatedAt
  // Carries no email and nothing addressable.

modules/{id}, topics/{id}, lessons/{id}, challenges/{id}
  // Admin-writable curriculum. Same Circuit IR and lesson schema as src/content —
  // no parallel content system.

auditLogs/{id}                // append-only, server-written
  action, actorUid, detail, at

rateLimits/{uid}_{key}        // fixed-window counters, server-only
adminLoginFailures/{b64email} // failed admin sign-in counter
```

### Content: Firestore or the bundle?

Lessons currently ship **in the bundle**, which is why they work offline. Admin editing
implies Firestore. The resolution: Firestore is the **editing surface**, the bundle stays
the **offline fallback**. An admin edits in Firestore; a build snapshots content into the
bundle. A learner with no signal reads the snapshot. Nothing regresses.

---

## 3. Roles: exactly two, and the client cannot grant either

`admin` and `learner`. No third tier.

The role lives in a **Firebase Auth custom claim**, set only by the Admin SDK. The `role`
field on the user document is a **mirror** so admin screens can query by it — never an
authority. `firestore.rules` refuses any client write that changes it (`roleUnchanged()`),
and refuses a `create` whose role is anything but `learner`.

**There is no in-app path to becoming an admin.** The first one is created from the command
line by a project owner:

```
node scripts/grant-admin.mjs --email someone@example.com
```

which requires `GOOGLE_APPLICATION_CREDENTIALS` — credentials that live on an owner's
machine, never in the repository or a build. After that, `setUserRole` (a Cloud Function)
can promote others, and it requires the caller to **already be an admin with a second
factor on the session** (`sign_in_second_factor` on the token). A stolen password alone
cannot grant a role.

`grant-admin.mjs` also refuses to promote an address that has not been verified: an
unverified address is not proven to belong to the person being promoted.

---

## 4. Security rules

`firestore.rules`, in order of importance:

1. **Deny by default.** The final `match /{document=**} { allow read, write: if false; }`
   means a collection added later is locked until someone writes a rule. Forgetting fails
   closed.
2. **Role from the token, never a document.**
3. **Ownership checked on the document** (`resource.data.userId`), not the path — a path
   can be guessed.
4. **Verified email required for writes.** Reading unverified is harmless; writing creates
   records tied to an address nobody has proven they control.
5. **Badges, points and the leaderboard are not client-writable at all.** A badge you can
   award yourself is not a badge.
6. **Audit logs are append-only and nobody can edit them, including admins.** A log that
   can be rewritten is not evidence.

Test them with the emulator (`firebase emulators:start`) before deploying — rules are the
one thing where "it seemed to work" is not verification.

---

## 5. Cloud Functions

In `functions/src/index.ts`. The dividing line: **if a learner could benefit from lying
about it, it belongs on the server.**

| Function | Trigger | Why not client-side |
|---|---|---|
| `setUserRole` | callable | Privilege escalation. Requires admin + MFA. |
| `onProgressWritten` | Firestore write | Points recomputed from stored progress, not accepted as a number. |
| `rebuildLeaderboard` | hourly | Client-side would mean every learner reading every other learner's document. |
| `reportFailedAdminLogin` | callable | Locks an admin account after 5 failures; writes the audit trail. |
| `tutorProxy` | callable | Fixed-window throttle on expensive calls. |

**Rate limiting**: App Check keeps non-app traffic out; the per-user fixed window in
`throttle()` stops our own app being used as an amplifier. It costs one document read per
call rather than the Redis this project does not have.

**Password hashing**: Firebase Auth only (scrypt). There is no custom password store and
must never be one.

---

## 6. Load balancing the simulation side-car

The FastAPI service is optional and only handles circuits above the 12-qubit on-device cap.
If it ever takes real traffic: **Cloud Run**, min instances 0, max 10, concurrency 8,
scaling on CPU > 60%. Autoscaling to zero matters because the expected steady-state load
is zero — the app does not call it.

---

## 7. Secrets

Scanned across all 22 commits of history, all tracked files, and the built bundle: **no
key, service-account JSON or private key has ever been committed.** `.env` is gitignored;
`functions/.gitignore` excludes `*serviceAccount*.json`.

The Firebase **web API key is not a secret** — it identifies the project and grants
nothing. Security Rules are the access control, which is why §4 carries the weight.

---

## 8. What is built vs what needs a project

**Built and in the repository:** rules, indexes, `firebase.json`, all five Cloud Functions,
the admin bootstrap script, the client auth layer, the sync layer with a tested merge, and
18 tests covering the parts testable without a project.

**Needs a Firebase project** (a project owner must do this): create the project, enable
providers, deploy rules and functions, enrol MFA, bootstrap the first admin.

Until then `configured()` is false, every accessor returns null, and **the app behaves
exactly as it does today** — which is the point. Adding Firebase must not be able to break
the offline build, so the unconfigured path is the default and is tested.
