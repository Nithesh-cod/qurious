/**
 * Noise Lab — the ideal result and the real one, side by side.
 *
 * Every teaching tool in this space shows perfect quantum mechanics. This one lets a
 * learner switch on a real machine's error rates and watch their circuit degrade: the
 * outcomes that should be impossible start appearing, and the fidelity number falls as
 * they add depth. It is the fastest way to understand why depth is the constraint on
 * real hardware, and why error correction is the field's central problem.
 */

import { useMemo, useState } from 'react';
import type { Circuit } from '../core/ir';
import { depth, gateCount } from '../core/ir';
import { run, sample } from '../core/simulator';
import {
  IDEAL, NOISE_MODELS, distributionFidelity, runNoisy, spuriousOutcomes, type NoiseModel,
} from '../core/noise';

export function NoiseLab({ circuit, shots }: { circuit: Circuit; shots: number }) {
  const [modelId, setModelId] = useState('nisq');
  const model: NoiseModel = NOISE_MODELS.find(m => m.id === modelId) ?? IDEAL;

  const result = useMemo(() => {
    try {
      const idealCounts = sample(run(circuit).state, shots, 20260920);
      const noisy = runNoisy(circuit, model, shots, 20260920);
      return {
        idealCounts,
        noisy,
        fidelity: distributionFidelity(idealCounts, noisy.counts),
        spurious: spuriousOutcomes(idealCounts, noisy.counts),
        error: null as string | null,
      };
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [circuit, model, shots]);

  if ('error' in result && result.error) {
    return <p className="notice notice-error tiny">{result.error}</p>;
  }
  const { idealCounts, noisy, fidelity, spurious } = result as Exclude<typeof result, { error: string }>;

  const keys = [...new Set([...Object.keys(idealCounts), ...Object.keys(noisy.counts)])].sort();
  const peak = Math.max(1, ...keys.map(k => Math.max(idealCounts[k] ?? 0, noisy.counts[k] ?? 0)));
  const errPct = (noisy.shotsWithError / Math.max(1, noisy.shots)) * 100;

  return (
    <div className="noiselab">
      <div className="noiselab-head">
        <div className="seg">
          {NOISE_MODELS.map(m => (
            <button key={m.id} aria-pressed={m.id === modelId} onClick={() => setModelId(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <p className="tiny dim noiselab-blurb">{model.blurb}</p>

      <div className="noiselab-stats">
        <div className={`noiselab-stat ${fidelity > 0.98 ? 'good' : fidelity > 0.85 ? 'warn' : 'bad'}`}>
          <span className="num">{(fidelity * 100).toFixed(1)}%</span>
          <span className="tiny dim">match with ideal</span>
        </div>
        <div className="noiselab-stat">
          <span className="num">{errPct.toFixed(0)}%</span>
          <span className="tiny dim">shots hit by an error</span>
        </div>
        <div className="noiselab-stat">
          <span className="num">{gateCount(circuit)} · {depth(circuit)}</span>
          <span className="tiny dim">gates · depth</span>
        </div>
      </div>

      <div className="noiselab-chart">
        {keys.map(k => {
          const i = idealCounts[k] ?? 0;
          const nz = noisy.counts[k] ?? 0;
          const impossible = i === 0 && nz > 0;
          return (
            <div className="noiselab-row" key={k}>
              <span className="noiselab-key mono">|{k}⟩</span>
              <div className="noiselab-bars">
                <div className="noiselab-bar ideal" style={{ width: `${(i / peak) * 100}%` }} title={`ideal ${i}`} />
                <div className={`noiselab-bar real ${impossible ? 'impossible' : ''}`}
                     style={{ width: `${(nz / peak) * 100}%` }} title={`with noise ${nz}`} />
              </div>
              <span className="noiselab-nums num tiny">
                {i} <span className="dim">→</span> {nz}
              </span>
            </div>
          );
        })}
      </div>

      <div className="noiselab-legend tiny dim">
        <span><i className="swatch ideal" /> ideal</span>
        <span><i className="swatch real" /> with noise</span>
        {spurious.length > 0 && <span><i className="swatch impossible" /> should be impossible</span>}
      </div>

      {spurious.length > 0 ? (
        <p className="tiny noiselab-verdict bad">
          {spurious.length === 1 ? 'One outcome appeared' : `${spurious.length} outcomes appeared`} that ideal
          physics forbids — {spurious.slice(0, 3).map(s => `|${s.key}⟩`).join(', ')}. On a real machine you
          cannot tell those apart from a correct answer without running many more shots.
        </p>
      ) : model.id === 'ideal' ? (
        <p className="tiny noiselab-verdict">
          This is the textbook result. Switch to a real machine above and watch what actually comes back.
        </p>
      ) : (
        <p className="tiny noiselab-verdict good">
          No forbidden outcomes at this error rate — the circuit is shallow enough to survive. Add more
          two-qubit gates and watch that change.
        </p>
      )}
    </div>
  );
}
