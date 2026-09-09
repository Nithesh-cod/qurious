/**
 * The quiz at the end of a topic.
 *
 * The module check already existed and works; this is the same idea one level down. The
 * reason for the smaller unit is motivational rather than structural — five modules meant
 * five badges across sixteen lessons, so a learner could work for an hour and finish
 * nothing. A topic is small enough to complete in a sitting.
 *
 * Failing is not punished. The result names the lessons to go back to and leaves them
 * open, because a quiz that locks you out of the material you got wrong has the incentive
 * exactly backwards.
 */

import { useState } from 'react';
import type { Topic } from '../content/modules';
import { lessonsOfTopic, topicProgress, topicQuestions, unlockedBy } from '../content/modules';
import type { QuizItem } from '../content/curriculum';
import { QuizCard } from './QuizCard';

export function TopicQuiz({ topic, lessonsDone, quizAnswers, onAnswer, onBack }: {
  topic: Topic;
  lessonsDone: string[];
  quizAnswers: Record<string, boolean>;
  onAnswer: (item: QuizItem, correct: boolean) => void;
  onBack: () => void;
}) {
  const questions = topicQuestions(topic);
  const [index, setIndex] = useState(0);
  const [session, setSession] = useState<boolean[]>([]);

  const finished = index >= questions.length;
  const progress = topicProgress(topic, lessonsDone, quizAnswers);
  const rightNow = session.filter(Boolean).length;
  const need = Math.min(topic.quiz.pass, questions.length);
  const passedNow = rightNow >= need;
  const allRead = progress.lessonsDone === progress.lessonsTotal;
  const unread = lessonsOfTopic(topic).filter(l => !lessonsDone.includes(l.id));

  if (!questions.length) {
    return (
      <div className="reading">
        <button className="btn btn-sm btn-ghost" onClick={onBack}>← Back</button>
        <p className="dim">There are no quiz questions for this topic yet.</p>
      </div>
    );
  }

  if (finished) {
    const opens = unlockedBy(topic);
    return (
      <div className="reading">
        <div className="quiz-top rise">
          <h1>{passedNow ? 'Topic quiz passed' : 'Not quite yet'}</h1>
          <span className={`chip ${passedNow ? 'chip-mint' : 'chip-amber'}`}>
            {rightNow}/{questions.length} correct
          </span>
        </div>

        {passedNow && allRead ? (
          <article className="glass panel badge-award rise rise-1">
            <span className="badge-award-emoji" aria-hidden>{topic.badge.emoji}</span>
            <div>
              <span className="tiny dim">Badge earned</span>
              <h2>{topic.badge.name}</h2>
              <p className="tiny">{topic.badge.earnedFor}</p>
              {opens.length > 0 && (
                <p className="tiny dim">
                  This opens up {opens.map(t => t.title).join(', ')}.
                </p>
              )}
            </div>
          </article>
        ) : (
          <article className="glass panel rise rise-1">
            <p>
              {passedNow
                ? 'You passed the quiz. The badge needs the lessons read as well.'
                : `You need ${need} of ${questions.length} to pass. Nothing is lost — the lessons stay open.`}
            </p>
            {unread.length > 0 && (
              <p className="tiny dim">
                Still to read: {unread.map(l => l.title).join(', ')}.
              </p>
            )}
          </article>
        )}

        <div className="quiz-actions rise rise-2">
          <button className="btn btn-primary" onClick={onBack}>Back to the topic</button>
          <button
            className="btn btn-ghost"
            onClick={() => { setIndex(0); setSession([]); }}
          >
            Try the quiz again
          </button>
        </div>
      </div>
    );
  }

  const item = questions[index];
  return (
    <div className="reading">
      <button className="btn btn-sm btn-ghost rise" onClick={onBack}>← Back</button>
      <div className="quiz-top rise">
        <h1>{topic.title}</h1>
        <span className="chip tiny">Question {index + 1} of {questions.length}</span>
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
    </div>
  );
}
