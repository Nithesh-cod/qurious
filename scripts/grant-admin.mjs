/**
 * Grant or revoke the admin role. The only way the first admin is ever created.
 *
 *   node scripts/grant-admin.mjs --email someone@example.com
 *   node scripts/grant-admin.mjs --email someone@example.com --revoke
 *
 * Why this is a script and not an endpoint
 * ----------------------------------------
 * Every "make me an admin" route is a privilege-escalation bug waiting for its first
 * caller, no matter how well it is guarded. There is no such route in this codebase.
 * Promotion requires the service-account credentials, which live on a project owner's
 * machine or in a secrets manager and never in the app, the repository, or a build.
 *
 * Credentials
 * -----------
 * Read from GOOGLE_APPLICATION_CREDENTIALS — a path to a service-account JSON that this
 * script never prints and never copies. It is not accepted as an inline argument, because
 * arguments end up in shell history and in process listings.
 *
 * After a change the user must sign out and back in: custom claims are minted into the ID
 * token at sign-in, so an existing session keeps the old role until it refreshes.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

const email = arg('email');
const revoke = has('revoke');

if (!email) {
  console.error(`
Grant or revoke the Qurious admin role.

  node scripts/grant-admin.mjs --email someone@example.com
  node scripts/grant-admin.mjs --email someone@example.com --revoke

Requires GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON.
`);
  process.exit(1);
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error(
    'GOOGLE_APPLICATION_CREDENTIALS is not set.\n' +
    'Point it at your service-account JSON, e.g.\n' +
    '  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\\\keys\\\\qurious-admin.json"   (PowerShell)\n' +
    '  export GOOGLE_APPLICATION_CREDENTIALS=~/keys/qurious-admin.json        (bash)\n\n' +
    'Never commit that file, and never paste its contents into a terminal or a chat.'
  );
  process.exit(1);
}

// Fail early and clearly if the path is wrong, rather than inside the SDK.
try {
  JSON.parse(readFileSync(credPath, 'utf8'));
} catch {
  console.error(`Could not read a JSON service account at: ${credPath}`);
  process.exit(1);
}

const admin = await import('firebase-admin').catch(() => {
  console.error('firebase-admin is not installed. Run:  npm i -D firebase-admin');
  process.exit(1);
});

admin.default.initializeApp({ credential: admin.default.credential.applicationDefault() });

const role = revoke ? 'learner' : 'admin';

try {
  const user = await admin.default.auth().getUserByEmail(email);

  if (!revoke && !user.emailVerified) {
    console.error(
      `${email} has not verified their email address.\n` +
      'Verify it before granting admin — an unverified address is not proven to belong ' +
      'to the person you think you are promoting.'
    );
    process.exit(1);
  }

  await admin.default.auth().setCustomUserClaims(user.uid, { role });
  await admin.default.firestore().doc(`users/${user.uid}`).set({ role }, { merge: true });

  await admin.default.firestore().collection('auditLogs').add({
    action: revoke ? 'role.revoke' : 'role.grant',
    actorUid: null,                       // a CLI run by a project owner, not an in-app admin
    detail: { uid: user.uid, email, role, via: 'grant-admin.mjs' },
    at: admin.default.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\n${email} is now: ${role}`);
  console.log('They must sign out and back in — claims are minted at sign-in.\n');

  if (!revoke) {
    console.log(
      'Reminder: enrol this account in multi-factor authentication.\n' +
      'setUserRole and the admin screens require a second factor on the session, so an\n' +
      'admin without MFA will be refused even though the claim is set.\n'
    );
  }
  process.exit(0);
} catch (err) {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
}
