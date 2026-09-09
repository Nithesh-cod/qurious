/**
 * Hint escalation, and the verification gate on it.
 *
 * The property that matters is not that hints appear — it is that a hint carrying a
 * circuit has always been executed first. A hint that says "try this" and is wrong is
 * worse than no hint, because the learner trusts it and loses the thread.
 *
 * The model path is tested with a stub rather than a live call: the question is whether
 * this module discards a wrong proposal, and that has to hold whatever a real model
 * happens to return today.
 */

import { describe, expect, it, vi } from 'vitest';
import { levelFor, verifyFix, nextHint, HINT_PASS } from '../src/core/hints';
import { CHALLENGES } from '../src/content/curriculum';
import { emptyCircuit, newId, type Circuit } from '../src/core/ir';
import { run } from '../src/core/simulator';
import { fidelity } from '../src/core/grade';

const bell = CHALLENGES.find(c => c.id === 'ch-bell')!;

describe('the ladder', () => {
  it('gives nothing away for the first two attempts', () => {
    expect(levelFor(0, 3)).toBe('none');
    expect(levelFor(1, 3)).toBe('none');
  });

  it('escalates, and each rung is reachable', () => {
    const seen = [0, 2, 3, 4, 5, 6, 20].map(n => levelFor(n, 3));
    expect(seen[0]).toBe('none');
    expect(seen[1]).toBe('nudge');
    expect(seen[2]).toBe('concept');
    expect(seen).toContain('written');
    expect(seen[seen.length - 1]).toBe('repair');
  });

  it('reaches the repair rung even when a challenge has no written hints', () => {
    expect(levelFor(4, 0)).toBe('repair');
  });
});

describe('the verification gate', () => {
  it('accepts a circuit that reaches the target', () => {
    expect(verifyFix(bell.solution, bell)).not.toBeNull();
  });

  it('rejects one that does not', () => {
    expect(verifyFix(emptyCircuit(2, 'nope'), bell)).toBeNull();
  });

  it('rejects a circuit of the wrong width rather than throwing', () => {
    expect(verifyFix(emptyCircuit(3, 'wide'), bell)).toBeNull();
  });

  it('accepts a different circuit that reaches the same state', () => {
    // Grading is on the state, so an alternative route must pass. H on q1 then CNOT
    // 1->0 makes the same Bell state as H on q0 then CNOT 0->1.
    const alt: Circuit = {
      version: 1, name: 'alt', qubits: 2,
      ops: [
        { id: newId(), name: 'h', qubits: [1] },
        { id: newId(), name: 'cx', qubits: [1, 0] },
      ],
    };
    const f = fidelity(run(alt).state, run(bell.solution).state);
    expect(f).toBeGreaterThanOrEqual(HINT_PASS);
    expect(verifyFix(alt, bell)).not.toBeNull();
  });
});

describe('hints that carry a circuit have been run', () => {
  it('offers a verified repair on the last rung', async () => {
    // One gate short of the answer, so the offline search has a single edit to find.
    const nearly: Circuit = {
      version: 1, name: 'nearly', qubits: 2,
      ops: [{ id: newId(), name: 'h', qubits: [0] }],
    };
    const hint = await nextHint({ challenge: bell, attempt: nearly, attempts: 9 });
    expect(hint.level).toBe('repair');
    if (hint.fix) {
      expect(hint.source).toBe('simulator');
      expect(verifyFix(hint.fix, bell), 'a hint circuit that does not reach the target').not.toBeNull();
    }
  });

  it('never returns an unverified circuit at any rung', async () => {
    for (const attempts of [0, 2, 3, 4, 5, 9]) {
      const hint = await nextHint({ challenge: bell, attempt: emptyCircuit(2, 'x'), attempts });
      if (hint.fix) expect(verifyFix(hint.fix, bell), `rung ${hint.level}`).not.toBeNull();
    }
  });

  it('discards a wrong model proposal and falls back to the offline answer', async () => {
    const llm = await import('../src/core/llm');
    vi.spyOn(llm, 'isConfigured').mockReturnValue(true);
    vi.spyOn(llm, 'askLlmFix').mockResolvedValue({
      // Confidently wrong: an empty circuit that produces nothing like the target.
      circuit: emptyCircuit(2, 'model was wrong'),
      why: 'this will definitely work',
      ms: 1,
    });

    const nearly: Circuit = {
      version: 1, name: 'nearly', qubits: 2,
      ops: [{ id: newId(), name: 'h', qubits: [0] }],
    };
    const hint = await nextHint({
      challenge: bell, attempt: nearly, attempts: 9,
      llm: { enabled: true, provider: 'groq', apiKey: 'x', model: 'm' } as never,
    });

    expect(hint.source, 'a wrong model answer must not be labelled verified').not.toBe('model-verified');
    if (hint.fix) expect(verifyFix(hint.fix, bell)).not.toBeNull();
    vi.restoreAllMocks();
  });

  it('survives a model that throws', async () => {
    const llm = await import('../src/core/llm');
    vi.spyOn(llm, 'isConfigured').mockReturnValue(true);
    vi.spyOn(llm, 'askLlmFix').mockRejectedValue(new Error('network down'));

    const hint = await nextHint({
      challenge: bell, attempt: emptyCircuit(2, 'x'), attempts: 9,
      llm: { enabled: true, provider: 'groq', apiKey: 'x', model: 'm' } as never,
    });
    expect(hint.text.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
