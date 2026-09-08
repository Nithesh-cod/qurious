/**
 * The lessons are the product. This checks the prose the same way the other suites
 * check the physics.
 *
 * Two kinds of assertion live here:
 *
 *   1. Readability floors. "Beginner friendly" is not a feeling if you write it down —
 *      a paragraph over a few hundred characters is a wall of text on a 384px phone, and
 *      sentences past twenty-odd words stop being followable when read aloud by the
 *      tutor. These are floors, not targets; they catch drift, not style.
 *
 *   2. The authoring format. Lesson bodies are rendered by LessonBody, which splits on
 *      blank lines and treats "- " as a bullet. Malformed markup would silently render
 *      as literal asterisks, so it is checked here rather than discovered on a phone.
 *
 * One numeric claim in the prose is checked against arithmetic, because a lesson that
 * quotes a figure should be held to it like any other claim we make.
 */

import { describe, expect, it } from 'vitest';
import { ALL_LESSONS } from '../src/content/curriculum';

const bodies = ALL_LESSONS.flatMap(l =>
  l.steps.map((s, i) => ({ where: `${l.id} step ${i + 1} (${s.heading})`, text: s.body }))
);

const paragraphs = (text: string) => text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

/** Rough sentence split. Good enough to catch a runaway sentence, which is the point. */
const sentences = (text: string) =>
  text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z|(])/)
    .map(s => s.trim())
    .filter(s => s.length > 1);

describe('every lesson step is readable', () => {
  it('breaks its body into paragraphs', () => {
    for (const b of bodies) {
      // A single-paragraph step is fine when it is short. A long one is a wall.
      if (b.text.length > 420) {
        expect(`${b.where}: ${paragraphs(b.text).length} paragraphs`)
          .not.toBe(`${b.where}: 1 paragraphs`);
      }
    }
  });

  it('keeps every paragraph under 480 characters', () => {
    for (const b of bodies) {
      for (const p of paragraphs(b.text)) {
        // Bullet blocks are exempt: they are already broken up line by line.
        if (p.split('\n').every(l => l.startsWith('- '))) continue;
        expect(`${b.where}: longest paragraph ${p.length}`)
          .toBe(`${b.where}: longest paragraph ${Math.min(p.length, 480)}`);
      }
    }
  });

  it('keeps sentences short enough to follow when spoken', () => {
    for (const b of bodies) {
      for (const p of paragraphs(b.text)) {
        // Bullets are fragments, not sentences — measuring them as prose would either
        // give a false pass (each bullet is short) or a false fail (the whole block
        // read as one run-on). Skip the block and check the prose around it.
        if (p.split('\n').every(l => l.startsWith('- '))) continue;
        for (const s of sentences(p)) {
          const words = s.split(/\s+/).length;
          expect(`${b.where}: "${s.slice(0, 60)}" is ${words} words`)
            .toBe(`${b.where}: "${s.slice(0, 60)}" is ${Math.min(words, 34)} words`);
        }
      }
    }
  });
});

describe('the authoring format is well formed', () => {
  it('has no unclosed bold markers', () => {
    for (const b of bodies) {
      const marks = (b.text.match(/\*\*/g) ?? []).length;
      expect(`${b.where}: ${marks} markers`).toBe(`${b.where}: ${marks - (marks % 2)} markers`);
    }
  });

  it('never leaves a lone bullet, which would render as a stray dash', () => {
    for (const b of bodies) {
      for (const p of paragraphs(b.text)) {
        const rows = p.split('\n');
        const bullets = rows.filter(r => r.startsWith('- ')).length;
        if (bullets === 0) continue;
        // Either the whole block is bullets, or none of it is. A mix renders as a
        // paragraph with a dash in the middle of it.
        expect(`${b.where}: ${bullets} of ${rows.length} lines are bullets`)
          .toBe(`${b.where}: ${rows.length} of ${rows.length} lines are bullets`);
        expect(rows.length).toBeGreaterThan(1);
      }
    }
  });

  it('does not use single newlines outside bullet blocks', () => {
    // LessonBody turns them into <br>, which is rarely what an author meant.
    for (const b of bodies) {
      for (const p of paragraphs(b.text)) {
        if (p.split('\n').every(l => l.startsWith('- '))) continue;
        expect(`${b.where}: ${p.includes('\n') ? 'has a stray newline' : 'clean'}`)
          .toBe(`${b.where}: clean`);
      }
    }
  });
});

describe('numbers quoted in the prose', () => {
  it('50 qubits really is about 18 petabytes at 16 bytes per amplitude', () => {
    const bytes = Math.pow(2, 50) * 16;
    const petabytes = bytes / 1e15;
    expect(Math.round(petabytes)).toBe(18);

    const step = ALL_LESSONS.find(l => l.id === 'qubits')!
      .steps.find(s => s.body.includes('petabytes'));
    expect(step).toBeDefined();
    expect(step!.body).toContain('18 petabytes');
  });
});
