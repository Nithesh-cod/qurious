/**
 * The privacy policy has to stay true.
 *
 * A policy is the one document in a codebase that can quietly become a lie without
 * anybody editing it — someone adds a fetch, and a sentence written months earlier is now
 * false. These tests tie the strongest claims in the policy to the code that has to keep
 * them true, so the build fails rather than the sentence silently going wrong.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PrivacyPolicy, PRIVACY_UPDATED } from '../src/ui/PrivacyPolicy';

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8');

/** The rendered policy. Reading the source would include the doc comment, which
 *  quotes the hedging phrases it forbids — and would fail on its own explanation. */
const policy = renderToStaticMarkup(createElement(PrivacyPolicy, {}))
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ');
const analytics = read('../src/core/analytics.ts');

describe('claims that are checkable against the code', () => {
  it('"no cookies, no third-party analytics" — nothing in the app sets a cookie', () => {
    for (const f of ['../src/App.tsx', '../src/core/analytics.ts', '../src/main.tsx']) {
      expect(read(f), `${f} touches document.cookie`).not.toMatch(/document\.cookie/);
    }
  });

  it('"it is sent nowhere" — the analytics module has no transport at all', () => {
    expect(analytics).not.toMatch(/\bfetch\s*\(/);
    expect(analytics).not.toMatch(/sendBeacon|XMLHttpRequest/);
    expect(analytics).not.toMatch(/https?:\/\//);
  });

  it('"loads no scripts from anyone else at runtime" — index.html has no external script', () => {
    const html = read('../index.html');
    const external = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/g)]
      .map(m => m[1])
      .filter(src => /^https?:\/\//.test(src));
    expect(external).toEqual([]);
  });

  it('names the one case where data does leave, rather than burying it', () => {
    expect(policy).toMatch(/language model/i);
    expect(policy).toMatch(/your typed question is sent/i);
    // The providers are named, so a reader knows whose policy applies.
    expect(policy).toMatch(/Groq/);
  });
});

describe('the policy is written honestly', () => {
  it('does not hedge with "we may collect"', () => {
    // "May" exists to make future collection retroactively permitted. Either it collects
    // a thing or it does not.
    expect(policy).not.toMatch(/we may collect|may share|from time to time/i);
  });

  it('says analytics is off by default and that switching off deletes', () => {
    expect(policy).toMatch(/unless you switch it on/i);
    expect(policy).toMatch(/erases it/i);
  });

  it('carries a real date', () => {
    expect(PRIVACY_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(PRIVACY_UPDATED))).toBe(false);
  });
});

describe('lesson content is translatable data, not hardcoded markup', () => {
  it('lessons live as data so localisation is a translation job, not a rebuild', () => {
    // This is the multi-language readiness claim: the teaching content — the expensive
    // part to translate — is already a data structure rather than JSX.
    const curriculum = read('../src/content/curriculum.ts');
    expect(curriculum).toMatch(/export const LESSONS/);
    expect(curriculum).toMatch(/export const QUIZZES/);
    // If lessons were JSX this would fail, and translation would mean touching components.
    expect(curriculum).not.toMatch(/<div|<p>|className=/);
  });
});
