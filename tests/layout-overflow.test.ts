/**
 * Two layout regressions that were reported from a real device, pinned in CSS.
 *
 * Neither is unit-testable in the usual sense — they only appear once a browser has laid
 * the page out. What *is* testable is the specific CSS that caused them, and both causes
 * were a single declaration. A test that reads the stylesheet is a blunt instrument, but
 * it is the difference between "this was fixed once" and "this stays fixed".
 *
 * Measured before the fix, at twelve qubits:
 *   desktop 1440x900 — .build-state clientHeight 0, scrollHeight 85 (crushed to nothing)
 *   mobile  375x812  — .build-state width 436 in a 375 viewport, clipped on the right
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f: string) => readFileSync(new URL(`../src/styles/${f}`, import.meta.url), 'utf8');
const liquid = read('liquid.css');
const mobile = read('mobile.css');

describe('the state panel cannot be crushed to nothing', () => {
  it('gives the state row a floor rather than allowing zero', () => {
    const rule = /\.col-build\s*\{[^}]*grid-template-rows:([^;]+);/.exec(liquid)?.[1] ?? '';
    expect(rule, '.col-build grid-template-rows not found').toBeTruthy();
    // `minmax(0, 1fr)` is precisely what let the circuit above squeeze this to 0 as the
    // qubit count rose.
    expect(rule).not.toMatch(/minmax\(\s*0\s*,\s*1fr\s*\)/);
    expect(rule).toMatch(/minmax\(/);
  });

  it('lets the column scroll once its rows exceed the viewport', () => {
    // Without this the overflow just moves from the panel to the column.
    const block = /\.col-build\s*\{[^}]*overflow-y:\s*auto/.test(liquid);
    expect(block).toBe(true);
  });
});

describe('nothing in the state panel may spill off a phone screen', () => {
  it('allows the panel and its parts to shrink below their content', () => {
    // A flex item defaults to min-width:auto, which refuses to go below its content —
    // that is what pushed a 436px panel into a 375px viewport.
    expect(mobile).toMatch(/\.stage-build\s*>\s*\.col\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
    expect(mobile).toMatch(/\.build-state[^{]*\{[^}]*min-width:\s*0/);
  });

  it('scrolls the view tabs instead of letting them overflow', () => {
    // Five tabs need ~404px and will not fit; scrolling is honest, clipping is not.
    expect(mobile).toMatch(/\.build-state-head\s+\.seg\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('wraps the state vector rather than cutting it off', () => {
    expect(mobile).toMatch(/\.ket-line[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});

/**
 * A third device report, same tab: the page would not scroll.
 *
 * Cause was not layout but gesture ownership. Two elements claimed every touch that
 * landed on them — the Bloch/amplitude canvases via `touch-action: none`, and the circuit
 * SVG via `touch-action: pan-x`, which permits horizontal panning and therefore forbids
 * vertical. Between them they cover nearly the whole Build column on a phone, so a thumb
 * had almost nowhere to land that would scroll.
 */
describe('a phone can still scroll past the visualisations', () => {
  const renderer = readFileSync(new URL('../src/ui/gl/SharedRenderer.ts', import.meta.url), 'utf8');
  const components = read('components.css');

  it('leaves the vertical axis to the page on the 3D canvases', () => {
    expect(renderer).toMatch(/touchAction\s*=\s*'pan-y'/);
    expect(renderer).not.toMatch(/touchAction\s*=\s*'none'/);
  });

  it('does not capture a touch until it is plainly sideways', () => {
    // Capturing on pointerdown is what made the gesture unrecoverable: by the time the
    // browser could tell this was a scroll, the element already owned it.
    expect(renderer).toMatch(/pointerType\s*!==\s*'touch'/);
    expect(renderer).toMatch(/CLAIM_SLOP/);
  });

  it('a mouse still orbits immediately', () => {
    // The slop exists to disambiguate a touch. A mouse has nothing to disambiguate, and
    // making it wait 8px would feel like lag.
    expect(renderer).toMatch(/claimed\s*=\s*e\.pointerType\s*!==\s*'touch'/);
  });

  it('lets the circuit pan sideways without freezing the page', () => {
    const rule = /\.circuit-svg\s*\{([^}]*)\}/.exec(components)?.[1] ?? '';
    expect(rule).toMatch(/touch-action:\s*pan-x\s+pan-y/);
  });
});

/**
 * Tab order is a product decision, so it is pinned rather than left to whoever edits the
 * array next: it follows the learner's loop — see where you are, learn, practise, be
 * tested, then build freely. Instructor is not part of that loop and sits at the end.
 */
describe('the nav follows the learning loop', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

  it('orders the tabs Dashboard, Learn, Practice, Challenges, Build, Instructor', () => {
    const block = /const nav:[^=]*=\s*\[([\s\S]*?)\];/.exec(app)?.[1] ?? '';
    expect(block, 'nav array not found').toBeTruthy();
    const ids = [...block.matchAll(/id:\s*'([a-z]+)'/g)].map(m => m[1]);
    expect(ids).toEqual(['dashboard', 'learn', 'practice', 'challenges', 'build', 'instructor']);
  });

  it('still opens on Learn, not on an empty Dashboard', () => {
    // Order and entry point are separate decisions. A newcomer's Dashboard has nothing in
    // it, and greeting someone with their own emptiness is a poor first screen.
    expect(app).toMatch(/useState<View>\('learn'\)/);
  });
});

/**
 * The other half of the same report, and a fault the previous fix introduced.
 *
 * Desktop makes `.col-build` its own scroller with `overscroll-behavior-y: contain`,
 * which is correct there — the column has a fixed height and genuinely scrolls. On a
 * phone the column grows to its content instead, so it can never scroll; but it was still
 * a scroll container, and `contain` is a promise not to pass the gesture to its parent.
 * A swipe therefore did nothing at all: 658px of viewport over 4016px of content, and
 * scrollTop stuck at 0.
 */
describe('the Build tab scrolls on a phone', () => {
  it('hands the scroll back to the stage', () => {
    const media = /@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*)$/.exec(mobile)?.[1] ?? '';
    expect(media, 'mobile media query not found').toBeTruthy();
    const rule = /\.col-build\s*\{([^}]*)\}/.exec(media)?.[1] ?? '';
    expect(rule, '.col-build override missing from the mobile query').toBeTruthy();
    expect(rule).toMatch(/overflow:\s*visible/);
    // `contain` on a container that cannot scroll is a dead end for the gesture.
    expect(rule).toMatch(/overscroll-behavior-y:\s*auto/);
  });

  it('leaves the desktop column scrolling as it was', () => {
    // The desktop rule is what stops the state panel overflowing its column; the mobile
    // override must not be written in a way that also disarms it.
    expect(liquid).toMatch(/\.col-build\s*\{[^}]*overflow-y:\s*auto/);
    expect(liquid).toMatch(/\.col-build\s*\{[^}]*overscroll-behavior-y:\s*contain/);
  });
});
