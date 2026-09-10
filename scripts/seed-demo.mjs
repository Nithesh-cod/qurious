/**
 * Seed the development demo account. Emulator only, by construction.
 *
 *   firebase emulators:start --only auth,firestore
 *   node scripts/seed-demo.mjs --seed-demo
 *
 * The brief asks for a demo login of Richard / test@1234. A shared, published password is
 * fine on a throwaway emulator and is a live vulnerability anywhere else — this password
 * is written in the brief, in FIREBASE_SETUP.md, and now in this file, so it must be
 * treated as public knowledge.
 *
 * Two independent guards, because one is a typo away from failing open:
 *
 *   1. --seed-demo must be passed explicitly. Running the script bare does nothing.
 *   2. FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must both be set. The
 *      emulator sets these; a real project does not, and cannot be made to.
 *
 * There is no flag to override guard 2. That is the point.
 */

import process from 'node:process';

const DEMO_EMAIL = 'richard@qurious.local';
const DEMO_PASSWORD = 'test@1234';
const DEMO_NAME = 'Richard';

if (!process.argv.includes('--seed-demo')) {
  console.error('Refusing to run without --seed-demo.');
  process.exit(1);
}

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storeHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!authHost || !storeHost) {
  console.error(
    'Refusing to run outside the emulator.\n\n' +
    'FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST must both be set, which the\n' +
    'Firebase emulator does for you:\n\n' +
    '  firebase emulators:start --only auth,firestore\n\n' +
    'This account uses a password published in the documentation. It must never exist in\n' +
    'a real project, so there is deliberately no way to force this.'
  );
  process.exit(1);
}

const admin = await import('firebase-admin').catch(() => {
  console.error('firebase-admin is not installed. Run:  npm i -D firebase-admin');
  process.exit(1);
});

admin.default.initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-qurious' });

try {
  let user;
  try {
    user = await admin.default.auth().getUserByEmail(DEMO_EMAIL);
    console.log('Demo account already present, refreshing it.');
  } catch {
    user = await admin.default.auth().createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      displayName: DEMO_NAME,
      emailVerified: true,      // skip the verification gate locally
    });
  }

  await admin.default.auth().setCustomUserClaims(user.uid, { role: 'learner' });

  await admin.default.firestore().doc(`users/${user.uid}`).set({
    displayName: DEMO_NAME,
    email: DEMO_EMAIL,
    role: 'learner',
    institution: 'Demo College',
    goal: 'Try the app',
    points: 0,
    createdAt: admin.default.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`\nSeeded ${DEMO_EMAIL} / ${DEMO_PASSWORD} (emulator only).`);
  console.log('Role: learner. Promote with grant-admin.mjs if you need to test admin screens.\n');
  process.exit(0);
} catch (err) {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
}
