/**
 * Quiz grading.
 *
 * Multiple-choice and true/false items carry a stored answer. Prediction items do not:
 * their answer is *computed* by running the circuit, so the key can never drift out of
 * step with the content. Ask a learner what a circuit will produce and the grader finds
 * out the same way they should have — by simulating it.
 */

import { run } from './simulator';
import type { QuizItem } from '../content/curriculum';

export interface QuizOption {
  label: string;
  value: string;
}

export interface QuizResult {
  correct: boolean;
  /** What the right answer was, in the learner's terms. */
  expected: string;
  explain: string;
  /** For prediction items: proof, straight from the simulator. */
  evidence?: string;
}

const bits = (i: number, n: number) => i.toString(2).padStart(n, '0');

/** Outcomes with non-negligible probability, most likely first. */
function outcomes(item: Extract<QuizItem, { kind: 'predict' }>) {
  const state = run(item.circuit).state;
  const probs = Array.from(state.probabilities());
  return {
    n: state.n,
    list: probs
      .map((p, i) => ({ p, i }))
      .filter(x => x.p > 1e-9)
      .sort((a, b) => b.p - a.p),
  };
}

/** The choices a prediction item offers, derived from the circuit itself. */
export function predictOptions(item: Extract<QuizItem, { kind: 'predict' }>): QuizOption[] {
  const { n, list } = outcomes(item);

  if (item.ask === 'outcome-count') {
    const truth = list.length;
    const candidates = new Set<number>([truth, 1, 2, 4, 8, Math.max(1, truth * 2), Math.max(1, truth - 1)]);
    return [...candidates]
      .filter(v => v > 0 && v <= 1 << n)
      .sort((a, b) => a - b)
      .slice(0, 4)
      .map(v => ({ label: `${v} outcome${v === 1 ? '' : 's'}`, value: String(v) }));
  }

  // "certain" and "most-likely" both ask which bitstring comes up.
  const truth = bits(list[0].i, n);
  const wrong: string[] = [];
  for (let i = 0; i < (1 << n) && wrong.length < 3; i++) {
    const b = bits(i, n);
    if (b !== truth) wrong.push(b);
  }
  return [truth, ...wrong]
    .sort()
    .map(b => ({ label: `|${b}⟩`, value: b }));
}

/** The options a learner picks from, for any item kind. */
export function optionsFor(item: QuizItem): QuizOption[] {
  switch (item.kind) {
    case 'mcq':
      return item.options.map((label, i) => ({ label, value: String(i) }));
    case 'truefalse':
      return [{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }];
    case 'predict':
      return predictOptions(item);
  }
}

export function gradeQuiz(item: QuizItem, answer: string): QuizResult {
  switch (item.kind) {
    case 'mcq': {
      const correct = answer === String(item.answer);
      return { correct, expected: item.options[item.answer], explain: item.explain };
    }
    case 'truefalse': {
      const correct = answer === String(item.answer);
      return { correct, expected: item.answer ? 'True' : 'False', explain: item.explain };
    }
    case 'predict': {
      const { n, list } = outcomes(item);
      if (item.ask === 'outcome-count') {
        const truth = list.length;
        return {
          correct: answer === String(truth),
          expected: `${truth} outcome${truth === 1 ? '' : 's'}`,
          explain: item.explain,
          evidence: list
            .slice(0, 8)
            .map(x => `|${bits(x.i, n)}⟩ ${(x.p * 100).toFixed(1)}%`)
            .join('   '),
        };
      }
      const truth = bits(list[0].i, n);
      return {
        correct: answer === truth,
        expected: `|${truth}⟩`,
        explain: item.explain,
        evidence: list
          .slice(0, 4)
          .map(x => `|${bits(x.i, n)}⟩ ${(x.p * 100).toFixed(1)}%`)
          .join('   '),
      };
    }
  }
}

export function quizPrompt(item: QuizItem): string {
  return item.question;
}
