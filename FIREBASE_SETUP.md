# Firebase setup — step by step

Everything in the repository is written and tested. What is left needs a Firebase project,
which only a project owner can create. Follow this once and the accounts, roles, sync and
admin features described in `BACKEND_ARCHITECTURE.md` come alive.

**Time:** about 45 minutes, most of it waiting for deploys.
**You need:** a Google account, Node 20+, and a card on file *only* if you enable Cloud
Functions (Blaze plan — the free tier still covers this app's usage).

Two rules before you start:

- **Never paste a service-account JSON into a chat, a commit, or a terminal argument.** It
  is the entire project in one file.
- **The app keeps working throughout.** Until you set the environment variables in step 7,
  the build is exactly what you have today: offline, no accounts. Nothing breaks while you
  are half-way through.

---

## 1 · Create the project

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Name it `qurious` (the console will make the real id, e.g. `qurious-4f21c`).
3. Google Analytics: **off**. The app has its own local, opt-in instrumentation and does
   not need a second one that phones home — that would contradict the privacy policy.
4. Wait for it to finish, then **Continue**.

## 2 · Register the web app

1. On the project overview, click the **web icon** (`</>`).
2. Nickname `qurious-web`. **Do not** tick Firebase Hosting — the app deploys to GitHub
   Pages already.
3. Click **Register app**. You will see a `firebaseConfig` block. **Copy it somewhere
   temporary** — you need six values in step 7.

> These values are not secrets. A web API key identifies the project; it grants nothing.
> Security Rules are the access control, which is why step 5 matters most.

## 3 · Turn on Authentication

1. **Build → Authentication → Get started**.
2. **Sign-in method** tab:
   - **Email/Password** → enable → **Save**. (Leave "Email link" off.)
   - **Google** → enable → pick a support email → **Save**.
3. **Templates** tab → **Email address verification** → check the sender name reads
   *Qurious*, not the default project id.
4. **Settings → User actions** → confirm **Enable create (sign-up)** is on.

## 4 · Create the Firestore database

1. **Build → Firestore Database → Create database**.
2. **Start in production mode.** Never test mode — test mode is world-readable, and you
   are about to deploy real rules anyway.
3. Location: **asia-south1 (Mumbai)** for an India-based audience. *This cannot be changed
   later.*

## 5 · Deploy the security rules — do this before any real data exists

```bash
npm install -g firebase-tools
firebase login
cd "N:\MY PROJECTS\SIH\quantum-learning"
firebase use --add            # pick your project, alias it "default"
firebase deploy --only firestore:rules,firestore:indexes
```

Verify in the console that **Firestore → Rules** ends with:

```
match /{document=**} {
  allow read, write: if false;
}
```

That final deny is what makes every collection you add later locked until you write a rule
for it.

### Test the rules before trusting them

```bash
firebase emulators:start --only firestore,auth
```

Rules are the one place where "it seemed to work in the app" is not verification — the app
only ever sends requests it believes are valid. Try to read another user's document from
the emulator UI and confirm it is refused.

## 6 · Deploy the Cloud Functions

Functions need the **Blaze** plan. The free allowance (2M invocations/month) is far beyond
this app's usage; you are giving a card, not spending.

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

Five functions should deploy: `setUserRole`, `onProgressWritten`, `rebuildLeaderboard`,
`reportFailedAdminLogin`, `tutorProxy`.

If deploy fails with a permissions error, wait two minutes — enabling Blaze provisions APIs
in the background — and retry.

## 7 · Point the app at the project

Add to `.env` (already gitignored — **never** commit it):

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=qurious-4f21c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=qurious-4f21c
VITE_FIREBASE_APP_ID=1:123...:web:abc...
VITE_FIREBASE_SENDER_ID=123...
VITE_FIREBASE_STORAGE_BUCKET=qurious-4f21c.appspot.com
```

Then:

```bash
npm run dev
```

Sign-up should now work. Without these variables the app stays exactly as it is today, so
you can back out at any point by removing them.

> **For the public GitHub Pages build:** decide deliberately whether the deployed site
> should have accounts. If yes, add these as repository secrets and wire them into the
> workflow. If no, leave the workflow alone — CI has no `.env`, so the public site stays
> account-free, which is the current behaviour.

## 8 · Make yourself the first admin

There is no in-app path to this, on purpose.

1. **Sign up in the app with your own email, and verify it.** The script refuses to promote
   an unverified address.
2. Get a service-account key: **Project settings → Service accounts → Generate new private
   key**. Save it *outside* the repository, e.g. `C:\keys\qurious-admin.json`.
3. Run:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\qurious-admin.json"
npm i -D firebase-admin
node scripts/grant-admin.mjs --email you@example.com
```

4. **Sign out and back in.** Custom claims are minted into the ID token at sign-in, so your
   existing session still has the old role.

To remove an admin later: `node scripts/grant-admin.mjs --email them@example.com --revoke`

## 9 · Enrol MFA on the admin account — required, not optional

`setUserRole` and the admin screens check for a second factor **on the session**, not just
the claim. An admin without MFA will be refused even though the role is set. That is
deliberate: a stolen password alone must not be able to promote anyone.

1. **Authentication → Settings → Multi-factor authentication → Enable SMS**.
2. Add your phone under **Trusted phone numbers** for testing.
3. In the app, sign out and back in and complete the second factor.

## 10 · Turn on App Check

Keeps traffic that is not your app out of Firestore and the functions.

1. **Build → App Check → Get started**.
2. Web app → **reCAPTCHA Enterprise** (or v3) → follow the prompts → copy the site key.
3. Add `VITE_FIREBASE_APPCHECK_KEY=...` to `.env`.
4. Leave enforcement **off** for a few days and watch the metrics first. Turning it on
   immediately will lock out your own app if anything is misconfigured.

## 11 · Seed the demo account — local only

The brief asks for `Richard` / `test@1234` for development. **This must never exist in the
production project.** Run it only against the emulator:

```bash
firebase emulators:start --only auth,firestore
node scripts/seed-demo.mjs --seed-demo     # refuses unless FIRESTORE_EMULATOR_HOST is set
```

If you ever find that account in the production console, delete it immediately and treat
the password as public — it is in this document and in the brief.

---

## Order matters

Two steps are sequenced deliberately and doing them late is the common way projects leak:

- **Rules before data** (step 5 before step 8). A production-mode database with no rules
  deployed still refuses everything, but the moment you relax it for testing you have a
  window. Deploy the real rules first.
- **Verify your email before promoting yourself** (step 8.1). An unverified address is not
  proven to belong to you.

## When something goes wrong

| Symptom | Cause |
|---|---|
| `Missing or insufficient permissions` | Rules working as intended. Check you are signed in and verified. |
| Role still `learner` after granting | Token not refreshed — sign out and back in. |
| `auth/unauthorized-domain` on Google sign-in | Add your domain under **Authentication → Settings → Authorised domains**. |
| Functions deploy fails right after enabling Blaze | APIs still provisioning. Wait two minutes, retry. |
| App works but never syncs | `.env` not picked up — restart the dev server; Vite reads it at startup. |

## What you should never do

- Commit `.env`, a service-account JSON, or `.firebaserc`. All are gitignored; keep it that way.
- Add a "make me admin" endpoint, however well guarded.
- Relax the final `allow read, write: if false` to get something working.
- Ship the `Richard` demo account to production.
