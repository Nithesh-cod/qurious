/**
 * The floating tutor: avatar, speech bubble, and answer panel.
 *
 * Answering has a strict order, and the answer always says which source produced it:
 *
 *   1. Offline knowledge base — instant, works with no network, and the content is
 *      written and checked by us.
 *   2. Language model — only if a key is configured and the base had nothing. Labelled
 *      as coming from the model, because prose cannot be verified the way a circuit can.
 *   3. An honest "I do not know that one", with what it *can* help with.
 *
 * This ordering is the whole design. A tutor that guesses confidently is worse than one
 * that says it does not know.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar3D, clampPos, type AvatarState } from './Avatar3D';
import { useSlideIn } from './useSlideIn';
import { search as searchKnowledge, smallTalk, byId, TOPIC_COUNT, type Entry } from '../core/knowledge';
import { askLlm, isConfigured, type LlmConfig } from '../core/llm';
import {
  LANGS, listenOnce, listeningSupported, primeVoices, speak, speechSupported,
  startWakeWord, stopSpeaking, type LangCode, type ListenHandle,
} from '../core/speech';
import { LoadingState } from './UiState';

export interface TutorMood {
  /** Set by the app when something happens, so the avatar reacts. */
  state: AvatarState;
  /** Optional line the tutor says unprompted. */
  say?: string;
  /** Changes whenever a new reaction fires, so repeats still trigger. */
  nonce: number;
}

interface Answer {
  question: string;
  text: string;
  source: 'knowledge' | 'model' | 'none';
  entry?: Entry;
  /**
   * The runners-up from the same search.
   *
   * With a thousand topics in the base, a question can legitimately match a general
   * explanation and a specific computed answer at nearly the same score, and only one of
   * them can be first. Offering the rest costs a line and means a good answer is never
   * more than one tap away because a tie went the other way.
   */
  alternatives?: Entry[];
  ms?: number;
}

/** What the avatar does with itself between questions. Every one of these has a clip. */
const IDLE_GESTURES: AvatarState[] = ['wave', 'point', 'think', 'celebrate', 'encourage'];

const SUGGESTIONS = [
  'What is a qubit?',
  'What is entanglement?',
  'How do I build a Bell state?',
  'Why is the arrow gone from the sphere?',
  'How are challenges graded?',
];

