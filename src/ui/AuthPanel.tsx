/**
 * Sign in, sign up, reset, verify.
 *
 * The design constraint that shaped this: **signing in is optional and must feel
 * optional.** The app works fully without an account, so this screen never blocks the way
 * in. It explains what an account adds — progress on more than one device, and the
 * leaderboard — and offers a way past itself.
 *
 * Everything user-visible reuses the shared UI states from Task 9, so an error here looks
 * like an error everywhere else rather than being a bespoke red box.
 *
 * Validation is deliberately field-level and tied together with `aria-describedby` and
 * `aria-invalid`: a red border is a validation message for sighted users and nothing at
 * all for anyone else.
 */

import { useEffect, useState } from 'react';
import {
  signInWithEmail, signUpWithEmail, signInWithGoogle, sendPasswordReset,
  sendVerificationEmail, signOut, watchAccount, accountsAvailable,
  type Account,
} from '../core/auth';
import { ErrorState, SuccessState, LoadingState, FieldError } from './UiState';
import { useSlideIn } from './useSlideIn';

type Mode = 'in' | 'up' | 'reset';

interface Errors {
  email?: string;
  password?: string;
  name?: string;
}

/** Client-side checks. The server checks again — this is only to fail fast and kindly. */
function validate(mode: Mode, email: string, password: string, name: string): Errors {
  const e: Errors = {};
  if (!email.trim()) e.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'That does not look like an email address.';

  if (mode !== 'reset') {
    if (!password) e.password = 'Enter a password.';
    else if (mode === 'up' && password.length < 6) e.password = 'Use at least six characters.';
  }
  if (mode === 'up' && !name.trim()) e.name = 'Enter the name you want shown.';
  return e;
}

