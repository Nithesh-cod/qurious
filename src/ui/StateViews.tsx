/**
 * State visualisation — amplitudes, phase, measurement outcomes.
 *
 * Amplitude bars carry phase as hue, because phase is the part of a quantum state
 * that students most often forget exists: it is invisible in the probabilities and
 * decisive in the interference. Showing it as colour makes "the phase changed but
 * the probabilities did not" something you can see rather than be told.
 */

import { useMemo } from 'react';
import { sample, toKet, type Statevector } from '../core/simulator';

const phaseColor = (re: number, im: number) => {
  const a = Math.atan2(im, re);
  const deg = ((a * 180) / Math.PI + 360) % 360;
  return `hsl(${deg.toFixed(0)} 85% 66%)`;
};

export function KetLine({ state }: { state: Statevector }) {
  return (
    <div className="ket-line">
      <span className="ket-psi">|ψ⟩ =</span>
      <span className="ket-body mono">{toKet(state, { maxTerms: 6 })}</span>
    </div>
  );
}

export function AmplitudeBars({ state, max = 16 }: { state: Statevector; max?: number }) {
  const rows = useMemo(() => {
    const out: { i: number; p: number; re: number; im: number; label: string }[] = [];
    for (let i = 0; i < state.size; i++) {
      const p = state.re[i] * state.re[i] + state.im[i] * state.im[i];
      if (p < 1e-9) continue;
      out.push({ i, p, re: state.re[i], im: state.im[i], label: i.toString(2).padStart(state.n, '0') });
    }
    out.sort((a, b) => b.p - a.p);
    return out.slice(0, max);
  }, [state, max]);

  if (!rows.length) return <p className="tiny dim">No amplitude to show.</p>;

  return (
    <div className="amp-list">
      {rows.map(r => (
        <div className="amp-row" key={r.i}>
          <span className="amp-label mono">|{r.label}⟩</span>
          <div className="amp-track">
            <div
              className="amp-fill"
              style={{ width: `${Math.max(r.p * 100, 1.5)}%`, background: `linear-gradient(90deg, ${phaseColor(r.re, r.im)}, color-mix(in srgb, ${phaseColor(r.re, r.im)} 55%, transparent))` }}
            />
          </div>
          <span className="amp-pct num tiny">{(r.p * 100).toFixed(1)}%</span>
          <span className="amp-phase" title={`phase ${(Math.atan2(r.im, r.re) * 180 / Math.PI).toFixed(0)}°`}
                style={{ background: phaseColor(r.re, r.im) }} />
        </div>
      ))}
      <div className="amp-legend tiny dim">
        <span>bar length = probability</span>
        <span className="amp-legend-swatch" />
        <span>colour = phase</span>
      </div>
    </div>
  );
}

export function Histogram({ state, shots, seed = 20260920 }: { state: Statevector; shots: number; seed?: number }) {
  const counts = useMemo(() => sample(state, shots, seed), [state, shots, seed]);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 16);
  const top = Math.max(1, ...entries.map(e => e[1]));

  if (!entries.length) return <p className="tiny dim">Run the circuit to see outcomes.</p>;

  return (
    <div className="hist">
      <div className="hist-bars">
        {entries.map(([k, v]) => (
          <div className="hist-col" key={k} title={`${k}: ${v} of ${shots} shots`}>
            <span className="hist-count num tiny">{v}</span>
            <div className="hist-bar" style={{ height: `${(v / top) * 100}%` }} />
            <span className="hist-key mono tiny">{k}</span>
          </div>
        ))}
      </div>
      <p className="tiny dim hist-note">{shots.toLocaleString()} simulated shots · qubit 0 is the rightmost bit</p>
    </div>
  );
}

export function ProbabilityTable({ state }: { state: Statevector }) {
  const rows = useMemo(() => {
    const p = state.probabilities();
    return Array.from(p).map((v, i) => ({ i, v })).filter(r => r.v > 1e-9).sort((a, b) => b.v - a.v).slice(0, 12);
  }, [state]);
  return (
    <table className="ptable">
      <thead><tr><th>Outcome</th><th>Probability</th><th>Amplitude</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.i}>
            <td className="mono">|{r.i.toString(2).padStart(state.n, '0')}⟩</td>
            <td className="num">{(r.v * 100).toFixed(2)}%</td>
            <td className="num tiny dim">{fmtC(state.re[r.i], state.im[r.i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const fmtC = (re: number, im: number) => {
  const r = Math.abs(re) < 5e-4 ? 0 : re;
  const i = Math.abs(im) < 5e-4 ? 0 : im;
  if (!i) return r.toFixed(3);
  if (!r) return `${i.toFixed(3)}i`;
  return `${r.toFixed(3)}${i > 0 ? '+' : '−'}${Math.abs(i).toFixed(3)}i`;
};
