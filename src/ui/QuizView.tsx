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
import { CONCEPTS } from '../core/bkt';
import { QuizCard } from './QuizCard';

export function QuizView({ onAnswer, answered }: {
  onAnswer: (item: QuizItem, correct: boolean) => void;
  answered: Record<string, boolean>;
}) {
  const [conceptFilter, setConceptFilter] = useState<string>('all');
  const [index, setIndex] = useState(0);

  const pool = useMemo(
    () => (conceptFilter === 'all' ? QUIZZES : QUIZZES.filter(q => q.concept === conceptFilter)),
    [conceptFilter]
  );
  const item = pool[Math.min(index, pool.length - 1)];

  const next = () => setIndex(i => (i + 1) % pool.length);

  const jump = (concept: string) => {
    setConceptFilter(concept);
    setIndex(0);
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

      <QuizCard
        item={item}
        index={index}
        total={pool.length}
        previous={answered[item.id]}
        onAnswered={(qi, correct) => { onAnswer(qi, correct); next(); }}
      />
    </div>
  );
}
