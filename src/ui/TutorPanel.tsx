/**
 * The tutor panel.
 *
 * Note what this component does *not* do: it never renders a claim that has not been
 * through the simulator. Every insight arrives already carrying a `confidence` of
 * "verified" or "observed", and the badge showing which is deliberate — the honesty
 * is a feature we display, not a caveat we hide.
 */

import { useMemo, useState } from 'react';
import { analyse, fromPrompt, NL_EXAMPLES, type Insight } from '../core/tutor';
import type { Circuit } from '../core/ir';
import type { Statevector } from '../core/simulator';

const ICON: Record<Insight['kind'], string> = {
  praise: '✓', repair: '↺', warning: '!', redundancy: '⇥', observation: '·',
};
const TONE: Record<Insight['kind'], string> = {
  praise: 'mint', repair: 'accent', warning: 'amber', redundancy: 'accent', observation: '',
};

export function TutorPanel({ circuit, target, onApply }: {
  circuit: Circuit;
  target?: Statevector;
  onApply: (c: Circuit) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [nlError, setNlError] = useState<string | null>(null);

  const report = useMemo(() => {
    try { return analyse({ circuit, target }); }
    catch (e) { return { insights: [{ kind: 'warning' as const, title: 'Could not analyse', detail: (e as Error).message, confidence: 'observed' as const }], rejected: 0, evaluated: 0 }; }
  }, [circuit, target]);

  const build = () => {
    const r = fromPrompt(prompt);
    if (!r) {
      setNlError(`I do not know how to build that offline yet. Try one of: ${NL_EXAMPLES.join(' · ')}`);
      return;
    }
    setNlError(null);
    onApply(r.circuit);
    setPrompt('');
  };

  return (
    <div className="tutor">
      <div className="panel-head">
        <h3 className="panel-title">Tutor</h3>
        <span className="chip chip-mint tiny" title="Every suggestion is executed on the simulator before you see it.">
          runs offline · self-checking
        </span>
      </div>

      <div className="tutor-ask">
        <input
          type="text" value={prompt} placeholder="Describe a circuit — “build a 3-qubit GHZ state”"
          onChange={e => { setPrompt(e.target.value); setNlError(null); }}
          onKeyDown={e => e.key === 'Enter' && build()}
        />
        <button className="btn btn-sm btn-primary" onClick={build} disabled={!prompt.trim()}>Build</button>
      </div>
      {nlError && <p className="tiny dim tutor-nl-error">{nlError}</p>}

      <div className="tutor-list scroll">
        {report.insights.map((ins, i) => (
          <article key={i} className={`glass glass-soft insight rise rise-${Math.min(i + 1, 3)}`} data-tone={TONE[ins.kind]}>
            <header className="insight-head">
              <span className="insight-icon" aria-hidden>{ICON[ins.kind]}</span>
              <h4>{ins.title}</h4>
              <span className={`chip tiny ${ins.confidence === 'verified' ? 'chip-mint' : ''}`}>
                {ins.confidence}
              </span>
            </header>
            <p className="tiny">{ins.detail}</p>

            {ins.evidence && (
              <div className="insight-evidence tiny mono">
                <span className="dim">before</span><span>{ins.evidence.before}</span>
                <span className="dim">after</span><span>{ins.evidence.after}</span>
              </div>
            )}

            {ins.fix && (
              <button className="btn btn-sm btn-primary insight-apply" onClick={() => onApply(ins.fix!)}>
                {ins.fixLabel ?? 'Apply this fix'}
              </button>
            )}
          </article>
        ))}
      </div>

      {report.evaluated > 0 && (
        <footer className="tutor-foot tiny dim">
          Checked <strong className="num">{report.evaluated.toLocaleString()}</strong> candidate circuits on the simulator
          and discarded <strong className="num">{report.rejected.toLocaleString()}</strong> that did not do what they claimed.
        </footer>
      )}
    </div>
  );
}
