/**
 * Quizzes — multiple choice, true/false, and output prediction.
 *
 * Prediction questions are the interesting ones: there is no stored answer key. The
 * grader runs the circuit and finds out, and it shows the learner the real output
 * distribution as evidence. The answer can never drift out of step with the content
 * because the content *is* the answer.
 */

import { useMemo, useState } from 'react';
import { QUIZZES, type QuizItem } from '../content/curriculum';
import { gradeQuiz, optionsFor, type QuizResult } from '../core/quiz';
import { CONCEPTS } from '../core/bkt';
import { CircuitCanvas } from './CircuitCanvas';

const KIND_LABEL: Record<QuizItem['kind'], string> = {
  mcq: 'multiple choice',
  truefalse: 'true or false',
  predict: 'predict the output',
};

export function QuizView({ onAnswer, answered }: {
  onAnswer: (item: QuizItem, correct: boolean) => void;
  answered: Record<string, boolean>;
}) {
  const [conceptFilter, setConceptFilter] = useState<string>('all');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  const pool = useMemo(
    () => (conceptFilter === 'all' ? QUIZZES : QUIZZES.filter(q => q.concept === conceptFilter)),
    [conceptFilter]
  );
  const item = pool[Math.min(index, pool.length - 1)];
  const options = useMemo(() => (item ? optionsFor(item) : []), [item]);

  const submit = () => {
    if (!item || picked === null) return;
    const r = gradeQuiz(item, picked);
    setResult(r);
    onAnswer(item, r.correct);
  };

  const next = () => {
    setPicked(null);
    setResult(null);
    setIndex(i => (i + 1) % pool.length);
  };

  const jump = (concept: string) => {
    setConceptFilter(concept);
    setIndex(0);
    setPicked(null);
    setResult(null);
  };

  const correctCount = Object.values(answered).filter(Boolean).length;
  const doneCount = Object.keys(answered).length;

  if (!item) return <p className="dim">No questions for that topic yet.</p>;

  return (
    <div className="reading">
      <div className="quiz-top rise">
        <h1>Practice</h1>
        <span className="chip tiny">{doneCount ? `${correctCount}/${doneCount} correct` : `${QUIZZES.length} questions`}</span>
      </div>
      <p className="rise rise-1 dim">
        Mixed questions across every topic. The prediction questions have no answer key — the grader
        simulates the circuit and shows you the real output.
      </p>

      <div className="quiz-filters rise rise-1">
        <button className={`chip ${conceptFilter === 'all' ? 'chip-accent' : ''}`} onClick={() => jump('all')}>All</button>
        {CONCEPTS.map(c => {
          const n = QUIZZES.filter(q => q.concept === c.id).length;
          if (!n) return null;
          return (
            <button key={c.id} className={`chip ${conceptFilter === c.id ? 'chip-accent' : ''}`} onClick={() => jump(c.id)}>
              {c.name} <span className="dim">{n}</span>
            </button>
          );
        })}
      </div>

      <article className="glass panel quiz-card rise rise-2" key={item.id}>
        <div className="quiz-head">
          <span className="chip tiny">{KIND_LABEL[item.kind]}</span>
          <span className="tiny dim">question {index + 1} of {pool.length}</span>
          {answered[item.id] !== undefined && (
            <span className={`chip tiny ${answered[item.id] ? 'chip-mint' : 'chip-amber'}`}>
              {answered[item.id] ? 'answered correctly' : 'previously missed'}
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
            <button className="btn btn-primary" onClick={next}>Next question</button>
          </div>
        )}
      </article>
    </div>
  );
}
