/**
 * Accounts: sign-up, sign-in, verification, roles.
 *
 * Two rules shape everything here.
 *
 * **The role is never decided on this side.** `roleOf()` reads a custom claim out of the
 * ID token, which is signed by Firebase and set only by the Admin SDK. There is no code
 * path in this file — or anywhere in the client — that can make someone an admin. If this
 * module were rewritten by an attacker in their own browser, the worst they could do is
 * lie to their own UI; the Security Rules would still refuse every write.
 *
 * **Signed out is a supported state, not a failure.** The app works with no account at
 * all: progress lives on the device. Signing in adds sync and a leaderboard. So every
 * function here returns a clear "not configured" rather than throwing, and callers are
 * expected to carry on without it.
 */

import { getAuthClient, getDb, configured } from './firebase';

export type Role = 'admin' | 'learner';

export interface Account {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  role: Role;
  /** True when this session was established with a second factor. */
  mfa: boolean;
}

export interface Profile {
  displayName: string;
  /** Optional. Collected because cohort reporting uses it, and for no other reason. */
  institution?: string;
  /** Optional, free text, used to pick a starting module. */
  goal?: string;
}

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; code: string; message: string };

/** Unconfigured builds say so once, in the same shape as any other failure. */
const NOT_CONFIGURED: AuthResult = {
  ok: false,
  code: 'auth/not-configured',
  message: 'This build has no account system. Your progress is saved on this device.',
};

export const accountsAvailable = configured;

/**
 * Turn a Firebase user into our own shape.
 *
 * `getIdTokenResult` is what carries the claims. Anything the client believes about roles
 * comes from here and nowhere else.
 */
async function toAccount(user: {
  uid: string; email: string | null; displayName: string | null; emailVerified: boolean;
  getIdTokenResult: (force?: boolean) => Promise<{ claims: Record<string, unknown> }>;
}, forceRefresh = false): Promise<Account> {
  const token = await user.getIdTokenResult(forceRefresh);
  const claimed = token.claims.role;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    // Anything that is not literally 'admin' is a learner. No clever coercion, because a
    // truthy check here would be a privilege bug.
    role: claimed === 'admin' ? 'admin' : 'learner',
    mfa: Boolean(token.claims.sign_in_second_factor),
  };
}

/** Human wording for the codes Firebase returns. Never leaks whether an address exists. */
function explain(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      // One message for all three on purpose: distinguishing them tells an attacker
      // which addresses are registered.
      return 'That email and password do not match.';
    case 'auth/email-already-in-use':
      return 'There is already an account with that email. Try signing in instead.';
    case 'auth/weak-password':
      return 'Use at least six characters.';
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No connection. You can keep learning offline — progress is saved on this device.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    default:
      return 'That did not work. Please try again.';
  }
}

const fail = (e: unknown): AuthResult => {
  const code = (e as { code?: string })?.code ?? 'auth/unknown';
  return { ok: false, code, message: explain(code) };
};

// ---------------------------------------------------------------- sign up / in

export async function signUpWithEmail(
  email: string,
  password: string,
  profile: Profile
): Promise<AuthResult> {
  const auth = await getAuthClient();
  if (!auth) return NOT_CONFIGURED;

  try {
    const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } =
      await import('firebase/auth');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: profile.displayName });
    await sendEmailVerification(cred.user);
    await writeProfile(cred.user.uid, profile, email);
    return { ok: true, account: await toAccount(cred.user, true) };
  } catch (e) {
    return fail(e);
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const auth = await getAuthClient();
  if (!auth) return NOT_CONFIGURED;
  try {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, account: await toAccount(cred.user, true) };
  } catch (e) {
    return fail(e);
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const auth = await getAuthClient();
  if (!auth) return NOT_CONFIGURED;
  try {
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    const account = await toAccount(cred.user, true);
    // Google addresses arrive already verified, so there is nothing to gate on.
    await writeProfile(account.uid, { displayName: account.displayName ?? 'Learner' }, account.email);
    return { ok: true, account };
  } catch (e) {
    return fail(e);
  }
}

export async function signOut(): Promise<void> {
  const auth = await getAuthClient();
  if (!auth) return;
  const { signOut: fbSignOut } = await import('firebase/auth');
  await fbSignOut(auth);
}

// ---------------------------------------------------------------- lifecycle

export async function sendVerificationEmail(): Promise<AuthResult> {
  const auth = await getAuthClient();
  if (!auth?.currentUser) return NOT_CONFIGURED;
  try {
    const { sendEmailVerification } = await import('firebase/auth');
    await sendEmailVerification(auth.currentUser);
    return { ok: true, account: await toAccount(auth.currentUser) };
  } catch (e) {
    return fail(e);
  }
}

export async function sendPasswordReset(email: string): Promise<AuthResult | { ok: true }> {
  const auth = await getAuthClient();
  if (!auth) return NOT_CONFIGURED;
  try {
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(auth, email);
  } catch {
    // Deliberately swallowed. Reporting "no such user" here would turn the reset form
    // into a way of testing which addresses are registered.
  }
  return { ok: true };
}

/** Subscribe to sign-in state. Returns an unsubscribe, or a no-op when unconfigured. */
export function watchAccount(cb: (a: Account | null) => void): () => void {
  let stop = () => { /* replaced once the SDK loads */ };
  let cancelled = false;

  getAuthClient().then(async (auth) => {
    if (!auth || cancelled) { cb(null); return; }
    const { onAuthStateChanged } = await import('firebase/auth');
    const unsub = onAuthStateChanged(auth, async (user) => {
      cb(user ? await toAccount(user) : null);
    });
    if (cancelled) unsub();
    else stop = unsub;
  }).catch(() => cb(null));

  return () => { cancelled = true; stop(); };
}

/**
 * Re-read the role from a freshly minted token.
 *
 * Claims are baked in at sign-in, so someone promoted while signed in keeps the old role
 * until the token refreshes. Admin screens call this rather than trusting a stale token.
 */
export async function refreshRole(): Promise<Account | null> {
  const auth = await getAuthClient();
  if (!auth?.currentUser) return null;
  return toAccount(auth.currentUser, true);
}

// ---------------------------------------------------------------- profile

async function writeProfile(uid: string, profile: Profile, email: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  await setDoc(
    doc(db, 'users', uid),
    {
      displayName: profile.displayName,
      email,
      ...(profile.institution ? { institution: profile.institution } : {}),
      ...(profile.goal ? { goal: profile.goal } : {}),
      // The rules require this to be exactly 'learner' on create; only a Cloud Function
      // can ever change it.
      role: 'learner',
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Whether a feature that writes to the cloud should be offered.
 *
 * Unverified accounts can read and can keep learning locally; they cannot write records
 * tied to an address nobody has proven they control. The rules enforce this — this is
 * only so the UI can explain it before the write fails.
 */
export function canSync(a: Account | null): boolean {
  return Boolean(a && a.emailVerified);
}
