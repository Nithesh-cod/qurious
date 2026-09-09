/**
 * Hint escalation for challenges.
 *
 * A hint that arrives too early removes the work; one that never arrives loses the
 * learner. So hints escalate with failed attempts, and each rung gives away strictly
 * more than the last.
 *
 * The rule that matters: **nothing on any rung reaches the learner unverified.** The
 * written hints are authored per challenge and fixed. The repair hint comes from the
 * offline search, which executes every candidate on the simulator and only returns one
 * whose fidelity against the target clears the bar. And if a language model is asked, its
 * proposal is run here before anything is shown — if the output disagrees with the
 * target, it is discarded and the learner sees the offline answer instead.
 *
 * That last path is why `askLlmFix` existed. It was written with a comment saying the
 * caller would verify it, and then had no caller at all (see BACKEND_AUDIT.md). This is
 * the caller, and it verifies.
 */

import type { Circuit } from './ir';
import type { Challenge } from './grade';
import { fidelity } from './grade';
import { run } from './simulator';
import { searchRepair } from './tutor';
import { askLlmFix, isConfigured, type LlmConfig } from './llm';

/** Fidelity a candidate must reach against the target before it counts as a fix. */
export const HINT_PASS = 0.999;

export type HintLevel = 'none' | 'nudge' | 'concept' | 'written' | 'repair';

export interface Hint {
  level: HintLevel;
  text: string;
  /** A circuit the learner can apply. Only ever set when it was executed and checked. */
  fix?: Circuit;
  /** Where it came from, so the UI can label it honestly. */
  source: 'authored' | 'simulator' | 'model-verified';
}

/**
 * Which rung the learner has reached.
 *
 * Deliberately gentle at the start: two attempts with no help at all, because getting it
 * wrong twice is normal and being rescued immediately teaches nothing.
 */
export function levelFor(attempts: number, hintsAvailable: number): HintLevel {
  if (attempts < 2) return 'none';
  if (attempts === 2) return 'nudge';
  if (attempts === 3) return 'concept';
  if (attempts <= 3 + hintsAvailable) return 'written';
  return 'repair';
}

/** Verify a candidate against the challenge's target. Returns null if it does not match. */
export function verifyFix(candidate: Circuit, ch: Challenge): Circuit | null {
  try {
    const target = run(ch.solution).state;
    const got = run(candidate).state;
    if (got.size !== target.size) return null;
    return fidelity(got, target) >= HINT_PASS ? candidate : null;
  } catch {
    return null;
  }
}

export interface HintRequest {
  challenge: Challenge;
  attempt: Circuit;
  attempts: number;
  llm?: LlmConfig;
}

/**
 * The next hint, given how many times the learner has tried.
 *
 * Synchronous rungs first. The model is only consulted on the last rung, only when one is
 * configured, and only as a candidate — the offline answer is used whenever the model's
 * proposal fails verification, so a learner is never left with nothing because a model
 * was wrong or unreachable.
 */
export async function nextHint(req: HintRequest): Promise<Hint> {
  const { challenge, attempt, attempts, llm } = req;
  const written = challenge.hints ?? [];
  const level = levelFor(attempts, written.length);

  if (level === 'none') {
    return { level, text: '', source: 'authored' };
  }

  if (level === 'nudge') {
    return {
      level,
      source: 'authored',
      text: 'Not there yet. Look at the state you produced next to the target — the first place they differ is usually the gate to change.',
    };
  }

  if (level === 'concept') {
    return {
      level,
      source: 'authored',
      text: `This one is about ${challenge.concept}. Re-read that lesson if the target is not clear — the brief describes an outcome, not a gate list, so there is more than one way to reach it.`,
    };
  }

  if (level === 'written') {
    const index = Math.min(attempts - 4, written.length - 1);
    return { level, source: 'authored', text: written[Math.max(0, index)] };
  }

  // Last rung: an actual repair. Offline search first — it is fast, deterministic, and
  // every candidate it returns has already been executed.
  let offline: Circuit | null = null;
  try {
    const target = run(challenge.solution).state;
    // searchRepair returns an Insight; the circuit to apply hangs off it as `fix`.
    const search = searchRepair(attempt, target);
    if (search.fix?.fix) offline = verifyFix(search.fix.fix, challenge);
  } catch { /* fall through to the model, then to the written hint */ }

  if (llm && isConfigured(llm)) {
    try {
      const proposal = await askLlmFix(llm, attempt, challenge.brief);
      const verified = verifyFix(proposal.circuit, challenge);
      if (verified) {
        return {
          level, fix: verified, source: 'model-verified',
          text: `${proposal.why} (Checked on the simulator before showing it.)`,
        };
      }
      // The model was wrong. That is expected sometimes, and is exactly why it is run
      // first — the learner simply never sees it.
    } catch { /* unreachable or malformed; the offline answer still stands */ }
  }

  if (offline) {
    return {
      level, fix: offline, source: 'simulator',
      text: 'Here is a change that reaches the target. It was run on the simulator before being offered.',
    };
  }

  return {
    level,
    source: 'authored',
    text: written[written.length - 1]
      ?? 'No single change gets there from here. Try resetting to the starter and building it up again.',
  };
}
