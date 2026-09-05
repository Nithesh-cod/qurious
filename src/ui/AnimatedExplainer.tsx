/**
 * Animated explanations.
 *
 * A lesson beat is a circuit prefix plus a caption. The explainer plays through the
 * beats, and at every frame the state shown is *computed by the simulator* from the
 * gates applied so far — nothing is drawn from a stored keyframe. That means an
 * animation can never disagree with the physics, and editing the gate list edits the
 * animation.
 *
 * What moves: the gates appear one at a time, the Bloch arrows rotate smoothly to
 * their new direction, and the amplitude bars grow, shrink and change colour as the
 * phase turns. Interference becomes something you watch happen rather than read about.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GATE_LABEL, type Circuit, type GateOp } from '../core/ir';
import { run, toKet, type Statevector } from '../core/simulator';
import { BlochSphere, BlochFlat } from './BlochSphere';

export interface Beat {
  /** How many operations of the circuit have been applied at this beat. */
  upto: number;
  caption: string;
  /** Seconds to hold this beat before advancing. */
  hold?: number;
  /** Draw attention to this idea. */
  emphasis?: 'normal' | 'key';
}

export interface ExplainerScript {
  title: string;
  circuit: Circuit;
  beats: Beat[];
  /** Which panels to show. Defaults to bloch + amplitudes. */
  show?: ('bloch' | 'amplitudes' | 'ket')[];
}

const webglOk = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
})();

const phaseColor = (re: number, im: number) => {
  const deg = ((Math.atan2(im, re) * 180) / Math.PI + 360) % 360;
  return `hsl(${deg.toFixed(0)} 85% 66%)`;
};

export function AnimatedExplainer({ script }: { script: ExplainerScript }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  const show = script.show ?? ['bloch', 'amplitudes'];
  const beat = script.beats[Math.min(index, script.beats.length - 1)];

  // Every state in the animation comes from the simulator, not from stored keyframes.
  const trace = useMemo(() => {
    try { return run(script.circuit).trace; } catch { return []; }
  }, [script.circuit]);

  const state: Statevector | undefined = trace[Math.min(beat.upto, trace.length - 1)];
  const applied: GateOp[] = script.circuit.ops.slice(0, beat.upto);

  const stop = useCallback(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    setPlaying(false);
  }, []);

  const advance = useCallback(() => {
    setIndex(i => {
      if (i + 1 >= script.beats.length) { setPlaying(false); return i; }
      return i + 1;
    });
  }, [script.beats.length]);

  useEffect(() => {
    if (!playing) return;
    const ms = (beat.hold ?? 3.4) * 1000;
    timer.current = window.setTimeout(advance, ms);
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [playing, index, beat.hold, advance]);

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  const atEnd = index >= script.beats.length - 1;

  const play = () => {
    if (atEnd) setIndex(0);
    setPlaying(true);
  };

  return (
    <figure className="explainer glass glass-soft">
      <figcaption className="explainer-head">
        <span className="chip chip-accent tiny">animated</span>
        <strong>{script.title}</strong>
        <span className="tiny dim explainer-count">{index + 1} / {script.beats.length}</span>
      </figcaption>

      {/* the circuit, revealed gate by gate */}
      <div className="explainer-strip" aria-hidden>
        {script.circuit.ops.map((op, i) => (
          <span
            key={op.id}
            className={`explainer-gate ${i < beat.upto ? 'on' : ''} ${i === beat.upto - 1 ? 'just-added' : ''}`}
          >
            {GATE_LABEL[op.name]}
            <em>q{op.qubits.join('')}</em>
          </span>
        ))}
      </div>

      <div className="explainer-stage">
        {show.includes('bloch') && state && (
          <div className="explainer-bloch">
            {Array.from({ length: state.n }, (_, q) => {
              const b = state.bloch(q);
              const P = webglOk ? BlochSphere : BlochFlat;
              return <P key={q} {...b} label={`q${q}`} size={webglOk ? 138 : 118} />;
            })}
          </div>
        )}

        {show.includes('amplitudes') && state && <AmpFlow state={state} />}
      </div>

      {show.includes('ket') && state && (
        <p className="explainer-ket mono tiny">|ψ⟩ = {toKet(state, { maxTerms: 5 })}</p>
      )}

      <p className={`explainer-caption ${beat.emphasis === 'key' ? 'key' : ''}`}>{beat.caption}</p>

      <div className="explainer-controls">
        <button className="btn btn-sm btn-icon" onClick={() => { stop(); setIndex(i => Math.max(0, i - 1)); }}
                disabled={index === 0} aria-label="Previous beat">‹</button>
        <button className="btn btn-sm btn-primary" onClick={playing ? stop : play}>
          {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <button className="btn btn-sm btn-icon" onClick={() => { stop(); advance(); }}
                disabled={atEnd} aria-label="Next beat">›</button>
        <div className="explainer-dots">
          {script.beats.map((_, i) => (
            <button
              key={i}
              className={`explainer-dot ${i === index ? 'on' : ''} ${i < index ? 'past' : ''}`}
              onClick={() => { stop(); setIndex(i); }}
              aria-label={`Beat ${i + 1}`}
            />
          ))}
        </div>
        <span className="tiny dim">{applied.length} of {script.circuit.ops.length} gates</span>
      </div>
    </figure>
  );
}

/**
 * Amplitude bars that animate.
 *
 * Every basis state keeps a row even at zero amplitude, so bars visibly grow and
 * collapse rather than appearing and vanishing — which is what makes cancellation
 * readable as an event.
 */
function AmpFlow({ state }: { state: Statevector }) {
  const rows = useMemo(() => {
    const out: { i: number; p: number; re: number; im: number; label: string }[] = [];
    const limit = Math.min(state.size, 8);
    for (let i = 0; i < limit; i++) {
      out.push({
        i,
        p: state.re[i] * state.re[i] + state.im[i] * state.im[i],
        re: state.re[i], im: state.im[i],
        label: i.toString(2).padStart(state.n, '0'),
      });
    }
    return out;
  }, [state]);

  return (
    <div className="ampflow">
      {rows.map(r => {
        const gone = r.p < 1e-9;
        return (
          <div className={`ampflow-row ${gone ? 'gone' : ''}`} key={r.i}>
            <span className="ampflow-label mono">|{r.label}⟩</span>
            <div className="ampflow-track">
              <div
                className="ampflow-fill"
                style={{
                  width: `${Math.max(r.p * 100, gone ? 0 : 1.5)}%`,
                  background: gone ? 'transparent' : phaseColor(r.re, r.im),
                }}
              />
            </div>
            <span className="ampflow-pct num tiny">{(r.p * 100).toFixed(0)}%</span>
          </div>
        );
      })}
      <p className="tiny dim ampflow-note">bar = probability · colour = phase</p>
    </div>
  );
}
