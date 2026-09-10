/**
 * Firebase, made optional.
 *
 * The app's whole argument is that it works on a phone with no network and no account.
 * Adding Firebase must not quietly undo that, so nothing here is imported at startup and
 * nothing here is required to run:
 *
 *   - Configuration comes from VITE_FIREBASE_* variables. With none set, `configured()`
 *     is false, every accessor returns null, and the app behaves exactly as it did before
 *     Firebase existed. That is the shipped default.
 *   - The SDK is loaded by dynamic import on first use, so the ~120 KB of auth and
 *     Firestore never enters the initial bundle a learner downloads to read a lesson.
 *
 * The result is a build that has accounts if you give it a project and is unchanged if
 * you do not.
 */

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

/**
 * Read config from the build environment.
 *
 * These are not secrets. A Firebase web API key identifies the project; it does not grant
 * access — Security Rules do that. Shipping it in the bundle is the documented, intended
 * arrangement, which is exactly why the rules file matters so much.
 */
export function readConfig(): FirebaseConfig | null {
  const env = (import.meta as { env?: Record<string, string> }).env ?? {};
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim();
  const appId = env.VITE_FIREBASE_APP_ID?.trim();

  if (!apiKey || !projectId || !appId) return null;

  return {
    apiKey,
    projectId,
    appId,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: env.VITE_FIREBASE_SENDER_ID?.trim(),
  };
}

/** True when this build was given a project. False in the default offline-only build. */
export function configured(): boolean {
  return readConfig() !== null;
}

let appPromise: Promise<FirebaseApp | null> | null = null;

/** The initialised app, or null when unconfigured. Loaded on first use, then cached. */
export function getApp(): Promise<FirebaseApp | null> {
  if (appPromise) return appPromise;
  const cfg = readConfig();
  if (!cfg) {
    appPromise = Promise.resolve(null);
    return appPromise;
  }
  appPromise = import('firebase/app').then(({ initializeApp, getApps, getApp: existing }) =>
    getApps().length ? existing() : initializeApp(cfg)
  );
  return appPromise;
}

let authPromise: Promise<Auth | null> | null = null;

export function getAuthClient(): Promise<Auth | null> {
  if (authPromise) return authPromise;
  authPromise = getApp().then(async (app) => {
    if (!app) return null;
    const { getAuth, browserLocalPersistence, setPersistence } = await import('firebase/auth');
    const auth = getAuth(app);
    // Survive an app restart, which on a phone is the normal case rather than the
    // exception. Sessions still expire; Firebase refreshes the ID token hourly and a
    // revoked account stops refreshing.
    await setPersistence(auth, browserLocalPersistence).catch(() => { /* private mode */ });
    return auth;
  });
  return authPromise;
}

let dbPromise: Promise<Firestore | null> | null = null;

export function getDb(): Promise<Firestore | null> {
  if (dbPromise) return dbPromise;
  dbPromise = getApp().then(async (app) => {
    if (!app) return null;
    const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } =
      await import('firebase/firestore');
    // Offline persistence is not a nicety here, it is the product: a learner on a train
    // must still see their progress. Firestore serves from cache and reconciles later.
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  });
  return dbPromise;
}

/** Reset the memoised clients. Tests only. */
export function _reset(): void {
  appPromise = null;
  authPromise = null;
  dbPromise = null;
}
