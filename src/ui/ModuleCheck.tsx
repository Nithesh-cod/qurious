/**
 * The check at the end of a learning module.
 *
 * A short, fixed set of questions drawn from the module's own concepts. It is not
 * decoration: the badge is only awarded when the learner has read every lesson *and*
 * passed this. Getting it wrong is not punished — the result screen says which idea to
 * go back to, and the lessons stay open.
 */

import { useState } from 'react';
import type { Module } from '../content/modules';
import { checkQuestions, moduleProgress } from '../content/modules';
import type { QuizItem } from '../content/curriculum';
import { QuizCard } from './QuizCard';

export function ModuleCheck({ module, lessonsDone, quizAnswers, onAnswer, onBack, onRetry }: {
  module: Module;
  lessonsDone: string[];
  quizAnswers: Record<string, boolean>;
  onAnswer: (item: QuizItem, correct: boolean) => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  const questions = checkQuestions(module);
  const [index, setIndex] = useState(0);
  const [session, setSession] = useState<boolean[]>([]);

  const finished = index >= questions.length;
  const progress = moduleProgress(module, lessonsDone, quizAnswers);
  const rightNow = session.filter(Boolean).length;
  const need = Math.min(module.check.pass, questions.length);
  const passedNow = rightNow >= need;
  const allRead = progress.lessonsDone === progress.lessonsTotal;

  if (!questions.length) {
    return (
      <div className="reading">
        <button className="btn btn-sm btn-ghost" onClick={onBack}>← Back to {module.title}</button>
        <p className="dim">There are no check questions for this module yet.</p>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="reading">
        <div className="quiz-top rise">
          <h1>{passedNow ? 'Module check passed' : 'Not quite yet'}</h1>
          <span className={`chip ${passedNow ? 'chip-mint' : 'chip-amber'}`}>
            {rightNow}/{questions.length} correct
          </span>
        </div>

        {passedNow && allRead ? (
          <article className="glass panel badge-award rise rise-1">
            <span className="badge-award-emoji" aria-hidden>{module.badge.emoji}</span>
            <div>
              <span className="tiny dim">Badge earned</span>
              <h2>{module.badge.name}</h2>
              <p className="tiny">{module.badge.earnedFor}</p>
            </div>
          </article>
        ) : passedNow ? (
          <p className="rise rise-1">
            You passed the check. The <strong>{module.badge.name}</strong> badge unlocks once you have
            read all {progress.lessonsTotal} lessons in this module — you have {progress.lessonsDone}.
          </p>
        ) : (
          <p className="rise rise-1">
            You need {need} of {questions.length}. Nothing is locked and nothing is lost — go back over
            the lessons and try again. Getting it wrong here is cheaper than getting it wrong later.
          </p>
        )}

        <div className="row-actions rise rise-2">
          <button className="btn btn-primary" onClick={onBack}>Back to {module.title}</button>
          <button className="btn" onClick={() => { setIndex(0); setSession([]); onRetry(); }}>
            Try the check again
          </button>
        </div>
      </div>
    );
  }

  const item = questions[index];
  return (
    <div className="reading">
      <div className="quiz-top rise">
        <h1>{module.title} — check</h1>
        <span className="chip tiny">{index + 1} of {questions.length}</span>
      </div>
      <p className="rise rise-1 dim">
        {need} correct out of {questions.length} earns the {module.badge.emoji} {module.badge.name} badge.
      </p>

      <div className="check-track rise rise-1" aria-hidden>
        {questions.map((q, i) => (
          <span key={q.id} className={`check-pip ${i < index ? (session[i] ? 'ok' : 'no') : ''} ${i === index ? 'now' : ''}`} />
        ))}
      </div>

      <QuizCard
        item={item}
        index={index}
        total={questions.length}
        onAnswered={(qi, correct) => {
          onAnswer(qi, correct);
          setSession(s => [...s, correct]);
          setIndex(i => i + 1);
        }}
        nextLabel={index + 1 === questions.length ? 'See result' : 'Next question'}
      />

      <button className="btn btn-sm btn-ghost rise rise-3" onClick={onBack}>← Leave the check</button>
    </div>
  );
}
