/**
 * Cloud Functions — the operations a client must not be trusted with.
 *
 * The dividing line is simple: if a learner could benefit from lying about it, it belongs
 * here. Awarding a badge, adding points, changing a role, and writing the audit log are
 * all things a modified client would happily do for itself, so none of them are writable
 * from the client at all (see firestore.rules) and all of them happen here under the
 * Admin SDK, which bypasses rules by design.
 *
 * Nothing in this file reads a secret from source. Configuration comes from the runtime
 * environment; the service account is the one Cloud Functions provides automatically.
 */

import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// Keep a lid on cost and on damage: an unbounded function is an unbounded bill and an
// unbounded blast radius.
setGlobalOptions({ maxInstances: 10, region: 'asia-south1' });

// ---------------------------------------------------------------- audit

type AuditAction =
  | 'role.grant' | 'role.revoke'
  | 'content.create' | 'content.update' | 'content.delete'
  | 'admin.login.failed';

/**
 * Append one entry to the audit log.
 *
 * Deliberately never throws into the caller's path. An action that succeeded must not be
 * reported as failed because logging it failed — but the logging failure itself is
 * surfaced to the function logs so it cannot pass unnoticed.
 */
async function audit(
  action: AuditAction,
  actorUid: string | null,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    await db.collection('auditLogs').add({
      action,
      actorUid,
      detail,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('audit write failed', { action, actorUid, err });
  }
}

// ---------------------------------------------------------------- roles

/** Callers must already be admins. The first admin is created by the CLI script instead. */
function requireAdmin(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (req.auth?.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  /**
   * Multi-factor is required to *act* as an admin, not merely to hold the claim.
   *
   * Firebase puts a `sign_in_second_factor` claim on the token when the session was
   * established with a second factor. Checking it here means a stolen password alone
   * cannot grant a role, even if the account it belongs to is an admin account.
   */
  if (!req.auth?.token.sign_in_second_factor) {
    throw new HttpsError(
      'permission-denied',
      'This action needs a second factor. Sign out and sign in again with MFA.'
    );
  }
  return uid;
}

/**
 * Grant or revoke the admin role.
 *
 * There is deliberately no self-service path to this anywhere in the app. It is callable
 * only by an existing admin with MFA, and the very first admin is bootstrapped from the
 * command line by a project owner (see scripts/grant-admin.mjs).
 */
export const setUserRole = onCall(async (req) => {
  const actor = requireAdmin(req);
  const { uid, role } = req.data as { uid?: string; role?: 'admin' | 'learner' };

  if (!uid || (role !== 'admin' && role !== 'learner')) {
    throw new HttpsError('invalid-argument', 'Need a uid and a role of admin or learner.');
  }
  if (uid === actor && role === 'learner') {
    // Removing your own admin rights can strand a project with no administrator at all.
    throw new HttpsError('failed-precondition', 'Ask another admin to revoke your own role.');
  }

  await admin.auth().setCustomUserClaims(uid, { role });
  // The mirror exists only so admin screens can query by role; the token stays the truth.
  await db.doc(`users/${uid}`).set({ role }, { merge: true });
  await audit(role === 'admin' ? 'role.grant' : 'role.revoke', actor, { uid, role });

  return { ok: true, uid, role };
});

// ---------------------------------------------------------------- badges and points

/**
 * Award badges and points from progress, server-side.
 *
 * The client reports what it did; the server decides what that is worth. Points are
 * recomputed from the stored progress rather than accepted as a number, so a client
 * claiming ten thousand points changes nothing.
 */
export const onProgressWritten = onDocumentWritten(
  'users/{uid}/progress/{docId}',
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after.data();
    if (!after) return;

    const lessonsDone: string[] = Array.isArray(after.lessonsDone) ? after.lessonsDone : [];
    const solved: string[] = Array.isArray(after.solved) ? after.solved : [];
    const practiceDays: string[] = Array.isArray(after.practiceDays) ? after.practiceDays : [];

    // Kept in step with src/core/points.ts. The client shows a figure instantly; this is
    // the one that counts.
    const points =
      lessonsDone.length * 10 +
      solved.length * 25 +
      Math.min(practiceDays.length, 14) * 5;

    await db.doc(`users/${uid}`).set(
      {
        points,
        lessonsDone: lessonsDone.length,
        challengesSolved: solved.length,
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);

/**
 * Rebuild the leaderboard on a schedule rather than on every read.
 *
 * Computing it client-side would mean every learner reading every other learner's
 * document, which is both a privacy problem and a bill. This writes a small public
 * collection carrying only a display name, points and rank.
 */
export const rebuildLeaderboard = onSchedule('every 60 minutes', async () => {
  const snap = await db.collection('users').orderBy('points', 'desc').limit(100).get();

  const batch = db.batch();
  snap.docs.forEach((doc, i) => {
    const d = doc.data();
    batch.set(db.doc(`leaderboard/${doc.id}`), {
      displayName: d.displayName ?? 'Anonymous',
      points: d.points ?? 0,
      rank: i + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  console.log(`leaderboard rebuilt: ${snap.size} entries`);
});

// ---------------------------------------------------------------- rate limiting

/**
 * Per-user throttle for expensive calls.
 *
 * App Check keeps traffic that is not our app out; this keeps our own app from being used
 * as an amplifier. A fixed window is coarse but it is honest about what it does, and it
 * costs one document read per call rather than a Redis dependency this project does not
 * have.
 */
async function throttle(uid: string, key: string, limit: number, windowMs: number): Promise<void> {
  const ref = db.doc(`rateLimits/${uid}_${key}`);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const windowStart: number = data?.windowStart ?? 0;
    const count: number = data?.count ?? 0;

    if (now - windowStart > windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }
    if (count >= limit) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.');
    }
    tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
  });
}

/**
 * Record a failed admin sign-in and lock the account out after repeated failures.
 *
 * Called by the client on an auth failure for an address that holds the admin role. It is
 * only a signal — the real boundary is still the password and the second factor — but it
 * turns a silent brute-force attempt into something visible in the audit log.
 */
export const reportFailedAdminLogin = onCall(async (req) => {
  const email = String((req.data as { email?: string })?.email ?? '').slice(0, 320);
  if (!email) throw new HttpsError('invalid-argument', 'Need an email.');

  const ref = db.doc(`adminLoginFailures/${Buffer.from(email).toString('base64url')}`);
  const snap = await ref.get();
  const count = (snap.data()?.count ?? 0) + 1;

  await ref.set(
    { count, lastAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  await audit('admin.login.failed', null, { email, count });

  if (count >= 5) {
    // Disabling is reversible by a project owner and is far better than letting an
    // automated attempt run indefinitely.
    try {
      const user = await admin.auth().getUserByEmail(email);
      if (user.customClaims?.role === 'admin') {
        await admin.auth().updateUser(user.uid, { disabled: true });
        console.warn('admin account disabled after repeated failures', { uid: user.uid });
      }
    } catch {
      // No such user: nothing to disable, and we must not confirm that either way.
    }
  }
  return { ok: true };
});

/** Example of a throttled expensive endpoint; the tutor's model calls route through this. */
export const tutorProxy = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  await throttle(uid, 'tutor', 60, 60 * 60 * 1000);
  return { ok: true };
});
