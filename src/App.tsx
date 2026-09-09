import { useCallback, useEffect, useMemo, useState } from 'react';
import { cloneCircuit, emptyCircuit, gateCount, depth, type Circuit } from './core/ir';
import { run, sample, type Statevector } from './core/simulator';
import { validate } from './core/validate';
import { grade, type Challenge } from './core/grade';
import {
  CONCEPTS, cohortWeakest, initialMastery, isMastered, isUnlocked, observe, recommend, type Mastery,
} from './core/bkt';
import { ALL_LESSONS, CHALLENGES, LESSONS, QUIZZES, type Lesson, type QuizItem } from './content/curriculum';
import { CircuitCanvas } from './ui/CircuitCanvas';
import { BlochSphere, BlochFlat } from './ui/BlochSphere';
import { AmplitudeBars, Histogram, KetLine, ProbabilityTable } from './ui/StateViews';
import { CodePanel } from './ui/CodePanel';
import { TutorPanel } from './ui/TutorPanel';
import { QuizView } from './ui/QuizView';
import { ModuleCheck } from './ui/ModuleCheck';
import { TopicQuiz } from './ui/TopicQuiz';
import {
  MODULES, earnedBadges, lessonsOf, moduleProgress, unmoduledLessons,
  earnedTopicBadges, lessonsOfTopic, topicById, topicProgress, topicQuestions, topicReadiness, TOPICS,
} from './content/modules';
import { AnimatedExplainer } from './ui/AnimatedExplainer';
import { LessonBody } from './ui/LessonBody';
import { NoiseLab } from './ui/NoiseLab';
import { AmplitudeField3D, MAX_STATES_3D } from './ui/AmplitudeField3D';
import { EntanglementMap } from './ui/EntanglementMap';
import { useSlideIn } from './ui/useSlideIn';
import { useHistory } from './ui/useHistory';
import { TutorAvatar, type TutorMood } from './ui/TutorAvatar';
import { SettingsSheet } from './ui/SettingsSheet';
import { loadConfig, type LlmConfig } from './core/llm';
import { useOnline } from './ui/UiState';
import { computeScore, levelFor, recordPractice, tierOf, TIER_LABEL, challengePoints } from './core/points';
import type { LangCode } from './core/speech';

type View = 'build' | 'learn' | 'practice' | 'challenges' | 'dashboard' | 'instructor';

const STORE_KEY = 'quantum-learning:v1';
const webglOk = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
})();

interface Saved {
  mastery: Mastery;
  solved: string[];
  /** Lessons the learner has marked complete. */
  lessonsDone: string[];
  /** Quiz item id -> whether it was answered correctly. */
  quizAnswers: Record<string, boolean>;
  /**
   * ISO days on which the learner did something. The only progress fact the rest of the
   * app does not already know, so it is the only thing the scoring layer stores.
   */
  practiceDays: string[];
  circuit?: Circuit;
  theme: 'dark' | 'light';
  lang: LangCode;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { theme: 'dark', lang: 'en-IN', solved: [], lessonsDone: [], quizAnswers: {}, practiceDays: [], mastery: initialMastery(), ...JSON.parse(raw) };
  } catch { /* private mode, cleared storage — fall through to defaults */ }
  return { mastery: initialMastery(), solved: [], lessonsDone: [], quizAnswers: {}, practiceDays: [], theme: 'dark', lang: 'en-IN' };
}
function save(s: Saved) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* nothing we can do, and nothing breaks */ }
}

