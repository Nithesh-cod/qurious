/**
 * One quiz question, self-contained.
 *
 * Pulled out of QuizView so the same card can be used in two places that must behave
 * identically: free practice, and the check at the end of a learning module. A second
 * implementation would be a second set of bugs.
 */

import { useMemo, useState } from 'react';
import type { QuizItem } from '../content/curriculum';
import { gradeQuiz, optionsFor, type QuizResult } from '../core/quiz';
import { CircuitCanvas } from './CircuitCanvas';

export const KIND_LABEL: Record<QuizItem['kind'], string> = {
  mcq: 'multiple choice',
  truefalse: 'true or false',
  predict: 'predict the output',
};

export function QuizCard({ item, index, total, previous, onAnswered, nextLabel = 'Next question' }: {
  item: QuizItem;
  index: number;
  total: number;
  /** Whether this question was answered correctly before, if it was. */
  previous?: boolean;
  onAnswered: (item: QuizItem, correct: boolean) => void;
  nextLabel?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const options = useMemo(() => optionsFor(item), [item]);

  const submit = () => {
    if (picked === null) return;
    const r = gradeQuiz(item, picked);
    setResult(r);
  };

  const advance = () => {
    if (!result) return;
    onAnswered(item, result.correct);
    setPicked(null);
    setResult(null);
  };

  return (
    <article className="glass panel quiz-card rise rise-2" key={item.id}>
      <div className="quiz-head">
        <span className="chip tiny">{KIND_LABEL[item.kind]}</span>
        <span className="tiny dim">question {index + 1} of {total}</span>
        {previous !== undefined && (
          <span className={`chip tiny ${previous ? 'chip-mint' : 'chip-amber'}`}>
            {previous ? 'answered correctly' : 'previously missed'}
          </span>
        )}
      </div>

      <h2 className="quiz-question">{item.question}</h2>

      {item.kind === 'predict' && (
        <div className="quiz-circuit">
          <CircuitCanvas circuit={item.circuit} onChange={() => {}} readOnly />
        </div>
      )}

      <div className="quiz-options">
        {options.map(o => {
          const chosen = picked === o.value;
          const isAnswer = result && o.label === result.expected;
          const wrongPick = result && chosen && !result.correct;
          return (
            <button
              key={o.value}
              className={`quiz-option ${chosen ? 'chosen' : ''} ${isAnswer ? 'is-answer' : ''} ${wrongPick ? 'is-wrong' : ''}`}
              onClick={() => !result && setPicked(o.value)}
              disabled={!!result}
            >
              <span className="quiz-dot" aria-hidden />
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>

      {!result ? (
        <button className="btn btn-primary" onClick={submit} disabled={picked === null}>Check answer</button>
      ) : (
        <div className={`quiz-result ${result.correct ? 'ok' : 'no'}`}>
          <h3>{result.correct ? 'Correct' : `Not quite — the answer is ${result.expected}`}</h3>
          <p className="tiny">{result.explain}</p>
          {result.evidence && (
            <div className="quiz-evidence tiny mono">
              <span className="dim">simulator output</span>
              <span>{result.evidence}</span>
            </div>
          )}
          <button className="btn btn-primary" onClick={advance}>{nextLabel}</button>
        </div>
      )}
    </article>
  );
}
