/**
 * Code editor, synced two ways with the canvas.
 *
 * Both are views of the same circuit IR, so this is not two implementations kept in
 * step — it is one structure projected twice. Editing OpenQASM here rebuilds the IR
 * and the canvas redraws; dragging a gate on the canvas rewrites this text.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { fromQasm, fromQiskit, transpile, TARGET_LABEL, type Target } from '../core/transpile';
import type { Circuit } from '../core/ir';

const TARGETS: Target[] = ['qasm', 'qiskit', 'cirq', 'pennylane'];

export function CodePanel({ circuit, onChange }: { circuit: Circuit; onChange: (c: Circuit) => void }) {
  const [target, setTarget] = useState<Target>('qasm');
  const [dirty, setDirty] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  const generated = useMemo(() => transpile(circuit, target), [circuit, target]);
  // Both OpenQASM and Qiskit Python round-trip, so a learner can write either and
  // watch the canvas rebuild from their code.
  const editable = target === 'qasm' || target === 'qiskit';

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: generated,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        python(),
        oneDark,
        EditorView.lineWrapping,
        EditorState.readOnly.of(!editable),
        EditorView.editable.of(editable),
        EditorView.theme({
          '&': { background: 'transparent', fontSize: '12.5px' },
          '.cm-gutters': { background: 'transparent', border: 'none', color: 'var(--ink-4)' },
          '.cm-activeLine': { background: 'rgba(255,255,255,.035)' },
          '.cm-content': { fontFamily: 'var(--mono)', padding: '10px 0' },
          '.cm-scroller': { fontFamily: 'var(--mono)' },
        }),
        EditorView.updateListener.of(u => {
          if (u.docChanged && editable) setDirty(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
  }, [editable]);

  // Push generated code into the editor when the circuit changes elsewhere.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (dirty !== null) return; // learner is mid-edit; do not yank the text away
    if (v.state.doc.toString() === generated) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: generated } });
  }, [generated, dirty]);

  const applyEdit = () => {
    if (dirty === null) return;
    try {
      if (target === 'qiskit') {
        const { circuit: parsed, ignored } = fromQiskit(dirty);
        if (!parsed.ops.length) throw new Error('No Qiskit gate calls were recognised. Lines look like qc.h(0) or qc.cx(0, 1).');
        onChange({ ...parsed, name: circuit.name });
        setDirty(null);
        setError(ignored.length ? `Applied, but ${ignored.length} line(s) were skipped — ${ignored[0]}` : null);
        return;
      }
      const parsed = fromQasm(dirty);
      if (!parsed.ops.length && dirty.trim().length > 40) throw new Error('No gates were recognised in that QASM.');
      onChange({ ...parsed, name: circuit.name });
      setDirty(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const discard = () => {
    setDirty(null); setError(null);
    const v = view.current;
    if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: generated } });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked; the text is selectable anyway */ }
  };

  return (
    <div className="code-panel">
      <div className="panel-head">
        <h3 className="panel-title">Code</h3>
        <div className="panel-tools">
          <div className="seg">
            {TARGETS.map(t => (
              <button key={t} aria-pressed={target === t} onClick={() => { setTarget(t); setDirty(null); setError(null); }}>
                {TARGET_LABEL[t]}
              </button>
            ))}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      <div ref={host} className="code-host scroll" />

      {editable ? (
        dirty !== null ? (
          <div className="code-actions rise">
            <span className="tiny dim">Edited — apply it to rebuild the circuit.</span>
            <button className="btn btn-sm btn-ghost" onClick={discard}>Discard</button>
            <button className="btn btn-sm btn-primary" onClick={applyEdit}>Apply to canvas</button>
          </div>
        ) : (
          <p className="tiny dim code-hint">
            Editable. Write {target === 'qiskit' ? 'Qiskit Python — qc.h(0), qc.cx(0, 1), qc.rx(pi/2, 0)' : 'OpenQASM'} and apply it; the canvas rebuilds from your code.
          </p>
        )
      ) : (
        <p className="tiny dim code-hint">Generated from the same circuit. Copy it and it runs in {TARGET_LABEL[target]} unchanged.</p>
      )}

      {error && <p className="tiny code-error">{error}</p>}
    </div>
  );
}