export default function App() {
  const [saved, setSaved] = useState<Saved>(load);
  const [view, setView] = useState<View>('learn');
  const online = useOnline();
  const [circuit, setCircuit] = useState<Circuit>(() => saved.circuit ?? {
    version: 1, name: 'Scratch', qubits: 2,
    ops: [{ id: 'seed1', name: 'h', qubits: [0] }, { id: 'seed2', name: 'cx', qubits: [0, 1] }],
  });
  const [step, setStep] = useState<number | undefined>(undefined);
  const [shots, setShots] = useState(1024);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [llm, setLlm] = useState<LlmConfig>(loadConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [sheet, setSheet] = useState<'tutor' | 'code' | null>(null);
  const [mood, setMood] = useState<TutorMood>({ state: 'idle', nonce: 0 });

  /** Make the avatar react to something that just happened. */
  const react = useCallback((state: TutorMood['state'], say?: string) => {
    setMood(m => ({ state, say, nonce: m.nonce + 1 }));
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = saved.theme; }, [saved.theme]);
  useEffect(() => { save({ ...saved, circuit }); }, [saved, circuit]);

  const diagnostics = useMemo(() => validate(circuit), [circuit]);
  const result = useMemo(() => {
    try { return { ...run(circuit), error: null as string | null }; }
    catch (e) { return { state: null as unknown as Statevector, trace: [], measured: [], error: (e as Error).message }; }
  }, [circuit]);

  const shown: Statevector | null = useMemo(() => {
    if (!result.state) return null;
    if (step === undefined) return result.state;
    return result.trace[Math.min(step, result.trace.length - 1)] ?? result.state;
  }, [result, step]);

  const history = useHistory(circuit);

  /**
   * Every circuit change goes through here, so history sees all of them and the IR stays
   * the one source of truth. Undo writes back through the same setter, which means every
   * consumer — canvas, code panel, simulator, tutor — updates together.
   */
  const setCircuitSafe = useCallback((c: Circuit) => {
    history.push(c);
    setCircuit(c);
    setStep(undefined);
  }, [history]);

  const undo = useCallback(() => {
    const c = history.undo();
    if (c) { setCircuit(c); setStep(undefined); }
  }, [history]);

  const redo = useCallback(() => {
    const c = history.redo();
    if (c) { setCircuit(c); setStep(undefined); }
  }, [history]);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), ignored while typing in the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const markSolved = useCallback((ch: Challenge, correct: boolean) => {
    setSaved(s => ({
      ...s,
      mastery: observe(s.mastery, ch.concept, correct),
      solved: correct && !s.solved.includes(ch.id) ? [...s.solved, ch.id] : s.solved,
      practiceDays: recordPractice(s.practiceDays),
    }));
    react(
      correct ? 'celebrate' : 'encourage',
      correct ? 'Well done. That is exactly the target state.' : 'Not yet — check the tutor panel, I have a suggestion.'
    );
  }, [react]);

  const markLessonDone = useCallback((lesson: Lesson) => {
    react('celebrate', `Nice — ${lesson.title} finished.`);
    setSaved(s => ({
      ...s,
      lessonsDone: s.lessonsDone.includes(lesson.id) ? s.lessonsDone : [...s.lessonsDone, lesson.id],
      // Finishing a lesson is weak evidence of understanding, so it nudges the model
      // rather than driving it. Challenges and quizzes carry the real signal.
      mastery: observe(s.mastery, lesson.concept, true),
      practiceDays: recordPractice(s.practiceDays),
    }));
  }, [react]);

  const recordQuiz = useCallback((item: QuizItem, correct: boolean) => {
    setSaved(s => ({
      ...s,
      quizAnswers: { ...s.quizAnswers, [item.id]: correct },
      mastery: observe(s.mastery, item.concept, correct),
      practiceDays: recordPractice(s.practiceDays),
    }));
    react(correct ? 'celebrate' : 'encourage');
  }, [react]);

  // Learn comes first: a newcomer should meet a lesson before an empty canvas.
  const nav: { id: View; label: string; icon: JSX.Element }[] = [
    { id: 'learn', label: 'Learn', icon: <IconLearn /> },
    { id: 'build', label: 'Build', icon: <IconBuild /> },
    { id: 'practice', label: 'Practice', icon: <IconQuiz /> },
    { id: 'challenges', label: 'Challenges', icon: <IconChallenge /> },
    { id: 'dashboard', label: 'Dashboard', icon: <IconProgress /> },
    { id: 'instructor', label: 'Instructor', icon: <IconTeacher /> },
  ];

  return (
    <>
      <div className="field" aria-hidden>
        <div className="blob blob-a" /><div className="blob blob-b" /><div className="blob blob-c" />
      </div>

      <div className="app">
        <header className="glass topbar rise">
          <div className="brand">
            <img className="brand-mark" src="brand/logo.png" alt="" width={34} height={34} />
            <div>
              <div className="brand-name">Qurious</div>
              <div className="brand-sub">learn it by building it</div>
            </div>
          </div>

          <nav className="nav" role="tablist">
            {nav.map(n => (
              <button key={n.id} className="tab" role="tab" aria-selected={view === n.id} onClick={() => setView(n.id)}>
                {n.icon}<span>{n.label}</span>
              </button>
            ))}
          </nav>

          {!online && (
            /* Offline-first is the whole design, so this is information rather than an
               alarm: it says what is unavailable, not that the app is broken. */
            <span className="chip chip-amber tiny offline-chip" title="Lessons, challenges and the simulator all run on this device. Only the optional language model needs a connection.">
              offline · everything still works
            </span>
          )}
          <button
            className="btn btn-sm btn-icon"
            title={saved.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onClick={() => setSaved(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
          >
            {saved.theme === 'dark' ? '☾' : '☀'}
          </button>
          <button className="btn btn-sm btn-icon" title="Settings" onClick={() => setShowSettings(true)}>⚙</button>
        </header>

        {view === 'build' && (
          <BuildView
            circuit={circuit} setCircuit={setCircuitSafe}
            state={shown} error={result.error} diagnostics={diagnostics}
            step={step} setStep={setStep} shots={shots} setShots={setShots}
            traceLength={result.trace.length}
            onOpenSheet={setSheet}
            undo={undo} redo={redo}
            canUndo={history.canUndo} canRedo={history.canRedo}
          />
        )}

        {view === 'learn' && (
          <LearnView
            lesson={activeLesson} setLesson={setActiveLesson}
            mastery={saved.mastery} done={saved.lessonsDone} onDone={markLessonDone}
            onTry={c => { setCircuitSafe(cloneCircuit(c)); setView('build'); }}
            quizAnswers={saved.quizAnswers} onQuizAnswer={recordQuiz}
          />
        )}

        {view === 'practice' && (
          <div className="stage stage-single scroll">
            <QuizView onAnswer={recordQuiz} answered={saved.quizAnswers} />
          </div>
        )}

        {view === 'challenges' && (
          <ChallengeView
            challenge={activeChallenge} setChallenge={setActiveChallenge}
            solved={saved.solved} onResult={markSolved}
            circuit={circuit} setCircuit={setCircuitSafe}
          />
        )}

        {view === 'dashboard' && (
          <DashboardView
            mastery={saved.mastery} solved={saved.solved}
            lessonsDone={saved.lessonsDone} quizAnswers={saved.quizAnswers}
            practiceDays={saved.practiceDays}
            onGo={setView}
          />
        )}
        {view === 'instructor' && <InstructorView mastery={saved.mastery} solved={saved.solved} />}

        <nav className="bottom-nav" role="tablist" aria-label="Sections">
          {nav.map(n => (
            <button key={n.id} className="bnav-item" role="tab" aria-selected={view === n.id}
                    onClick={() => setView(n.id)}>
              {n.icon}
              <span>{n.label}</span>
              <span className="bnav-pill" />
            </button>
          ))}
        </nav>
      </div>

      <TutorAvatar
        mood={mood}
        llm={llm}
        lang={saved.lang}
        onLangChange={l => setSaved(s => ({ ...s, lang: l }))}
        contextHint={`The learner is on the ${view} screen. Their current circuit has ${circuit.qubits} qubits and ${gateCount(circuit)} gates.`}
      />

      {showSettings && (
        <SettingsSheet config={llm} onChange={setLlm} onClose={() => setShowSettings(false)} />
      )}

      {sheet && (
        <BuildSheet kind={sheet} onClose={() => setSheet(null)}>
          {sheet === 'tutor'
            ? <TutorPanel circuit={circuit} onApply={setCircuitSafe} />
            : <CodePanel circuit={circuit} onChange={setCircuitSafe} />}
        </BuildSheet>
      )}
    </>
  );
}

/** The phone-only sheet holding the tutor or code panel. */
function BuildSheet({ kind, onClose, children }: {
  kind: 'tutor' | 'code'; onClose: () => void; children: React.ReactNode;
}) {
  const slide = useSlideIn();
  return (
    <>
      <div className={`sheet-backdrop ${slide}`} onClick={onClose} />
      <section className={`glass sheet ${slide}`} role="dialog" aria-label={kind === 'tutor' ? 'Tutor' : 'Code'}>
        <span className="sheet-grip" />
        <div className="sheet-head">
          <h3>{kind === 'tutor' ? 'Circuit tutor' : 'Code'}</h3>
          <div className="panel-tools">
            <button className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ build */

function BuildView({ circuit, setCircuit, state, error, diagnostics, step, setStep, shots, setShots, traceLength, onOpenSheet, undo, redo, canUndo, canRedo }: {
  circuit: Circuit; setCircuit: (c: Circuit) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  state: Statevector | null; error: string | null;
  diagnostics: ReturnType<typeof validate>;
  step?: number; setStep: (n: number | undefined) => void;
  shots: number; setShots: (n: number) => void;
  traceLength: number;
  onOpenSheet: (s: 'tutor' | 'code') => void;
}) {
  const [tab, setTab] = useState<'state' | 'phasors' | 'outcomes' | 'noise' | 'table'>('state');
  const errs = diagnostics.filter(d => d.severity === 'error');
  const warns = diagnostics.filter(d => d.severity === 'warning');

  return (
    <div className="stage stage-build">
      <div className="col col-build">
        <section className="glass panel rise">
          <div className="panel-head">
            <h3 className="panel-title">Circuit</h3>
            <div className="panel-tools">
              <span className="chip tiny">{circuit.qubits} qubits</span>
              <span className="chip tiny">{gateCount(circuit)} gates</span>
              <span className="chip tiny">depth {depth(circuit)}</span>
              <div className="seg">
                <button aria-pressed={false} onClick={() => setCircuit({ ...circuit, qubits: Math.max(1, circuit.qubits - 1), ops: circuit.ops.filter(o => o.qubits.every(q => q < circuit.qubits - 1)) })}>−</button>
                <button aria-pressed={false} onClick={() => setCircuit({ ...circuit, qubits: Math.min(12, circuit.qubits + 1) })}>+</button>
              </div>
              {/* Undo makes experimenting cheap. Without it a wrong delete means
                  rebuilding by hand, and learners stop trying things. */}
              <button
                className="btn btn-sm btn-ghost" title="Undo (Ctrl+Z)"
                disabled={!canUndo} onClick={undo}
              >↶</button>
              <button
                className="btn btn-sm btn-ghost" title="Redo (Ctrl+Shift+Z)"
                disabled={!canRedo} onClick={redo}
              >↷</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setCircuit(emptyCircuit(circuit.qubits, circuit.name))}>Clear</button>
            </div>
          </div>
          <CircuitCanvas circuit={circuit} onChange={setCircuit} step={step ?? traceLength - 1} onStep={n => setStep(n)} />

          {/* Phone only: the side panels live behind these. */}
          <div className="sheet-bar">
            <button className="btn btn-sm" onClick={() => onOpenSheet('tutor')}>Tutor</button>
            <button className="btn btn-sm" onClick={() => onOpenSheet('code')}>Code</button>
          </div>
        </section>

        <section className="glass panel panel-flush rise rise-1 build-state">
          <div className="build-state-head">
            <div className="seg">
              <button aria-pressed={tab === 'state'} onClick={() => setTab('state')}>State</button>
              <button aria-pressed={tab === 'phasors'} onClick={() => setTab('phasors')}>Phasors</button>
              <button aria-pressed={tab === 'outcomes'} onClick={() => setTab('outcomes')}>Outcomes</button>
              <button aria-pressed={tab === 'noise'} onClick={() => setTab('noise')}>Real machine</button>
              <button aria-pressed={tab === 'table'} onClick={() => setTab('table')}>Table</button>
            </div>
            {tab === 'outcomes' && (
              <label className="shots tiny dim">
                shots
                <input type="range" min={64} max={8192} step={64} value={shots} onChange={e => setShots(parseInt(e.target.value, 10))} />
                <span className="num">{shots}</span>
              </label>
            )}
          </div>

          <div className="build-state-body scroll">
            {error && <p className="notice notice-error">{error}</p>}
            {!error && errs.length > 0 && <p className="notice notice-error">{errs[0].message}</p>}
            {!error && !errs.length && warns.length > 0 && <p className="notice notice-warn">{warns[0].message}</p>}

            {state && !error && (
              <>
                <KetLine state={state} />
                <div className="bloch-strip">
                  {Array.from({ length: state.n }, (_, q) => {
                    const b = state.bloch(q);
                    const P = webglOk ? BlochSphere : BlochFlat;
                    return <P key={q} {...b} label={`q${q}`} size={webglOk ? 168 : 140} />;
                  })}
                </div>
                {tab === 'state' && (
                  <>
                    {/* The spheres show that a qubit is entangled; this shows with whom.
                        Three collapsed arrows look the same whether all three share one
                        state or two are paired and one is not. */}
                    <EntanglementMap state={state} />
                    <AmplitudeBars state={state} />
                  </>
                )}
                {tab === 'phasors' && (
                  state.size <= MAX_STATES_3D
                    ? <AmplitudeField3D state={state} height={260} />
                    : (
                      <>
                        <p className="tiny dim">
                          {state.size} basis states is too many to read as arrows — beyond
                          {' '}{MAX_STATES_3D} they are thinner than the lines. Here is the flat view instead.
                        </p>
                        <AmplitudeBars state={state} />
                      </>
                    )
                )}
                {tab === 'outcomes' && <Histogram state={state} shots={shots} />}
                {tab === 'noise' && <NoiseLab circuit={circuit} shots={shots} />}
                {tab === 'table' && <ProbabilityTable state={state} />}
              </>
            )}
          </div>
        </section>
      </div>

      <div className="col">
        <section className="glass panel rise rise-2 side-tutor">
          <TutorPanel circuit={circuit} onApply={setCircuit} />
        </section>
        <section className="glass panel rise rise-3 side-code">
          <CodePanel circuit={circuit} onChange={setCircuit} />
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ learn */

function LearnView({ lesson, setLesson, mastery, done, onDone, onTry, quizAnswers, onQuizAnswer }: {
  lesson: Lesson | null; setLesson: (l: Lesson | null) => void;
  mastery: Mastery; done: string[]; onDone: (l: Lesson) => void;
  onTry: (c: Circuit) => void;
  quizAnswers: Record<string, boolean>;
  onQuizAnswer: (item: QuizItem, correct: boolean) => void;
}) {
  // Which module the learner has opened, and whether they are sitting its check.
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  /** Which topic's end-of-topic quiz is open, if any. */
  const [quizTopic, setQuizTopic] = useState<string | null>(null);

  const active = MODULES.find(m => m.id === (checking ?? openModule)) ?? null;

  // An end-of-topic quiz takes over the page while it is open.
  const openTopic = quizTopic ? topicById(quizTopic) : null;
  if (!lesson && openTopic) {
    return (
      <div className="stage stage-single scroll">
        <TopicQuiz
          topic={openTopic}
          lessonsDone={done}
          quizAnswers={quizAnswers}
          onAnswer={onQuizAnswer}
          onBack={() => setQuizTopic(null)}
        />
      </div>
    );
  }

  if (!lesson && checking && active) {
    return (
      <div className="stage stage-single scroll">
        <ModuleCheck
          module={active}
          lessonsDone={done}
          quizAnswers={quizAnswers}
          onAnswer={onQuizAnswer}
          onBack={() => setChecking(null)}
          onRetry={() => {}}
        />
      </div>
    );
  }

  if (!lesson && active) {
    const prog = moduleProgress(active, done, quizAnswers);
    const lessons = lessonsOf(active);
    return (
      <div className="stage stage-single scroll">
        <div className="reading">
          <button className="btn btn-sm btn-ghost rise" onClick={() => setOpenModule(null)}>← All modules</button>
          <div className="quiz-top rise">
            <h1>{active.title}</h1>
            <span className={`chip ${prog.earned ? 'chip-mint' : ''}`}>{prog.percent}%</span>
          </div>
          <p className="rise rise-1">{active.blurb}</p>

          {/*
            The roadmap: Module → Topic → lesson unit.
            A topic carries its own quiz and badge, so a learner finishes something in a
            sitting rather than working for an hour to earn nothing. Prerequisites are
            shown as a nudge and never as a wall — somebody who already knows linear
            algebra should not be made to sit through it.
          */}
          {active.topics.map((t, ti) => {
            const tp = topicProgress(t, done, quizAnswers);
            const ready = topicReadiness(t, done, quizAnswers);
            return (
              <section key={t.id} className={`topic-block rise rise-1 ${tp.earned ? 'is-earned' : ''}`}>
                <header className="topic-head">
                  <span className="topic-n">{tp.earned ? '✓' : ti + 1}</span>
                  <div className="topic-head-main">
                    <h2>{t.title}</h2>
                    <p className="tiny dim">{t.blurb}</p>
                  </div>
                  <span className={`chip tiny ${tp.earned ? 'chip-mint' : ''}`}>{tp.percent}%</span>
                </header>

                {!ready.ready && (
                  <p className="tiny notice notice-warn topic-prereq">
                    Best after {ready.missing.map(p => p.title).join(' and ')}. You can carry on
                    regardless — this is a suggestion, not a lock.
                  </p>
                )}
                {t.neededFor?.length ? (
                  <p className="tiny dim topic-needed">
                    Needed for {t.neededFor.map(id => topicById(id)?.title ?? id).join(', ')}.
                  </p>
                ) : null}

                <ol className="lesson-track">
                  {lessonsOfTopic(t).map((l, i) => (
                    <li key={l.id}>
                      <button className={`glass glass-hover lesson-row ${done.includes(l.id) ? 'is-done' : ''}`} onClick={() => setLesson(l)}>
                        <span className="lesson-row-n">{done.includes(l.id) ? '✓' : i + 1}</span>
                        <span className="lesson-row-main">
                          <strong>{l.title}</strong>
                          <span className="tiny dim">{l.summary}</span>
                        </span>
                        <span className="chip tiny">{l.minutes} min</span>
                      </button>
                    </li>
                  ))}
                </ol>

                <div className="topic-quiz-row">
                  <span className="badge-award-emoji sm" aria-hidden>{t.badge.emoji}</span>
                  <div className="topic-quiz-copy">
                    <strong className="tiny">{tp.earned ? `Earned: ${t.badge.name}` : t.badge.name}</strong>
                    <span className="tiny dim">
                      {tp.lessonsDone}/{tp.lessonsTotal} read
                      {tp.quizTotal > 0 && ` · quiz ${tp.quizRight}/${tp.quizTotal}`}
                    </span>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => setQuizTopic(t.id)}>
                    {tp.quizPassed ? 'Retake quiz' : 'Take the quiz'}
                  </button>
                </div>
              </section>
            );
          })}
          {lessons.length === 0 && <p className="tiny dim">No lessons in this module yet.</p>}

          <article className={`glass panel module-check-cta rise rise-2 ${prog.earned ? 'is-earned' : ''}`}>
            <span className="badge-award-emoji" aria-hidden>{active.badge.emoji}</span>
            <div className="module-check-copy">
              <h3>{prog.earned ? `Earned: ${active.badge.name}` : `Badge: ${active.badge.name}`}</h3>
              <p className="tiny dim">{active.badge.earnedFor}</p>
              <p className="tiny dim">
                {prog.lessonsDone}/{prog.lessonsTotal} lessons read
                {prog.checkTotal > 0 && ` · check ${prog.checkRight}/${prog.checkTotal}`}
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setChecking(active.id)}>
              {prog.checkPassed ? 'Retake the check' : 'Take the check'}
            </button>
          </article>
        </div>
      </div>
    );
  }

  if (!lesson) {
    const earned = earnedBadges(done, quizAnswers);
    const extra = unmoduledLessons();
    return (
      <div className="stage stage-single scroll">
        <div className="reading">
          <div className="quiz-top rise">
            <h1>Learn</h1>
            <span className="chip tiny">{done.length}/{ALL_LESSONS.length} lessons</span>
          </div>
          <p className="rise rise-1">
            Work through a module, take its check, earn its badge. Every lesson has a live circuit
            you can pull apart — nothing here is a video you watch.
          </p>

          {earned.length > 0 && (
            <div className="badge-shelf rise rise-1">
              {earned.map(bg => (
                <span key={bg.id} className="badge-chip" title={bg.earnedFor}>
                  <span aria-hidden>{bg.emoji}</span> {bg.name}
                </span>
              ))}
            </div>
          )}

          <div className="card-grid">
            {MODULES.map((m, i) => {
              const prog = moduleProgress(m, done, quizAnswers);
              return (
                <button key={m.id} className={`glass glass-hover module-card rise rise-${Math.min(i + 1, 3)}`} onClick={() => setOpenModule(m.id)}>
                  <div className="lesson-card-top">
                    <span className="chip chip-accent tiny">{prog.lessonsTotal} lessons</span>
                    {prog.earned
                      ? <span className="chip chip-mint tiny">{m.badge.emoji} earned</span>
                      : <span className="chip tiny">{prog.percent}%</span>}
                  </div>
                  <h3>{m.title}</h3>
                  <p className="tiny dim">{m.blurb}</p>
                  <span className="module-bar" aria-hidden><i style={{ width: `${prog.percent}%` }} /></span>
                  <span className="lesson-card-go tiny">Open module →</span>
                </button>
              );
            })}
          </div>

          {extra.length > 0 && (
            <>
              <h2 className="rise rise-2">More lessons</h2>
              <div className="card-grid">
                {extra.map(l => (
                  <button key={l.id} className="glass glass-hover lesson-card" onClick={() => setLesson(l)}>
                    <div className="lesson-card-top">
                      <span className="chip chip-accent tiny">{l.minutes} min</span>
                      {done.includes(l.id) && <span className="chip chip-mint tiny">completed</span>}
                      {isMastered(mastery, l.concept) && <span className="chip chip-mint tiny">mastered</span>}
                    </div>
                    <h3>{l.title}</h3>
                    <p className="tiny dim">{l.summary}</p>
                    <span className="lesson-card-go tiny">{l.steps.length} steps →</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="stage stage-single scroll">
      <div className="reading">
        <button className="btn btn-sm btn-ghost rise" onClick={() => setLesson(null)}>← All lessons</button>
        <h1 className="rise">{lesson.title}</h1>
        <p className="rise rise-1 dim">{lesson.summary}</p>

        {lesson.steps.map((s, i) => (
          <article key={i} className="glass panel lesson-step rise">
            <div className="lesson-step-num num">{String(i + 1).padStart(2, '0')}</div>
            <h2>{s.heading}</h2>
            <LessonBody text={s.body} />
            {s.animation && <AnimatedExplainer script={s.animation} />}

            {s.circuit && (
              <div className="lesson-embed">
                <CircuitCanvas circuit={s.circuit} onChange={() => {}} readOnly />
                <div className="lesson-embed-side">
                  <LessonPreview circuit={s.circuit} />
                  {s.watch && <p className="tiny dim lesson-watch">👁 {s.watch}</p>}
                  <button className="btn btn-sm btn-primary" onClick={() => onTry(s.circuit!)}>Open in the builder</button>
                </div>
              </div>
            )}
          </article>
        ))}

        <div className="glass panel lesson-finish rise">
          {done.includes(lesson.id) ? (
            <>
              <span className="chip chip-mint">completed</span>
              <p className="tiny dim">You have finished this lesson. Practice questions and challenges for {lesson.title.toLowerCase()} are waiting.</p>
            </>
          ) : (
            <>
              <h3>Finished {lesson.title}?</h3>
              <p className="tiny dim">Marking it complete records it on your dashboard and updates your learning path.</p>
              <button className="btn btn-primary" onClick={() => onDone(lesson)}>Mark as complete</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonPreview({ circuit }: { circuit: Circuit }) {
  const state = useMemo(() => { try { return run(circuit).state; } catch { return null; } }, [circuit]);
  if (!state) return null;
  return (
    <div className="lesson-preview">
      <KetLine state={state} />
      <div className="bloch-strip bloch-strip-sm">
        {/* Flat on purpose. A lesson page can hold a dozen of these, and WebGL contexts
            are a scarce browser resource — the 3D spheres are reserved for the builder
            and the animated explainer, where the learner is actually watching them move. */}
        {Array.from({ length: Math.min(state.n, 3) }, (_, q) => (
          <BlochFlat key={q} {...state.bloch(q)} label={`q${q}`} size={112} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ challenges */

function ChallengeView({ challenge, setChallenge, solved, onResult, circuit, setCircuit }: {
  challenge: Challenge | null; setChallenge: (c: Challenge | null) => void;
  solved: string[]; onResult: (c: Challenge, ok: boolean) => void;
  circuit: Circuit; setCircuit: (c: Circuit) => void;
}) {
  const [result, setResult] = useState<ReturnType<typeof grade> | null>(null);
  const [hintsShown, setHintsShown] = useState(0);

  const start = (ch: Challenge) => {
    setChallenge(ch);
    setCircuit(cloneCircuit(ch.starter));
    setResult(null);
    setHintsShown(0);
  };

  const check = () => {
    if (!challenge) return;
    const r = grade(circuit, challenge);
    setResult(r);
    onResult(challenge, r.passed);
  };

  const targetState = useMemo(() => {
    if (!challenge) return undefined;
    try { return run(challenge.solution).state; } catch { return undefined; }
  }, [challenge]);

  if (!challenge) {
    return (
      <div className="stage stage-single scroll">
        <div className="reading">
          <h1 className="rise">Challenges</h1>
          <p className="rise rise-1">Graded by running your circuit and comparing the state it produces against the target. Not by matching your gates to ours — a different but correct answer passes.</p>
          <div className="card-grid">
            {CHALLENGES.map((c, i) => (
              <button key={c.id} className={`glass glass-hover lesson-card rise rise-${Math.min(i + 1, 3)}`} onClick={() => start(c)}>
                <div className="lesson-card-top">
                  <span className="chip tiny">{c.concept}</span>
                  {/* Tier is read from the solution's own shape, so the label cannot
                      disagree with how demanding the exercise actually is. */}
                  <span className="chip tiny tier-chip">{TIER_LABEL[tierOf(c)]}</span>
                  {solved.includes(c.id) && <span className="chip chip-mint tiny">solved</span>}
                </div>
                <h3>{c.title}</h3>
                <p className="tiny dim">{c.brief}</p>
                <span className="lesson-card-go tiny">
                  {solved.includes(c.id) ? 'Solved' : `Start — ${challengePoints(c)} pts`} →
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stage stage-build">
      <div className="col col-build">
        <section className="glass panel rise">
          <div className="panel-head">
            <button className="btn btn-sm btn-ghost" onClick={() => setChallenge(null)}>← Challenges</button>
            <h3 className="panel-title" style={{ marginLeft: 8 }}>{challenge.title}</h3>
            <div className="panel-tools">
              <button className="btn btn-sm btn-ghost" onClick={() => setCircuit(cloneCircuit(challenge.starter))}>Reset</button>
              <button className="btn btn-sm btn-primary" onClick={check}>Check my answer</button>
            </div>
          </div>
          <p className="tiny dim challenge-brief">{challenge.brief}</p>
          <CircuitCanvas circuit={circuit} onChange={c => { setCircuit(c); setResult(null); }} />
        </section>

        <section className="glass panel rise rise-1 scroll">
          {result ? (
            <div className={`verdict ${result.passed ? 'verdict-pass' : 'verdict-fail'}`}>
              <h3>{result.passed ? 'Correct' : 'Not yet'}</h3>
              {result.messages.map((m, i) => <p key={i} className="tiny">{m}</p>)}
              <ul className="checklist">
                {result.checks.map((c, i) => (
                  <li key={i} className={c.ok ? 'ok' : 'no'}>
                    <span aria-hidden>{c.ok ? '✓' : '✗'}</span>
                    <span>{c.label}{c.detail ? ` — ${c.detail}` : ''}</span>
                  </li>
                ))}
              </ul>
              <div className="fidelity-bar" title={`Fidelity with the target state: ${(result.fidelity * 100).toFixed(2)}%`}>
                <div style={{ width: `${result.fidelity * 100}%` }} />
                <span className="num tiny">{(result.fidelity * 100).toFixed(1)}% fidelity</span>
              </div>
            </div>
          ) : (
            <p className="tiny dim">Build your circuit, then check it. The grader runs it and compares the actual quantum state.</p>
          )}

          <div className="hints">
            {challenge.hints.slice(0, hintsShown).map((h, i) => <p key={i} className="tiny hint">💡 {h}</p>)}
            {hintsShown < challenge.hints.length && (
              <button className="btn btn-sm btn-ghost" onClick={() => setHintsShown(n => n + 1)}>
                Show a hint ({challenge.hints.length - hintsShown} left)
              </button>
            )}
          </div>
        </section>
      </div>

      <div className="col">
        <section className="glass panel rise rise-2 side-tutor">
          <TutorPanel circuit={circuit} target={targetState} onApply={setCircuit} />
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ progress */

function DashboardView({ mastery, solved, lessonsDone, quizAnswers, practiceDays, onGo }: {
  mastery: Mastery; solved: string[]; lessonsDone: string[];
  quizAnswers: Record<string, boolean>; practiceDays: string[]; onGo: (v: View) => void;
}) {
  const rec = recommend(mastery);
  const recConcept = CONCEPTS.find(c => c.id === rec.conceptId)!;

  const quizDone = Object.keys(quizAnswers).length;
  const quizRight = Object.values(quizAnswers).filter(Boolean).length;

  const ranked = [...CONCEPTS].sort((a, b) => (mastery[b.id] ?? 0) - (mastery[a.id] ?? 0));
  const strengths = ranked.filter(c => (mastery[c.id] ?? 0) >= 0.6).slice(0, 3);
  const weaknesses = [...ranked].reverse().filter(c => (mastery[c.id] ?? 0) < 0.6).slice(0, 3);

  const badges = earnedBadges(lessonsDone, quizAnswers);
  const topicBadges = earnedTopicBadges(lessonsDone, quizAnswers);

  // Scored from the progress that already exists rather than from a parallel ledger,
  // so the number on screen can never disagree with what the learner actually did.
  const score = computeScore({
    lessonsDone, quizAnswers, solved, practiceDays,
    challenges: CHALLENGES,
    topicBadges: topicBadges.length,
    moduleBadges: badges.length,
  });
  const { level, next, progress } = levelFor(score.total);

  const stats = [
    { label: 'Points', value: score.total.toLocaleString(), view: 'learn' as View },
    { label: 'Day streak', value: score.streak > 0 ? `${score.streak}` : '—', view: 'practice' as View },
    { label: 'Badges earned', value: `${topicBadges.length + badges.length}/${TOPICS.length + MODULES.length}`, view: 'learn' as View },
    { label: 'Lessons completed', value: `${lessonsDone.length}/${ALL_LESSONS.length}`, view: 'learn' as View },
    { label: 'Challenges solved', value: `${solved.length}/${CHALLENGES.length}`, view: 'challenges' as View },
    { label: 'Quiz accuracy', value: quizDone ? `${Math.round((quizRight / quizDone) * 100)}%` : '—', view: 'practice' as View },
    { label: 'Questions answered', value: `${quizDone}/${QUIZZES.length}`, view: 'practice' as View },
  ];

  return (
    <div className="stage stage-single scroll">
      <div className="reading reading-wide">
        <h1 className="rise">Your dashboard</h1>

        {/* Badges first: progress you can see beats a percentage you have to interpret. */}
        <section className="glass panel rise rise-1 badge-panel">
          <span className="section-label">Badges</span>
          <div className="badge-shelf">
            {MODULES.map(m => {
              const prog = moduleProgress(m, lessonsDone, quizAnswers);
              return (
                <span
                  key={m.badge.id}
                  className={`badge-chip ${prog.earned ? '' : 'is-locked'}`}
                  title={prog.earned ? m.badge.earnedFor
                    : `${prog.lessonsDone}/${prog.lessonsTotal} lessons read, check ${prog.checkRight}/${prog.checkTotal}`}
                >
                  <span aria-hidden>{m.badge.emoji}</span> {m.badge.name}
                </span>
              );
            })}
          </div>
          <p className="tiny dim">
            {badges.length === MODULES.length
              ? 'Every module finished. Try the challenges next.'
              : 'A badge needs both halves: every lesson in the module read, and its check passed.'}
          </p>
        </section>

        <section className="glass panel level-card rise rise-1">
          <div className="level-head">
            <div>
              <span className="tiny dim">Level</span>
              <h2>{level.name}</h2>
            </div>
            <span className="level-points num">{score.total.toLocaleString()} pts</span>
          </div>
          <div className="level-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="tiny dim">
            {next
              ? `${(next.at - score.total).toLocaleString()} points to ${next.name}`
              : 'Top level reached.'}
            {score.streak > 0 && ` · ${score.streak} day streak`}
          </p>
          <ul className="points-breakdown tiny">
            {score.breakdown.filter(b => b.points > 0).map(b => (
              <li key={b.label}>
                <span>{b.label}</span>
                <span className="dim">{b.detail}</span>
                <span className="num">+{b.points}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="stat-grid rise rise-1">
          {stats.map(st => (
            <button key={st.label} className="glass glass-hover stat-card" onClick={() => onGo(st.view)}>
              <span className="stat-value num">{st.value}</span>
              <span className="tiny dim">{st.label}</span>
            </button>
          ))}
        </div>

        <section className="glass panel rise rise-2 recommend">
          <span className="chip chip-accent tiny">recommended next</span>
          <h2>{recConcept.name}</h2>
          <p>{rec.reason}</p>
          <p className="tiny dim">{recConcept.blurb}</p>
          <div className="recommend-actions">
            <button className="btn btn-primary" onClick={() => onGo('learn')}>Read the lesson</button>
            <button className="btn" onClick={() => onGo('practice')}>Practise questions</button>
            <button className="btn" onClick={() => onGo('challenges')}>Try a challenge</button>
          </div>
        </section>

        <div className="two-col rise rise-3">
          <section className="glass panel">
            <div className="panel-head"><h3 className="panel-title">Your strengths</h3></div>
            {strengths.length ? strengths.map(c => (
              <div key={c.id} className="sw-row">
                <span className="chip chip-mint tiny">{Math.round((mastery[c.id] ?? 0) * 100)}%</span>
                <div><strong>{c.name}</strong><p className="tiny dim">{c.blurb}</p></div>
              </div>
            )) : <p className="tiny dim">Answer a few questions and your strongest topics will appear here.</p>}
          </section>

          <section className="glass panel">
            <div className="panel-head"><h3 className="panel-title">Needs work</h3></div>
            {weaknesses.length ? weaknesses.map(c => (
              <div key={c.id} className="sw-row">
                <span className="chip chip-amber tiny">{Math.round((mastery[c.id] ?? 0) * 100)}%</span>
                <div><strong>{c.name}</strong><p className="tiny dim">{c.blurb}</p></div>
              </div>
            )) : <p className="tiny dim">Nothing is lagging behind. Keep going.</p>}
          </section>
        </div>

        <section className="glass panel rise">
          <div className="panel-head"><h3 className="panel-title">Concept mastery</h3>
            <span className="tiny dim panel-tools">Bayesian knowledge tracing</span>
          </div>
          {CONCEPTS.map(c => {
            const m = mastery[c.id] ?? 0;
            const unlocked = isUnlocked(mastery, c.id);
            return (
              <div key={c.id} className={`mastery-row ${unlocked ? '' : 'locked'}`}>
                <div className="mastery-label">
                  <strong>{c.name}</strong>
                  {!unlocked && <span className="chip tiny">needs {c.requires.map(r => CONCEPTS.find(x => x.id === r)?.name).join(', ')}</span>}
                  {isMastered(mastery, c.id) && <span className="chip chip-mint tiny">mastered</span>}
                </div>
                <div className="mastery-track"><div className="mastery-fill" style={{ width: `${m * 100}%` }} /></div>
                <span className="num tiny">{Math.round(m * 100)}%</span>
              </div>
            );
          })}
          <p className="tiny dim" style={{ marginTop: 12 }}>
            A correct answer raises mastery, a wrong one lowers it, and the model accounts for lucky guesses
            and careless slips. It is interpretable on purpose: every number here comes with a reason you can read.
          </p>
        </section>

        <section className="glass panel rise">
          <div className="panel-head"><h3 className="panel-title">Recent activity</h3></div>
          {lessonsDone.length + solved.length + quizDone === 0 ? (
            <p className="tiny dim">Nothing yet. Start with a lesson.</p>
          ) : (
            <ul className="activity">
              {lessonsDone.slice(-4).reverse().map(id => {
                const l = LESSONS.find(x => x.id === id);
                return l ? <li key={`l${id}`}><span className="chip tiny">lesson</span> Completed <strong>{l.title}</strong></li> : null;
              })}
              {solved.slice(-4).reverse().map(id => {
                const c = CHALLENGES.find(x => x.id === id);
                return c ? <li key={`c${id}`}><span className="chip chip-mint tiny">challenge</span> Solved <strong>{c.title}</strong></li> : null;
              })}
              {quizDone > 0 && (
                <li><span className="chip chip-accent tiny">practice</span> Answered <strong>{quizDone}</strong> question{quizDone === 1 ? '' : 's'}, {quizRight} correct</li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ instructor */

const DEMO_COHORT = [
  'Aarav', 'Diya', 'Ishaan', 'Meera', 'Rohan', 'Sanya', 'Vikram', 'Ananya', 'Karthik', 'Priya',
];

function InstructorView({ mastery, solved }: { mastery: Mastery; solved: string[] }) {
  /** Seeded synthetic cohort so the dashboard shows a realistic class, plus the real learner. */
  const cohort = useMemo(() => {
    const rows = DEMO_COHORT.map((name, i) => {
      let m = initialMastery();
      let r = (i + 3) * 7919;
      const next = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
      // Each learner has an overall ability, and every concept has its own difficulty.
      // Two sources of variation is what stops the heatmap looking uniformly green.
      const ability = 0.3 + (i / DEMO_COHORT.length) * 0.55;
      for (const c of CONCEPTS) {
        const difficulty = 0.2 + CONCEPTS.indexOf(c) * 0.07;
        const attempts = 1 + Math.floor(next() * 6);
        for (let a = 0; a < attempts; a++) m = observe(m, c.id, next() < ability - difficulty + 0.35);
      }
      return { name, mastery: m, you: false };
    });
    return [{ name: 'You', mastery, you: true }, ...rows];
  }, [mastery]);

  const weakest = useMemo(() => cohortWeakest(cohort.map(c => c.mastery)), [cohort]);

  return (
    <div className="stage stage-single scroll">
      <div className="reading reading-wide">
        <h1 className="rise">Instructor view</h1>
        <p className="rise rise-1">Which concept is this class actually failing — not who submitted. The cohort below is synthetic demonstration data; your own row is real.</p>

        <section className="glass panel rise rise-2">
          <div className="panel-head"><h3 className="panel-title">Where the class is weakest</h3></div>
          <div className="weak-grid">
            {weakest.slice(0, 4).map((w, i) => {
              const c = CONCEPTS.find(x => x.id === w.conceptId)!;
              return (
                <div key={w.conceptId} className={`glass glass-soft weak-card ${i === 0 ? 'weak-top' : ''}`}>
                  <span className={`chip tiny ${i === 0 ? 'chip-rose' : ''}`}>{i === 0 ? 'needs attention' : `#${i + 1}`}</span>
                  <h4>{c.name}</h4>
                  <div className="num weak-pct">{Math.round(w.average * 100)}%</div>
                  <p className="tiny dim">class average mastery</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="glass panel panel-flush rise rise-3">
          <div className="panel-head" style={{ padding: '15px 17px 0' }}><h3 className="panel-title">Cohort</h3>
            <span className="tiny dim panel-tools">{cohort.length} learners</span>
          </div>
          <div className="scroll table-scroll">
            <table className="cohort">
              <thead>
                <tr>
                  <th>Learner</th>
                  {CONCEPTS.map(c => <th key={c.id} title={c.name}>{c.name.split(' ')[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {cohort.map(row => (
                  <tr key={row.name} className={row.you ? 'you' : ''}>
                    <td>{row.name}{row.you && <span className="chip chip-accent tiny" style={{ marginLeft: 6 }}>you</span>}</td>
                    {CONCEPTS.map(c => {
                      const v = row.mastery[c.id] ?? 0;
                      return (
                        <td key={c.id}>
                          <span className="heat" style={{ '--v': v } as React.CSSProperties} title={`${Math.round(v * 100)}%`}>
                            {Math.round(v * 100)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

const IconBuild = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 8h18M3 16h18" /><circle cx="9" cy="8" r="2.6" fill="currentColor" stroke="none" /><rect x="13" y="13" width="6" height="6" rx="2" /></svg>;
const IconLearn = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 0-2 1.5z" /><path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 1 2 1.5z" /></svg>;
const IconChallenge = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4 6.7 19.2l1.1-5.9L3.5 9.2l5.9-.8z" /></svg>;
const IconProgress = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>;
const IconQuiz = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9.2 9a3 3 0 1 1 4 2.8c-.8.3-1.2 1-1.2 1.8v.4" /><circle cx="12" cy="17.6" r="1" fill="currentColor" stroke="none" /><rect x="3.5" y="3.5" width="17" height="17" rx="5" /></svg>;
const IconTeacher = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 4 9 4.5-9 4.5-9-4.5z" /><path d="M7 11v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5" /></svg>;
