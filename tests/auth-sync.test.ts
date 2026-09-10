/**
 * Accounts and sync — the parts that can be tested without a Firebase project.
 *
 * There is no project here, and there should not need to be one for the properties that
 * matter most. Three things are testable as pure logic, and they are exactly the three
 * that would be dangerous to get wrong:
 *
 *   1. The app is unchanged when Firebase is not configured. That is the shipped default,
 *      and a regression would silently break offline use for everyone.
 *   2. The merge is monotonic and order-independent, so syncing can never lose work.
 *   3. Nothing in the client can grant a role.
 *
 * The rules file and the Cloud Functions are checked separately, by the emulator, in the
 * setup steps handed to the team.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeProgress, EMPTY_PROGRESS, type SyncableProgress } from '../src/core/sync';
import { canSync, type Account } from '../src/core/auth';
import { configured, readConfig } from '../src/core/firebase';

const p = (over: Partial<SyncableProgress> = {}): SyncableProgress => ({ ...EMPTY_PROGRESS, ...over });

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('an unconfigured build is the old build', () => {
  it('reports itself unconfigured when no VITE_FIREBASE_* variables are set', () => {
    // This is the default for every build the team currently ships.
    expect(readConfig()).toBeNull();
    expect(configured()).toBe(false);
  });

  it('never imports the SDK at module scope', () => {
    // A static import would pull ~120 KB into the initial bundle for every learner,
    // including those who will never sign in. Every SDK import must be dynamic.
    const src = read('../src/core/firebase.ts');
    const statics = [...src.matchAll(/^import\s+(?!type\b)[^;]*from\s+'firebase[^']*'/gm)];
    expect(statics.map(m => m[0])).toEqual([]);
  });
});

describe('merging progress cannot lose work', () => {
  it('unions the things that happened', () => {
    const phone = p({ lessonsDone: ['qubits'], solved: ['ch-bell'], practiceDays: ['2026-09-01'] });
    const laptop = p({ lessonsDone: ['bloch'], solved: ['ch-flip'], practiceDays: ['2026-09-02'] });
    const m = mergeProgress(phone, laptop);
    expect(m.lessonsDone).toEqual(['bloch', 'qubits']);
    expect(m.solved).toEqual(['ch-bell', 'ch-flip']);
    expect(m.practiceDays).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('is order-independent, so neither device has to win', () => {
    const a = p({ lessonsDone: ['x'], mastery: { qubit: 0.8 }, quizAnswers: { q1: true } });
    const b = p({ lessonsDone: ['y'], mastery: { qubit: 0.3 }, quizAnswers: { q1: false } });
    expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
  });

  it('keeps a right answer right', () => {
    // Otherwise a stale device could un-answer a question the learner got correct.
    const m = mergeProgress(p({ quizAnswers: { q1: true } }), p({ quizAnswers: { q1: false } }));
    expect(m.quizAnswers.q1).toBe(true);
  });

  it('takes the higher mastery, because that device saw more evidence', () => {
    const m = mergeProgress(p({ mastery: { phase: 0.2 } }), p({ mastery: { phase: 0.9 } }));
    expect(m.mastery.phase).toBeCloseTo(0.9, 9);
  });

  it('is monotonic: merging never shrinks anything', () => {
    const local = p({ lessonsDone: ['a', 'b'], solved: ['s1'] });
    const remote = p({ lessonsDone: ['b'] });
    const m = mergeProgress(local, remote);
    expect(m.lessonsDone.length).toBeGreaterThanOrEqual(local.lessonsDone.length);
    expect(m.solved).toContain('s1');
  });

  it('treats empty as the identity', () => {
    const local = p({ lessonsDone: ['a'], mastery: { q: 0.4 } });
    expect(mergeProgress(local, EMPTY_PROGRESS)).toEqual(local);
  });
});

describe('roles cannot be granted from the client', () => {
  const auth = read('../src/core/auth.ts');

  it('never calls setCustomUserClaims', () => {
    // That API only exists in the Admin SDK, and its presence here would mean a service
    // account had been shipped to the browser.
    expect(auth).not.toMatch(/setCustomUserClaims/);
  });

  it('derives the role only from a token claim', () => {
    expect(auth).toMatch(/getIdTokenResult/);
    // Strict equality against the literal — a truthy check would be a privilege bug.
    expect(auth).toMatch(/claimed === 'admin'/);
  });

  it('the rules refuse a client-written role', () => {
    const rules = read('../firestore.rules');
    expect(rules).toMatch(/roleUnchanged\(\)/);
    expect(rules).toMatch(/request\.resource\.data\.role == 'learner'/);
    // Deny-by-default has to be the last word.
    expect(rules.trimEnd()).toMatch(/allow read, write: if false;[\s}]*$/);
  });

  it('badges and points are not client-writable', () => {
    const rules = read('../firestore.rules');
    const badges = rules.slice(rules.indexOf('match /badges/'), rules.indexOf('match /pointsHistory/'));
    expect(badges).toMatch(/allow write: if false;/);
  });
});

describe('gating', () => {
  const acct = (over: Partial<Account> = {}): Account => ({
    uid: 'u1', email: 'a@b.c', displayName: 'A', emailVerified: true,
    role: 'learner', mfa: false, ...over,
  });

  it('lets a verified account sync', () => {
    expect(canSync(acct())).toBe(true);
  });

  it('refuses an unverified one', () => {
    expect(canSync(acct({ emailVerified: false }))).toBe(false);
  });

  it('signed out is not an error, just not syncing', () => {
    expect(canSync(null)).toBe(false);
  });
});

describe('the admin bootstrap script', () => {
  const script = read('../scripts/grant-admin.mjs');

  it('reads credentials from the environment, never from an argument', () => {
    expect(script).toMatch(/GOOGLE_APPLICATION_CREDENTIALS/);
    // Arguments end up in shell history and process listings.
    expect(script).not.toMatch(/--service-account|--key\b/);
  });

  it('refuses to promote an unverified address', () => {
    expect(script).toMatch(/emailVerified/);
  });

  it('contains no credential of any kind', () => {
    expect(script).not.toMatch(/private_key|BEGIN [A-Z ]*PRIVATE KEY|AIza[0-9A-Za-z_-]{20}/);
  });
});

describe('the demo account cannot reach production', () => {
  const seed = read('../scripts/seed-demo.mjs');

  it('requires an explicit flag', () => {
    expect(seed).toMatch(/--seed-demo/);
    expect(seed).toMatch(/Refusing to run without/);
  });

  it('requires both emulator host variables', () => {
    // The emulator sets these; a real project does not and cannot be made to.
    expect(seed).toMatch(/FIREBASE_AUTH_EMULATOR_HOST/);
    expect(seed).toMatch(/FIRESTORE_EMULATOR_HOST/);
    expect(seed).toMatch(/Refusing to run outside the emulator/);
  });

  it('offers no override for the emulator check', () => {
    // A password published in the documentation must have no path to a real project.
    expect(seed).not.toMatch(/--force|--production|allowProd|SKIP_EMULATOR/);
  });

  it('creates a learner, never an admin', () => {
    expect(seed).toMatch(/role: 'learner'/);
    expect(seed).not.toMatch(/role: 'admin'/);
  });
});
