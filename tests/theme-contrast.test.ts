/**
 * WCAG contrast, measured from the stylesheet rather than trusted.
 *
 * A design-token system makes it *possible* to be consistent; it does not make the
 * colours legible. Dark themes are where this goes wrong quietly — a dim grey on near
 * black looks tasteful on the designer's monitor and disappears on a phone in daylight,
 * and nobody files a bug because nobody can read it to complain.
 *
 * So the ratios are computed. Both themes, from the real token values, against the
 * WCAG 2.1 thresholds: 4.5:1 for body text, 3:1 for large text and UI boundaries.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'liquid.css'), 'utf8');

/** Pull `--name: #rrggbb;` pairs out of one rule block. */
function tokensIn(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} block in liquid.css`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance, WCAG 2.1 definition. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const dark = tokensIn(':root {');
const light = tokensIn(":root[data-theme='light']");

describe('the contrast checker itself', () => {
  it('agrees with the known reference values', () => {
    // Black on white is 21:1 exactly; a mid grey on white is well under AA.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 3);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('found tokens in both themes', () => {
    expect(Object.keys(dark).length).toBeGreaterThan(8);
    expect(Object.keys(light).length).toBeGreaterThan(4);
  });
});

/** Body text on its background must clear 4.5:1. */
const BODY = 4.5;
/** Large text, icons and meaningful boundaries: 3:1. */
const LARGE = 3;

describe('dark theme', () => {
  const bg = dark['--void-1'] ?? dark['--void-0'];

  it('primary text is readable', () => {
    expect(contrast(dark['--ink'], bg)).toBeGreaterThanOrEqual(BODY);
  });

  it('secondary text is readable', () => {
    expect(contrast(dark['--ink-2'], bg)).toBeGreaterThanOrEqual(BODY);
  });

  it('the dimmest text still clears the large-text threshold', () => {
    // --ink-3 is used for captions and hints. If it cannot clear 3:1 it is decoration
    // pretending to be information.
    expect(contrast(dark['--ink-3'], bg)).toBeGreaterThanOrEqual(LARGE);
  });

  it('every accent colour is visible against the background', () => {
    for (const name of ['--cyan', '--violet', '--mint', '--amber', '--rose']) {
      const c = contrast(dark[name], bg);
      expect(c, `${name} (${dark[name]}) is ${c.toFixed(2)}:1 on ${bg}`).toBeGreaterThanOrEqual(LARGE);
    }
  });
});

describe('light theme', () => {
  const bg = light['--void-1'] ?? light['--void-0'] ?? '#ffffff';
  const ink = light['--ink'] ?? dark['--ink'];

  it('primary text is readable', () => {
    expect(contrast(ink, bg)).toBeGreaterThanOrEqual(BODY);
  });

  it('secondary text is readable', () => {
    const ink2 = light['--ink-2'] ?? dark['--ink-2'];
    expect(contrast(ink2, bg)).toBeGreaterThanOrEqual(BODY);
  });

  it('accents that are redefined for light stay visible', () => {
    for (const name of ['--cyan', '--violet', '--mint', '--amber', '--rose']) {
      if (!light[name]) continue;      // inherited from dark, checked there
      const c = contrast(light[name], bg);
      expect(c, `${name} (${light[name]}) is ${c.toFixed(2)}:1 on ${bg}`).toBeGreaterThanOrEqual(LARGE);
    }
  });
});
