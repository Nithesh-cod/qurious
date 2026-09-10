/**
 * Progress reports and certificates.
 *
 * The PDF is hand-built, so the structural tests are real ones: a malformed xref table or
 * an unescaped bracket produces a file that downloads happily and then fails to open,
 * which is the worst kind of bug to ship to a learner showing work to a teacher.
 *
 * The other half is about honesty. A certificate must not be issuable for something
 * unfinished, and must not claim more than the app can actually observe.
 */

import { describe, expect, it } from 'vitest';
import {
  progressReportPdf, certificatePdf, canCertify, type ReportData,
} from '../src/core/report';

const data = (over: Partial<ReportData> = {}): ReportData => ({
  name: 'Richard',
  lessonsDone: 12, lessonsTotal: 21,
  challengesSolved: 7, challengesTotal: 23,
  badges: ['Orientated', 'Wave Reader'],
  points: 340, streak: 4, practiceDays: 9,
  modules: [
    { title: 'Before you start: the maths', done: true },
    { title: 'Foundations', done: false },
  ],
  generatedAt: new Date('2026-09-10T10:00:00Z'),
  ...over,
});

const text = async (b: Blob) => await b.text();

describe('the PDF is structurally valid', () => {
  it('starts with a header and ends with the trailer marker', async () => {
    const s = await text(progressReportPdf(data()));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declares every object it lists in the xref table', async () => {
    // An xref whose count disagrees with the objects is the classic way to produce a file
    // that saves fine and will not open.
    const s = await text(progressReportPdf(data()));
    const objects = [...s.matchAll(/^\d+ 0 obj$/gm)].length;
    const size = Number(/\/Size (\d+)/.exec(s)?.[1]);
    expect(size).toBe(objects + 1);          // +1 for the free entry
    const entries = [...s.matchAll(/^\d{10} \d{5} [nf] $/gm)].length;
    expect(entries).toBe(size);
  });

  it('points startxref at the actual xref table', async () => {
    const s = await text(progressReportPdf(data()));
    const at = Number(/startxref\n(\d+)/.exec(s)?.[1]);
    expect(s.slice(at, at + 4)).toBe('xref');
  });

  it('has a content stream whose declared length matches', async () => {
    const s = await text(progressReportPdf(data()));
    const declared = Number(/<< \/Length (\d+) >>/.exec(s)?.[1]);
    const body = /stream\n([\s\S]*?)\nendstream/.exec(s)?.[1] ?? '';
    expect(body.length).toBe(declared);
  });
});

describe('text that would break the format is handled', () => {
  it('escapes brackets in a name', async () => {
    const s = await text(progressReportPdf(data({ name: 'A (nickname) B' })));
    expect(s).toContain('A \\(nickname\\) B');
  });

  it('escapes a backslash', async () => {
    const s = await text(progressReportPdf(data({ name: 'back\\slash' })));
    expect(s).toContain('back\\\\slash');
  });

  it('folds characters outside the PDF encoding rather than emitting noise', async () => {
    // A curly quote or an em dash would render as a wrong glyph, so they are converted.
    const s = await text(progressReportPdf(data({ name: 'Ravi’s — report' })));
    expect(s).toContain("Ravi's - report");
    expect(s).not.toContain('’');
  });
});

describe('the report says what was measured', () => {
  it('shows completion as a fraction and a percentage', async () => {
    const s = await text(progressReportPdf(data()));
    expect(s).toContain('12 of 21');
    expect(s).toContain('57%');                 // 12/21 rounds to 57
  });

  it('marks finished modules and unfinished ones differently', async () => {
    const s = await text(progressReportPdf(data()));
    expect(s).toContain('[x]  Before you start: the maths');
    expect(s).toContain('[ ]  Foundations');
  });

  it('says plainly that it is not institutionally verified', async () => {
    const s = await text(progressReportPdf(data()));
    expect(s).toMatch(/Not verified by an institution/);
  });

  it('handles a learner with no badges without pretending otherwise', async () => {
    const s = await text(progressReportPdf(data({ badges: [] })));
    expect(s).toContain('None yet');
  });
});

describe('certificates are only for things finished', () => {
  it('refuses when no module is complete', () => {
    expect(canCertify(0, 15)).toBe(false);
  });

  it('allows once a module is genuinely complete', () => {
    expect(canCertify(1, 5)).toBe(true);
  });

  it('states only facts the app can observe', async () => {
    const s = await text(certificatePdf({
      name: 'Richard',
      achievement: 'Foundations',
      lessonsCompleted: 4,
      challengesSolved: 3,
      date: new Date('2026-09-10T10:00:00Z'),
    }));
    expect(s).toContain('Richard');
    expect(s).toContain('Foundations');
    expect(s).toContain('4 lessons finished and 3 challenges solved');
  });

  it('does not claim mastery, accreditation or expertise', async () => {
    const s = await text(certificatePdf({
      name: 'Richard', achievement: 'Foundations',
      lessonsCompleted: 4, challengesSolved: 3, date: new Date(),
    }));
    // A certificate claiming more than it can prove devalues every real one. Match the
    // claim, not the word: the disclaimer itself contains "accredited", and a blanket
    // ban on the substring fails on the very sentence that makes the document honest.
    expect(s).not.toMatch(/has mastered|is an? expert|is accredited|is certified|qualified in/i);
    expect(s).toMatch(/not an accredited institution/i);
    expect(s).toMatch(/Self-issued/);
  });
});