export function AuthPanel({ onClose, onSignedIn }: {
  onClose: () => void;
  onSignedIn?: (a: Account) => void;
}) {
  const slide = useSlideIn();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<'reset' | 'verify' | null>(null);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => watchAccount(setAccount), []);

  const available = accountsAvailable();

  async function submit() {
    const found = validate(mode, email, password, name);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setFailure(null);

    // Reset is handled on its own rather than through the same result variable: it
    // deliberately returns no account, and folding it in made the union lie about what
    // the other two return.
    if (mode === 'reset') {
      await sendPasswordReset(email);
      setBusy(false);
      // Always reported as sent, even for an unknown address — saying otherwise turns
      // this form into a way of testing which emails are registered.
      setSent('reset');
      return;
    }

    const result = mode === 'up'
      ? await signUpWithEmail(email, password, {
          displayName: name.trim(),
          ...(institution.trim() ? { institution: institution.trim() } : {}),
        })
      : await signInWithEmail(email, password);

    setBusy(false);

    if (result.ok) {
      setAccount(result.account);
      onSignedIn?.(result.account);
    } else {
      setFailure(result.message);
    }
  }

  async function google() {
    setBusy(true);
    setFailure(null);
    const r = await signInWithGoogle();
    setBusy(false);
    if (r.ok) { setAccount(r.account); onSignedIn?.(r.account); }
    else setFailure(r.message);
  }

  // ---------------------------------------------------------------- unconfigured

  if (!available) {
    return (
      <Sheet slide={slide} title="Accounts" onClose={onClose}>
        <SuccessState
          title="You are already using everything"
          detail="This build has no account system, and it does not need one — your lessons, progress and badges are saved on this device and work with no connection at all."
          action={{ label: 'Back to learning', onClick: onClose }}
        />
        <p className="tiny dim">
          An account would only add syncing between devices and the leaderboard. Nothing is
          being withheld from you here.
        </p>
      </Sheet>
    );
  }

  // ---------------------------------------------------------------- signed in

  if (account) {
    return (
      <Sheet slide={slide} title="Your account" onClose={onClose}>
        {account.emailVerified ? (
          <SuccessState
            title={`Signed in as ${account.displayName ?? account.email}`}
            detail="Your progress now syncs to any device you sign in on."
          />
        ) : (
          <>
            <ErrorState
              title="Check your email"
              detail={`We sent a verification link to ${account.email}. Progress stays on this device until you confirm it — nothing is lost either way.`}
              action={{
                label: sent === 'verify' ? 'Sent' : 'Send it again',
                onClick: async () => { await sendVerificationEmail(); setSent('verify'); },
              }}
            />
            <p className="tiny dim">
              You can keep learning right now. Verification only gates syncing, because a
              record tied to an unconfirmed address is not worth writing.
            </p>
          </>
        )}

        <div className="settings-row">
          {account.role === 'admin' && <span className="chip chip-accent tiny">admin</span>}
          <button className="btn btn-sm btn-ghost" onClick={async () => { await signOut(); setAccount(null); }}>
            Sign out
          </button>
          <button className="btn btn-sm btn-primary" onClick={onClose}>Done</button>
        </div>
      </Sheet>
    );
  }

  // ---------------------------------------------------------------- reset sent

  if (sent === 'reset') {
    return (
      <Sheet slide={slide} title="Reset your password" onClose={onClose}>
        <SuccessState
          title="Check your email"
          detail={`If there is an account for ${email}, a reset link is on its way.`}
          action={{ label: 'Back to sign in', onClick: () => { setSent(null); setMode('in'); } }}
        />
      </Sheet>
    );
  }

  // ---------------------------------------------------------------- the form

  const title = mode === 'up' ? 'Create an account'
    : mode === 'reset' ? 'Reset your password'
    : 'Sign in';

  return (
    <Sheet slide={slide} title={title} onClose={onClose}>
      <p className="tiny dim">
        Optional. Everything works without an account — signing in adds syncing between
        devices and the leaderboard.
      </p>

      {failure && <ErrorState title="That did not work" detail={failure} />}
      {busy && <LoadingState label={mode === 'up' ? 'Creating your account' : 'Signing in'} />}

      {!busy && (
        <div className="auth-form">
          {mode === 'up' && (
            <Field
              id="auth-name" label="Name" value={name} onChange={setName}
              error={errors.name} autoComplete="name"
              hint="Shown on the leaderboard and on any certificate you download."
            />
          )}

          <Field
            id="auth-email" label="Email" type="email" value={email} onChange={setEmail}
            error={errors.email} autoComplete="email"
          />

          {mode !== 'reset' && (
            <Field
              id="auth-password" label="Password" type="password" value={password}
              onChange={setPassword} error={errors.password}
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              hint={mode === 'up' ? 'At least six characters.' : undefined}
            />
          )}

          {mode === 'up' && (
            <Field
              id="auth-institution" label="College (optional)" value={institution}
              onChange={setInstitution} autoComplete="organization"
              hint="Only used to group progress by institution. Leave it blank if you prefer."
            />
          )}

          <button className="btn btn-primary" onClick={submit}>
            {mode === 'up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>

          {mode !== 'reset' && (
            <>
              <div className="auth-or"><span>or</span></div>
              <button className="btn btn-ghost" onClick={google}>Continue with Google</button>
            </>
          )}

          <div className="auth-switch tiny">
            {mode === 'in' && (
              <>
                <button className="linkish" onClick={() => { setMode('up'); setErrors({}); setFailure(null); }}>
                  Create an account
                </button>
                <button className="linkish" onClick={() => { setMode('reset'); setErrors({}); setFailure(null); }}>
                  Forgot your password?
                </button>
              </>
            )}
            {mode !== 'in' && (
              <button className="linkish" onClick={() => { setMode('in'); setErrors({}); setFailure(null); }}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- pieces

function Sheet({ slide, title, onClose, children }: {
  slide: string; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <>
      <div className={`sheet-backdrop ${slide}`} onClick={onClose} />
      <section className={`glass sheet ${slide}`} role="dialog" aria-modal="true" aria-label={title}>
        <span className="sheet-grip" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <div className="panel-tools">
            <button className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </section>
    </>
  );
}

/**
 * One labelled input.
 *
 * `aria-invalid` plus `aria-describedby` pointing at the error is what makes a screen
 * reader announce the problem when focus lands on the field. Without the pairing the
 * message is decorative.
 */
function Field({ id, label, value, onChange, error, hint, type = 'text', autoComplete }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  error?: string; hint?: string; type?: string; autoComplete?: string;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={e => onChange(e.target.value)}
      />
      {hint && <p className="tiny dim" id={hintId}>{hint}</p>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
