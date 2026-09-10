/**
 * Progress sync, and the merge rule that makes it safe.
 *
 * The brief asks for Firestore to be the source of truth for progress. Taken literally
 * that would break the product: a learner with no account, or no signal, would lose the
 * thing the app is for. So the rule is narrower and, I think, the only defensible one:
 *
 *   **Signed out — the device is the source of truth.** Nothing changes from before.
 *   **Signed in — the cloud is the source of truth, and merging is monotonic.**
 *
 * Monotonic means the merge only ever adds. Progress here is a set of things that
 * happened: lessons finished, challenges solved, days practised. Those facts do not
 * un-happen, so union is the correct join and there is no such thing as a conflict to
 * resolve. A learner who finishes a lesson on a phone in aeroplane mode and another on a
 * laptop ends up with both, whichever order the writes land in.
 *
 * The one field that is not a set is `mastery`, a per-concept probability. There the
 * higher value wins, because mastery is evidence-driven and the device with more evidence
 * is the one that saw more answers.
 *
 * What is deliberately *not* synced: the saved circuit, the theme and the language. Those
 * are properties of a device, not of a person, and syncing them would mean a phone
 * dictating a laptop's theme.
 */

import { getDb } from './firebase';
import type { Account } from './auth';

/** The subset of local state that represents progress rather than device preference. */
export interface SyncableProgress {
  lessonsDone: string[];
  solved: string[];
  practiceDays: string[];
  quizAnswers: Record<string, boolean>;
  mastery: Record<string, number>;
}

const union = (a: string[] = [], b: string[] = []): string[] =>
  [...new Set([...a, ...b])].sort();

/**
 * Merge two snapshots of progress.
 *
 * Pure, total, and order-independent — merge(a, b) equals merge(b, a) — which is what
 * makes it safe to run on either side of a slow connection without deciding who "won".
 */
export function mergeProgress(a: SyncableProgress, b: SyncableProgress): SyncableProgress {
  const quizAnswers: Record<string, boolean> = { ...a.quizAnswers };
  for (const [id, right] of Object.entries(b.quizAnswers ?? {})) {
    // A correct answer is a fact; a wrong one is a moment. Once right, stays right.
    quizAnswers[id] = quizAnswers[id] === true || right === true;
  }

  const mastery: Record<string, number> = { ...a.mastery };
  for (const [concept, value] of Object.entries(b.mastery ?? {})) {
    const mine = mastery[concept];
    mastery[concept] = mine === undefined ? value : Math.max(mine, value);
  }

  return {
    lessonsDone: union(a.lessonsDone, b.lessonsDone),
    solved: union(a.solved, b.solved),
    practiceDays: union(a.practiceDays, b.practiceDays),
    quizAnswers,
    mastery,
  };
}

/** Everything empty — the identity for `mergeProgress`. */
export const EMPTY_PROGRESS: SyncableProgress = {
  lessonsDone: [], solved: [], practiceDays: [], quizAnswers: {}, mastery: {},
};

const DOC = 'current';

/**
 * Pull, merge, push.
 *
 * Returns the merged progress so the caller can adopt it locally. On any failure it
 * returns the local copy unchanged: a sync that cannot reach the network must never cost
 * a learner the work they did offline.
 */
export async function syncProgress(
  account: Account | null,
  local: SyncableProgress
): Promise<{ merged: SyncableProgress; synced: boolean; reason?: string }> {
  if (!account) return { merged: local, synced: false, reason: 'signed out' };
  if (!account.emailVerified) {
    return { merged: local, synced: false, reason: 'email not verified' };
  }

  const db = await getDb();
  if (!db) return { merged: local, synced: false, reason: 'no account system in this build' };

  try {
    const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const ref = doc(db, 'users', account.uid, 'progress', DOC);

    const snap = await getDoc(ref);
    const remote = snap.exists() ? (snap.data() as Partial<SyncableProgress>) : {};
    const merged = mergeProgress(local, { ...EMPTY_PROGRESS, ...remote });

    await setDoc(
      ref,
      {
        ...merged,
        // The rules check this matches the caller's uid, so a document can never claim to
        // belong to someone else even if the path were guessed.
        userId: account.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { merged, synced: true };
  } catch (e) {
    return { merged: local, synced: false, reason: (e as Error).message };
  }
}