export function TutorAvatar({ mood, llm, lang, onLangChange, contextHint }: {
  mood: TutorMood;
  llm: LlmConfig;
  lang: LangCode;
  onLangChange: (l: LangCode) => void;
  /** What the learner is looking at, given to the model for relevance. */
  contextHint?: string;
}) {
  const [open, setOpen] = useState(false);
  // Small enough to read as a companion rather than an obstruction: 92px is a quarter
  // of a 384px phone screen, against 150px originally, which covered whole buttons.
  const avatarSize = typeof window !== 'undefined' && window.innerWidth < 760 ? 92 : 158;
  const [pos, setPos] = useState(() => loadPos(avatarSize));
  const [state, setState] = useState<AvatarState>('idle');
  const [level, setLevel] = useState(0);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  /**
   * The wake word is always on; this is not a preference.
   *
   * It only goes false when the device itself refuses — microphone permission denied, or
   * no recogniser at all. Retrying forever after a denial would hold the microphone open
   * and never work, so the listener stands down and says why.
   */
  const [wakeBlocked, setWakeBlocked] = useState(false);
  /**
   * Bumped every time the wake word fires, purely to rebuild the listener.
   *
   * Both recognisers hand back one utterance and stop. The web one restarts itself; the
   * Android one does not, so after a single "hey tutor" it would go deaf until something
   * else happened to re-run this effect. Usually speaking or listening does that — but
   * not when the tutor is muted, which is exactly when nobody would notice it had
   * stopped. Restarting on a counter makes it unconditional.
   */
  const [wakeNonce, setWakeNonce] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const slide = useSlideIn();
  const listenRef = useRef<ListenHandle | null>(null);
  const wakeRef = useRef<ListenHandle | null>(null);
  const bubbleTimer = useRef<number | null>(null);

  useEffect(() => { primeVoices(); }, []);
  useEffect(() => { savePos(pos); }, [pos]);

  // ---------------------------------------------------------------- speaking
  const say = useCallback(async (text: string, showBubble = true) => {
    if (showBubble) {
      setBubble(text.length > 150 ? text.slice(0, 147) + '…' : text);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => setBubble(null), Math.min(9000, 2600 + text.length * 45));
    }
    if (muted || !speechSupported()) { setState('idle'); return; }
    setState('talk');
    // The wake listener pauses while this is true. Without that the tutor hears itself
    // say "hey" or "tutor" mid-answer and wakes itself in a loop.
    setSpeaking(true);
    try {
      await speak(text, lang, { onLevel: setLevel, onEnd: () => { setLevel(0); setState('idle'); } });
    } finally {
      setSpeaking(false);
    }
  }, [lang, muted]);

  // ---------------------------------------------------------------- answering
  const answerQuestion = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setBusy(true);
    setState('think');
    setAnswer(null);

    // 0. Greetings and pleasantries. Without this a bare "hi" gets forced through topic
    //    matching and comes back with whatever scored least badly.
    const chat = smallTalk(trimmed);
    if (chat) {
      setAnswer({ question: trimmed, text: chat, source: 'knowledge' });
      setBusy(false);
      await say(chat);
      return;
    }

    // 1. Offline knowledge base.
    const hits = searchKnowledge(trimmed);
    if (hits.length) {
      const entry = hits[0].entry;
      const a: Answer = {
        question: trimmed, text: entry.body, source: 'knowledge', entry,
        alternatives: hits.slice(1).map(h => h.entry),
      };
      setAnswer(a);
      setBusy(false);
      await say(entry.body);
      return;
    }

    // 2. Language model, if one is configured.
    if (isConfigured(llm)) {
      try {
        const r = await askLlm(llm, trimmed, contextHint);
        const a: Answer = { question: trimmed, text: r.text, source: 'model', ms: r.ms };
        setAnswer(a);
        setBusy(false);
        await say(r.text);
        return;
      } catch (e) {
        setNotice((e as Error).message);
      }
    }

    // 3. Honest decline.
    const text =
      `I do not have that one built in. I know about ${TOPIC_COUNT} quantum topics offline — ` +
      `qubits, superposition, entanglement, phase, measurement, the gates, Grover and Deutsch-Jozsa. ` +
      (isConfigured(llm)
        ? 'My connection to the language model just failed, so try again in a moment.'
        : 'Connect a language model in Settings and I can answer wider questions too.');
    setAnswer({ question: trimmed, text, source: 'none' });
    setBusy(false);
    await say(text);
  }, [llm, contextHint, say]);

  // ---------------------------------------------------------------- listening
  const startListening = useCallback(() => {
    if (!listeningSupported()) { setNotice('This device cannot listen. Type your question instead.'); return; }
    setListening(true);
    setState('listen');
    setQuestion('');
    listenRef.current = listenOnce(
      lang,
      (text, final) => {
        setQuestion(text);
        if (final) {
          setListening(false);
          listenRef.current = null;
          answerQuestion(text);
        }
      },
      msg => { setListening(false); setState('idle'); setNotice(msg); }
    );
  }, [lang, answerQuestion]);

  const stopListening = () => {
    listenRef.current?.stop();
    listenRef.current = null;
    setListening(false);
    setState('idle');
  };

  // ---------------------------------------------------------------- wake word
  /**
   * Listening for "hey tutor" whenever nothing else is using the microphone.
   *
   * There are exactly two reasons to stand down, and neither is a setting. While the
   * learner is dictating a question the recogniser is already theirs, and two listeners
   * on one microphone means neither gets a clean utterance. While the tutor is speaking
   * it would hear its own voice, and any answer containing the word "tutor" would wake
   * it again — a loop that gets louder.
   */
  useEffect(() => {
    if (wakeBlocked || listening || speaking || !listeningSupported()) {
      wakeRef.current?.stop();
      wakeRef.current = null;
      return;
    }
    wakeRef.current = startWakeWord({
      lang,
      onWake: after => {
        setWakeNonce(n => n + 1);
        setOpen(true);
        if (after) { setQuestion(after); answerQuestion(after); }
        else { say('Yes? Ask me anything.'); setTimeout(startListening, 900); }
      },
      onError: msg => { setNotice(msg); setWakeBlocked(true); },
    });
    return () => { wakeRef.current?.stop(); wakeRef.current = null; };
  }, [wakeBlocked, wakeNonce, listening, speaking, lang, answerQuestion, say, startListening]);

  // ---------------------------------------------------------------- reactions
  const lastNonce = useRef(0);
  useEffect(() => {
    if (mood.nonce === lastNonce.current) return;
    lastNonce.current = mood.nonce;
    setState(mood.state);
    if (mood.say) say(mood.say);
    else if (mood.state !== 'idle') {
      const t = setTimeout(() => setState('idle'), 2800);
      return () => clearTimeout(t);
    }
  }, [mood, say]);

  // ---------------------------------------------------------------- idle life
  // Every clip was loading and none of them ever played: nothing outside a direct
  // reaction moved the avatar off 'idle', so on a phone it stood still for minutes.
  // This is the heartbeat that gives it a repertoire — a gesture every few seconds,
  // and now and then a wander to somewhere else on the screen.
  const [roam, setRoam] = useState(loadRoam);
  const [gliding, setGliding] = useState(false);
  const lastDrag = useRef(0);
  const glideTimer = useRef<number | null>(null);

  useEffect(() => { saveRoam(roam); }, [roam]);

  // The heartbeat must not restart every time the state changes — that would reset the
  // timer on its own gestures and it would never settle. So it reads the live values
  // through a ref instead of through the dependency list.
  const live = useRef({ open, busy, listening, bubble, state, roam });
  live.current = { open, busy, listening, bubble, state, roam };

  useEffect(() => {
    let timer = 0;
    const canFidget = () => {
      const l = live.current;
      return !l.open && !l.busy && !l.listening && !l.bubble && l.state === 'idle';
    };

    const beat = () => {
      timer = window.setTimeout(() => {
        if (canFidget()) {
          // Wandering is the point, not a garnish: the whole avatar — rings and all —
          // walks to somewhere else on the page. It backs off only for a short while
          // after the learner has deliberately parked it.
          const mayRoam = live.current.roam && Date.now() - lastDrag.current > 12_000;
          if (mayRoam && Math.random() < 0.62) {
            setState('walk');
            setGliding(true);
            // The full page, not a timid box in the middle. clampPos keeps it on screen
            // and clear of the bottom navigation.
            setPos(clampPos(0.06 + Math.random() * 0.88, 0.10 + Math.random() * 0.86, avatarSize));
            if (glideTimer.current) clearTimeout(glideTimer.current);
            glideTimer.current = window.setTimeout(() => {
              setGliding(false);
              setState(s => (s === 'walk' ? 'idle' : s));
            }, 2600);
          } else {
            const g = IDLE_GESTURES[Math.floor(Math.random() * IDLE_GESTURES.length)];
            setState(g);
            window.setTimeout(() => setState(s => (s === g ? 'idle' : s)), 2400);
          }
        }
        beat();
      }, 3200 + Math.random() * 4200);
    };

    beat();
    return () => { clearTimeout(timer); if (glideTimer.current) clearTimeout(glideTimer.current); };
  }, [avatarSize]);

  // Follow the learner between screens. Changing tab is the clearest moment to show that
  // the tutor lives on the whole site rather than in one corner of one page.
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) { firstScreen.current = false; return; }
    if (!live.current.roam || live.current.open) return;
    setState('walk');
    setGliding(true);
    setPos(clampPos(0.06 + Math.random() * 0.88, 0.12 + Math.random() * 0.82, avatarSize));
    const t = window.setTimeout(() => {
      setGliding(false);
      setState(s => (s === 'walk' ? 'idle' : s));
    }, 2600);
    return () => clearTimeout(t);
  }, [contextHint, avatarSize]);

  useEffect(() => () => { stopSpeaking(); listenRef.current?.stop(); wakeRef.current?.stop(); }, []);

  const relatedChips = answer?.entry?.related
    ?.map(id => byId(id))
    .filter((e): e is Entry => !!e) ?? [];

  return (
    <>
      <Avatar3D
        state={state} level={level} pos={pos}
        onPosChange={p => {
          // A deliberate placement wins: stop wandering for a while and drop the glide,
          // so the avatar tracks the finger instead of easing after it.
          lastDrag.current = Date.now();
          setGliding(false);
          setPos(p);
        }}
        onClick={() => setOpen(o => !o)}
        size={avatarSize}
        gliding={gliding}
      />

      {bubble && !open && (
        <div
          className="avatar-bubble glass glass-strong"
          style={{
            left: `calc(${pos.x * 100}% ${pos.x > 0.6 ? '- 268px' : '+ 62px'})`,
            top: `calc(${pos.y * 100}% - 34px)`,
          }}
          onClick={() => setOpen(true)}
        >
          {bubble}
        </div>
      )}

      {open && (
        <>
          <div className={`sheet-backdrop ${slide}`} onClick={() => { setOpen(false); stopSpeaking(); setState('idle'); }} />
          <section className={`glass sheet tutor-sheet ${slide}`} role="dialog" aria-label="Tutor">
            <span className="sheet-grip" />

            <div className="sheet-head">
              <h3>Ask the tutor</h3>
              <span className={`chip tiny ${isConfigured(llm) ? 'chip-accent' : 'chip-mint'}`}>
                {isConfigured(llm) ? 'offline + model' : 'offline'}
              </span>
              <div className="panel-tools">
                <button className="btn btn-sm btn-icon btn-ghost" title={muted ? 'Unmute' : 'Mute'}
                        onClick={() => { setMuted(m => !m); stopSpeaking(); }}>
                  {muted ? '🔇' : '🔊'}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => { setOpen(false); stopSpeaking(); }}>Close</button>
              </div>
            </div>

            <div className="tutor-ask">
              <input
                type="text" value={question} placeholder="Ask anything — or say “hey tutor”"
                onChange={e => { setQuestion(e.target.value); setNotice(null); }}
                onKeyDown={e => e.key === 'Enter' && answerQuestion(question)}
                autoFocus
              />
              <button
                className={`btn btn-sm btn-icon ${listening ? 'btn-primary' : ''}`}
                title={listening ? 'Stop listening' : 'Speak your question'}
                onClick={listening ? stopListening : startListening}
              >🎤</button>
              <button className="btn btn-sm btn-primary" disabled={busy || !question.trim()}
                      onClick={() => answerQuestion(question)}>
                {busy ? '…' : 'Ask'}
              </button>
            </div>

            <div className="sheet-body">
              {notice && <p className="notice notice-warn tiny">{notice}</p>}

              {!answer && !busy && (
                <>
                  <p className="tiny dim">
                    I know {TOPIC_COUNT} quantum topics with no internet at all. Tap one, or ask in your own words.
                  </p>
                  <div className="tutor-suggestions">
                    {SUGGESTIONS.map(s => (
                      <button key={s} className="chip" onClick={() => { setQuestion(s); answerQuestion(s); }}>{s}</button>
                    ))}
                  </div>
                </>
              )}

              {busy && (
                <LoadingState
                  label="Thinking"
                  slowAfter={3500}
                  slowLabel="Still working. The offline topics answer instantly; a language model reply depends on the network."
                />
              )}

              {answer && (
                <article className="tutor-answer rise">
                  <div className="tutor-answer-head">
                    {/* Say where the answer came from. A computed one was produced by
                        running the circuit just now, which is a stronger guarantee than
                        "somebody wrote this down once" — so it is worth naming. */}
                    <span className={`chip tiny ${answer.source === 'knowledge' ? 'chip-mint' : answer.source === 'model' ? 'chip-accent' : 'chip-amber'}`}>
                      {answer.source === 'knowledge'
                        ? (answer.entry?.computed ? 'computed on the simulator' : 'built-in knowledge')
                        : answer.source === 'model' ? `language model${answer.ms ? ` · ${answer.ms} ms` : ''}`
                        : 'not in my knowledge'}
                    </span>
                    {speechSupported() && !muted && (
                      <button className="btn btn-sm btn-ghost" onClick={() => say(answer.text, false)}>Say it again</button>
                    )}
                  </div>
                  {answer.entry && <h4>{answer.entry.title}</h4>}
                  <p>{answer.text}</p>

                  {!!answer.alternatives?.length && (
                    <div className="tutor-suggestions">
                      <span className="tiny dim">Or did you mean:</span>
                      {answer.alternatives.map(e => (
                        <button key={e.id} className="chip" onClick={() => { setQuestion(e.title); answerQuestion(e.title); }}>
                          {e.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {relatedChips.length > 0 && (
                    <div className="tutor-suggestions">
                      <span className="tiny dim">Next:</span>
                      {relatedChips.map(e => (
                        <button key={e.id} className="chip" onClick={() => { setQuestion(e.title); answerQuestion(e.title); }}>
                          {e.title}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              )}

              <div className="tutor-settings-row">
                <label className="tiny dim">
                  Voice
                  <select value={lang} onChange={e => onLangChange(e.target.value as LangCode)}>
                    {LANGS.map(l => <option key={l.code} value={l.code}>{l.native} — {l.label}</option>)}
                  </select>
                </label>
                <label className="tiny dim wake-toggle">
                  <input type="checkbox" checked={roam} onChange={e => setRoam(e.target.checked)} />
                  Let me wander the screen
                </label>
              </div>
              <p className="tiny dim">
                {!listeningSupported()
                  ? 'This device has no speech recognition, so “hey tutor” is unavailable. Tap the avatar instead.'
                  : wakeBlocked
                    ? 'The microphone is unavailable, so “hey tutor” has stood down. Tapping the avatar always works.'
                    : 'Say “hey tutor” any time. On Android this needs microphone permission and a network connection — tapping the avatar always works regardless.'}
              </p>
            </div>
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- position memory

const ROAM_KEY = 'quantum-learning:avatar-roam';

function loadRoam(): boolean {
  try { return localStorage.getItem(ROAM_KEY) !== '0'; } catch { return true; }
}
function saveRoam(on: boolean): void {
  try { localStorage.setItem(ROAM_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

const POS_KEY = 'quantum-learning:avatar-pos';
function loadPos(size: number): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) { const p = JSON.parse(raw); return clampPos(p.x, p.y, size); }
  } catch { /* fall through */ }
  // Bottom right, just above the navigation bar: near the thumb and clear of the
  // primary controls, which sit higher up on every screen.
  return clampPos(0.88, 0.94, size);
}
function savePos(p: { x: number; y: number }) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* nothing to do */ }
}
