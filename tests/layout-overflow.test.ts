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
