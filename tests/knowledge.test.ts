/**
 * Tests for the tutor's offline knowledge retrieval.
 *
 * The regression that prompted these: typing "hi" returned "Which qubit is which in the
 * bitstring?", because scoring used substring matching and "hi" sits inside "which".
 * A tutor that answers a question nobody asked is worse than one that says it does not
 * know, so the false-positive cases below are pinned as hard as the true-positive ones.
 */

import { describe, it, expect } from 'vitest';
import { ENTRIES, search, smallTalk, byId, byCategory, CATEGORIES, TOPIC_COUNT } from '../src/core/knowledge';

const top = (q: string) => search(q)[0]?.entry.id;

describe('knowledge base integrity', () => {
  it('has more than a hundred topics', () => {
    expect(TOPIC_COUNT).toBeGreaterThanOrEqual(100);
    expect(ENTRIES.length).toBe(TOPIC_COUNT);
  });

  it('has no duplicate ids', () => {
    const ids = ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every related link points at a real entry', () => {
    for (const e of ENTRIES) {
      for (const r of e.related ?? []) {
        expect(byId(r), `${e.id} -> ${r}`).toBeDefined();
      }
    }
  });

  it('every entry has keys, a body and a known category', () => {
    for (const e of ENTRIES) {
      expect(e.keys.length, e.id).toBeGreaterThan(0);
      expect(e.body.length, e.id).toBeGreaterThan(60);
      expect(CATEGORIES, e.id).toContain(e.category);
    }
  });

  it('bodies avoid symbols a speech voice would stumble over', () => {
    for (const e of ENTRIES) {
      expect(e.body, e.id).not.toMatch(/\|[01]+[⟩>]/); // ket notation should be spelled out
      expect(e.body, e.id).not.toMatch(/[*#`]/);       // no markdown
    }
  });

  it('every category is represented', () => {
    for (const c of CATEGORIES) expect(byCategory(c).length, c).toBeGreaterThan(0);
  });
});

describe('finds the right topic', () => {
  const cases: [question: string, expected: string][] = [
    ['what is a qubit', 'qubit'],
    ['explain superposition', 'superposition'],
    ['what is entanglement', 'entanglement'],
    ['how do I build a Bell state', 'bell'],
    ['what does the hadamard gate do', 'hadamard'],
    ['how does grover search work', 'grover'],
    ['what is shors algorithm', 'shor'],
    ['will quantum computers break encryption', 'rsa-threat'],
    ['what is the surface code', 'surface-code'],
    ['what is decoherence', 'decoherence'],
    ['why can you not copy a qubit', 'no-cloning'],
    ['what maths do I need', 'maths-needed'],
    ['what is the national quantum mission', 'nqm'],
    ['how are challenges graded', 'how-graded'],
    ['does this work offline', 'offline'],
    ['what is quantum teleportation', 'teleport'],
    ['what are t1 and t2', 't1-t2'],
    ['what is the born rule', 'born-rule'],
  ];

  for (const [q, expected] of cases) {
    it(`"${q}" → ${expected}`, () => {
      expect(top(q)).toBe(expected);
    });
  }

  it('tolerates a missing plural or tense', () => {
    expect(top('entangled qubits')).toBe('entanglement');
    expect(top('rotation gates')).toBe('rotations');
  });

  it('ranks the best match first, not merely any match', () => {
    const hits = search('what is the bloch sphere');
    expect(hits[0].entry.id).toBe('bloch');
    expect(hits[0].score).toBeGreaterThan(hits[1]?.score ?? 0);
  });
});

describe('does not answer questions nobody asked', () => {
  // The exact regression: "hi" is a substring of "which".
  it('"hi" matches nothing', () => {
    expect(search('hi')).toEqual([]);
  });

  it('other short words do not match by accident', () => {
    for (const q of ['hey', 'ok', 'yes', 'no', 'um', 'a', 'the', 'is', 'it']) {
      expect(search(q), q).toEqual([]);
    }
  });

  it('an off-topic question matches nothing', () => {
    for (const q of ['what is the weather in chennai', 'who won the match', 'order me a pizza']) {
      expect(search(q), q).toEqual([]);
    }
  });

  it('an empty or punctuation-only question matches nothing', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
    expect(search('???')).toEqual([]);
  });
});

describe('small talk', () => {
  it('greets back instead of guessing a topic', () => {
    for (const g of ['hi', 'hello', 'hey', 'namaste', 'vanakkam']) {
      const r = smallTalk(g);
      expect(r, g).toBeTruthy();
      expect(r!.toLowerCase()).toContain('hello');
    }
  });

  it('accepts thanks and goodbyes', () => {
    expect(smallTalk('thanks')).toMatch(/helped/i);
    expect(smallTalk('bye')).toMatch(/see you/i);
  });

  it('offers a menu for "help"', () => {
    expect(smallTalk('help')).toMatch(/topics/i);
  });

  it('leaves real questions alone so they reach the search', () => {
    expect(smallTalk('what is a qubit')).toBeNull();
    expect(smallTalk('hey what is entanglement')).toBeNull(); // too long to be a greeting
    expect(smallTalk('explain the bloch sphere to me')).toBeNull();
  });
});
