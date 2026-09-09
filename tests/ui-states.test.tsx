/**
 * The ten UI states.
 *
 * Two things are worth testing here and they are not the visuals.
 *
 * First, that all ten exist. The set is easy to erode — someone needs an empty state,
 * writes a one-off div, and six months later there are nine bespoke versions again. The
 * roster test fails if a state is dropped.
 *
 * Second, accessibility, because that is the part that silently rots. A red line of text
 * is a validation message for sighted users and nothing at all for anyone else. So the
 * assertions are about roles and live regions rather than about colour.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EmptyState, LoadingState, ErrorState, OfflineState, NoResultsState,
  PermissionDeniedState, SessionExpiredState, FieldError, SuccessState, UI_STATES,
} from '../src/ui/UiState';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('the roster is complete', () => {
  it('names all ten states', () => {
    expect([...UI_STATES].sort()).toEqual([
      'empty', 'error', 'form-validation', 'loading', 'no-results',
      'offline', 'permission-denied', 'session-expired', 'slow', 'success',
    ].sort());
  });

  it('exports a component for each', () => {
    for (const c of [EmptyState, LoadingState, ErrorState, OfflineState, NoResultsState,
                     PermissionDeniedState, SessionExpiredState, FieldError, SuccessState]) {
      expect(typeof c).toBe('function');
    }
  });
});

describe('each state announces itself', () => {
  it('empty is a polite status, not an alert', () => {
    const out = html(<EmptyState title="Nothing here yet" />);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain('Nothing here yet');
  });

  it('error is assertive, because it interrupts', () => {
    const out = html(<ErrorState title="That did not work" detail="The circuit could not run." />);
    expect(out).toContain('role="alert"');
    expect(out).toContain('aria-live="assertive"');
  });

  it('error offers a way out when one is given', () => {
    const out = html(<ErrorState title="Failed" action={{ label: 'Try again', onClick: () => {} }} />);
    expect(out).toContain('Try again');
  });

  it('loading marks itself busy so a screen reader waits', () => {
    const out = html(<LoadingState label="Thinking" />);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('Thinking');
  });

  it('the decorative glyph is hidden from screen readers', () => {
    // Otherwise every empty state reads out as the word "circle".
    expect(html(<EmptyState title="x" />)).toContain('aria-hidden="true"');
  });
});

describe('the offline page tells the truth about this app', () => {
  const out = html(<OfflineState />);

  it('leads with what still works, not with failure', () => {
    expect(out).toContain('Still works');
    expect(out).toMatch(/Every lesson and challenge/);
    expect(out).toMatch(/circuit builder and simulator/);
  });

  it('is specific about the two things that do need a connection', () => {
    expect(out).toContain('Needs a connection');
    expect(out).toMatch(/language model/);
    expect(out).toMatch(/server simulator/);
  });

  it('does not claim the app is unavailable', () => {
    // The failure mode this guards against is the generic "you are offline" page, which
    // would be actively misleading for an app whose whole point is running on-device.
    expect(out).not.toMatch(/unavailable|cannot be used|try again when you are online/i);
  });
});

describe('form validation is reachable by assistive tech', () => {
  it('is an alert with an id an input can point at', () => {
    const out = html(<FieldError id="key-error">Paste the whole key.</FieldError>);
    expect(out).toContain('role="alert"');
    expect(out).toContain('id="key-error"');
    expect(out).toContain('Paste the whole key.');
  });
});

describe('the states with no call site yet still work', () => {
  // These two need accounts, which this build does not have. They are written, exported
  // and asserted so that wiring auth later is an import, not a design exercise.
  it('permission denied renders with a sensible default', () => {
    const out = html(<PermissionDeniedState />);
    expect(out).toContain('role="alert"');
    expect(out).toMatch(/administrators/);
  });

  it('session expired reassures that progress is kept', () => {
    const out = html(<SessionExpiredState />);
    expect(out).toMatch(/progress is saved/);
  });
});

describe('success', () => {
  it('reads as an achievement rather than a dialog', () => {
    const out = html(<SuccessState title="Badge earned" detail="Wave Reader." />);
    expect(out).toContain('Badge earned');
    expect(out).toContain('uistate-good');
  });
});

describe('no results', () => {
  it('quotes the query back so the learner can see what was searched', () => {
    const out = html(<NoResultsState title="Nothing matched" query="tensor networks" />);
    expect(out).toContain('tensor networks');
  });
});
