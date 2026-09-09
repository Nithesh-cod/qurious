/**
 * The ten states a screen can be in, as one component each.
 *
 * Before this, every screen invented its own idea of "nothing here yet" and most had no
 * idea at all — a failed tutor call left a blank panel, an empty challenge filter left
 * dead space. Ten screens improvising ten answers is how an app starts feeling unfinished
 * even when every feature works.
 *
 * These are deliberately plain: an icon, a heading, a line of explanation, and an action
 * where an action exists. The value is not the visual, it is that a learner meets the
 * same shape every time and learns to read it.
 *
 * Two of the ten — permission denied and session expired — have no call site yet, because
 * this build has no accounts. They are here so the set is complete and so wiring auth
 * later is a one-line import rather than a design exercise. They are exported and tested;
 * they are simply not reachable from the UI yet, which the tests assert rather than hide.
 */

import { useEffect, useState, type ReactNode } from 'react';

export interface UiStateProps {
  title: string;
  /** One line. What happened, or what the learner can do about it. */
  detail?: string;
  /** The primary way out. Omit when there genuinely is not one. */
  action?: { label: string; onClick: () => void };
  /** A quieter second option, e.g. "go back". */
  secondary?: { label: string; onClick: () => void };
  children?: ReactNode;
}

type Tone = 'neutral' | 'error' | 'warn' | 'good';

const TONE_CLASS: Record<Tone, string> = {
  neutral: '', error: 'uistate-error', warn: 'uistate-warn', good: 'uistate-good',
};

/**
 * The shared frame. Every state below is this with a different glyph and tone, which is
 * the point — a learner should recognise the shape before reading the words.
 */
function Frame({ glyph, tone = 'neutral', title, detail, action, secondary, children, role }: UiStateProps & {
  glyph: string; tone?: Tone; role?: 'status' | 'alert';
}) {
  return (
    <div
      className={`uistate ${TONE_CLASS[tone]}`}
      role={role ?? 'status'}
      // Announce the whole block, not word-by-word as it renders.
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span className="uistate-glyph" aria-hidden="true">{glyph}</span>
      <h3 className="uistate-title">{title}</h3>
      {detail && <p className="uistate-detail">{detail}</p>}
      {children}
      {(action || secondary) && (
        <div className="uistate-actions">
          {action && (
            <button className="btn btn-sm btn-primary" onClick={action.onClick}>{action.label}</button>
          )}
          {secondary && (
            <button className="btn btn-sm btn-ghost" onClick={secondary.onClick}>{secondary.label}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 1. empty
export const EmptyState = (p: UiStateProps) => <Frame glyph="○" {...p} />;

// ---------------------------------------------------------------- 2. loading
/**
 * Loading, which turns into "slow" on its own.
 *
 * A spinner that never changes is indistinguishable from a hang. After `slowAfter` this
 * says so, so the learner knows the app is still trying rather than broken. That is
 * state 5 of the ten, and it belongs here rather than as a separate component nobody
 * remembers to reach for.
 */
export function LoadingState({ label = 'Loading', slowAfter = 4000, slowLabel }: {
  label?: string; slowAfter?: number; slowLabel?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), slowAfter);
    return () => clearTimeout(t);
  }, [slowAfter]);

  return (
    <div className="uistate" role="status" aria-live="polite" aria-busy="true">
      <span className="uistate-spinner" aria-hidden="true" />
      <h3 className="uistate-title">{label}…</h3>
      {slow && (
        <p className="uistate-detail">
          {slowLabel ?? 'This is taking longer than usual. Still trying — the simulator itself runs on your device, so it is the network that is slow, not the physics.'}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 3. error
export const ErrorState = ({ action, ...p }: UiStateProps) => (
  <Frame
    glyph="!"
    tone="error"
    role="alert"
    action={action ?? undefined}
    {...p}
  />
);

// ---------------------------------------------------------------- 4. no internet
/**
 * Offline, stated honestly.
 *
 * Most apps show "you are offline" and stop. Here that would be misleading in the other
 * direction: nearly everything still works, because the lessons and the simulator are on
 * the device. So this names both halves rather than implying the app is down.
 */
export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <Frame
      glyph="⚡"
      tone="warn"
      title="No internet connection"
      detail="Almost everything here still works — it runs on your device."
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
    >
      <div className="uistate-split">
        <div>
          <strong className="uistate-ok">Still works</strong>
          <ul>
            <li>Every lesson and challenge</li>
            <li>The circuit builder and simulator</li>
            <li>The tutor’s built-in topics</li>
            <li>Speech, using your device’s own voice</li>
          </ul>
        </div>
        <div>
          <strong className="uistate-need">Needs a connection</strong>
          <ul>
            <li>The optional language model</li>
            <li>Sending a circuit to the server simulator</li>
          </ul>
        </div>
      </div>
    </Frame>
  );
}

/** True when the browser reports no connection. Kept here so screens do not each re-invent it. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// ---------------------------------------------------------------- 6. no results
export const NoResultsState = ({ query, ...p }: UiStateProps & { query?: string }) => (
  <Frame
    glyph="⌕"
    title={p.title || 'Nothing matched'}
    detail={p.detail ?? (query ? `No results for “${query}”. Try fewer words, or a different one.` : undefined)}
    action={p.action}
    secondary={p.secondary}
  />
);

// ---------------------------------------------------------------- 7. permission denied
/** Not reachable yet — this build has no accounts. Ready for when it does. */
export const PermissionDeniedState = (p: Partial<UiStateProps>) => (
  <Frame
    glyph="⚿"
    tone="error"
    role="alert"
    title={p.title ?? 'You do not have access to this'}
    detail={p.detail ?? 'This area is for administrators. If you think that is wrong, ask whoever set up your account.'}
    action={p.action}
    secondary={p.secondary}
  />
);

// ---------------------------------------------------------------- 8. session expired
/** Not reachable yet — this build has no accounts. Ready for when it does. */
export const SessionExpiredState = (p: Partial<UiStateProps>) => (
  <Frame
    glyph="⏻"
    tone="warn"
    title={p.title ?? 'Your session has expired'}
    detail={p.detail ?? 'You were signed out to keep your account safe. Sign in again to pick up where you left off — your progress is saved.'}
    action={p.action}
  />
);

// ---------------------------------------------------------------- 9. form validation
/**
 * A field-level message tied to its input.
 *
 * `id` must match the input's `aria-describedby`, and the input must carry
 * `aria-invalid` — that pairing is what makes a screen reader announce the problem when
 * focus lands on the field, rather than leaving it as red text a sighted user sees and
 * nobody else does.
 */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="field-error" id={id} role="alert">
      <span aria-hidden="true">▲ </span>{children}
    </p>
  );
}

// ---------------------------------------------------------------- 10. success
export const SuccessState = (p: UiStateProps) => (
  <Frame glyph="✓" tone="good" {...p} />
);

/** The ten states, named — used by the tests to assert none was quietly dropped. */
export const UI_STATES = [
  'empty', 'loading', 'error', 'offline', 'slow',
  'no-results', 'permission-denied', 'session-expired', 'form-validation', 'success',
] as const;
