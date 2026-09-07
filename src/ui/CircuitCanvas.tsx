/**
 * The circuit canvas — drag gates onto wires and watch the state respond.
 *
 * Rendered as SVG so it scales cleanly from a desktop monitor to a phone, and so
 * touch targets stay large enough to hit with a thumb. Pointer events (not HTML5
 * drag-and-drop) because HTML5 drag does not work on touch devices, and the phone
 * is the whole accessibility argument.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ARITY, GATE_BLURB, GATE_LABEL, PARAMETRIC, controlsOf, targetsOf, toMoments,
  newId, type Circuit, type GateName, type GateOp,
} from '../core/ir';

const CELL = 60;
const ROW = 62;
const PAD_L = 66;
const PAD_T = 26;

export const PALETTE: { group: string; gates: GateName[] }[] = [
  { group: 'Single qubit', gates: ['h', 'x', 'y', 'z'] },
  { group: 'Phase', gates: ['s', 'sdg', 't', 'tdg'] },
  { group: 'Rotations', gates: ['rx', 'ry', 'rz', 'p'] },
  { group: 'Two qubit', gates: ['cx', 'cz', 'cp', 'cy', 'swap'] },
  { group: 'Three qubit', gates: ['ccx', 'cswap'] },
  { group: 'Other', gates: ['measure', 'barrier'] },
];

const GATE_TINT: Partial<Record<GateName, string>> = {
  h: 'var(--cyan)', x: 'var(--rose)', y: 'var(--rose)', z: 'var(--violet)',
  s: 'var(--violet)', sdg: 'var(--violet)', t: 'var(--violet)', tdg: 'var(--violet)',
  rx: 'var(--amber)', ry: 'var(--amber)', rz: 'var(--amber)', p: 'var(--amber)',
  cx: 'var(--mint)', cy: 'var(--mint)', cz: 'var(--mint)', swap: 'var(--mint)',
  ccx: 'var(--mint)', cswap: 'var(--mint)',
  measure: 'var(--ink-3)', barrier: 'var(--ink-4)',
};

export interface CanvasProps {
  circuit: Circuit;
  onChange: (c: Circuit) => void;
  /** Which step of the trace is showing, so the canvas can mark it. */
  step?: number;
  onStep?: (n: number) => void;
  readOnly?: boolean;
}

interface DragState { gate: GateName; x: number; y: number }

export function CircuitCanvas({ circuit, onChange, step, onStep, readOnly }: CanvasProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<{ q: number; col: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const moments = useMemo(() => toMoments(circuit), [circuit]);
  const cols = Math.max(moments.length + 1, 7);
  const width = PAD_L + cols * CELL + 20;
  const height = PAD_T * 2 + circuit.qubits * ROW;

  /** Map a pointer position to a (qubit, column) cell. */
  const cellAt = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const sx = (clientX - r.left) * (width / r.width);
    const sy = (clientY - r.top) * (height / r.height);
    const q = Math.floor((sy - PAD_T) / ROW);
    const col = Math.floor((sx - PAD_L) / CELL);
    if (q < 0 || q >= circuit.qubits || col < 0) return null;
    return { q, col: Math.min(col, moments.length) };
  }, [width, height, circuit.qubits, moments.length]);

  const insertGate = useCallback((gate: GateName, q: number, col: number) => {
    const arity = ARITY[gate];
    const qubits: number[] = [q];
    if (arity >= 2) {
      for (let k = 1; k < arity; k++) qubits.push((q + k) % circuit.qubits);
      if (new Set(qubits).size !== arity) return; // not enough wires for this gate
    }
    const o: GateOp = {
      id: newId(), name: gate, qubits,
      ...(PARAMETRIC.includes(gate) ? { params: [Math.PI / 2] } : {}),
    };
    // Insert at the op index matching the drop column.
    const before = moments.slice(0, col).flat().length;
    const next = { ...circuit, ops: [...circuit.ops] };
    next.ops.splice(Math.min(before, next.ops.length), 0, o);
    onChange(next);
    setSelected(o.id);
  }, [circuit, moments, onChange]);

  const remove = (id: string) => {
    onChange({ ...circuit, ops: circuit.ops.filter(o => o.id !== id) });
    setSelected(null);
  };

  const flip = (id: string) => {
    onChange({
      ...circuit,
      ops: circuit.ops.map(o => (o.id === id && o.qubits.length === 2 ? { ...o, qubits: [o.qubits[1], o.qubits[0]] } : o)),
    });
  };

  const setAngle = (id: string, theta: number) => {
    onChange({ ...circuit, ops: circuit.ops.map(o => (o.id === id ? { ...o, params: [theta] } : o)) });
  };

  // ---- palette drag (pointer based, works with touch)
  const startDrag = (gate: GateName) => (e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ gate, x: e.clientX, y: e.clientY });

    const move = (ev: PointerEvent) => {
      setDrag(d => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
      setHover(cellAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      const cell = cellAt(ev.clientX, ev.clientY);
      if (cell) insertGate(gate, cell.q, cell.col);
      setDrag(null); setHover(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const sel = circuit.ops.find(o => o.id === selected) ?? null;

  return (
    <div className="canvas-wrap">
      {!readOnly && (
        <div className="palette scroll">
          {PALETTE.map(g => (
            <div className="palette-group" key={g.group}>
              <div className="palette-label">{g.group}</div>
              <div className="palette-row">
                {g.gates.map(gate => (
                  <button
                    key={gate}
                    className="gate-chip"
                    style={{ '--tint': GATE_TINT[gate] } as React.CSSProperties}
                    onPointerDown={startDrag(gate)}
                    onClick={() => insertGate(gate, 0, moments.length)}
                    title={`${GATE_LABEL[gate]} — ${GATE_BLURB[gate]}`}
                  >
                    {GATE_LABEL[gate]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="tiny dim palette-hint">Drag onto a wire, or tap to append. Two-qubit gates take the wire below as their target — select one to flip it.</p>
        </div>
      )}

      <div className="canvas-scroll scroll">
        <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="circuit-svg">
          <defs>
            <linearGradient id="wireGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--ink-4)" stopOpacity=".25" />
              <stop offset="12%" stopColor="var(--ink-3)" stopOpacity=".55" />
              <stop offset="100%" stopColor="var(--ink-4)" stopOpacity=".3" />
            </linearGradient>
            <filter id="gateShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity=".38" />
            </filter>
          </defs>

          {/* wires */}
          {Array.from({ length: circuit.qubits }, (_, q) => {
            const y = PAD_T + q * ROW + ROW / 2;
            return (
              <g key={q}>
                <text x={16} y={y + 5} className="wire-label">q{q}</text>
                <text x={40} y={y + 5} className="wire-ket">|0⟩</text>
                <line x1={PAD_L - 6} y1={y} x2={width - 14} y2={y} stroke="url(#wireGrad)" strokeWidth="2" />
              </g>
            );
          })}

          {/* drop preview */}
          {hover && drag && (
            <rect
              x={PAD_L + hover.col * CELL + 6} y={PAD_T + hover.q * ROW + 8}
              width={CELL - 12} height={ROW - 16} rx="12"
              className="drop-ghost"
            />
          )}

          {/* step marker */}
          {step !== undefined && step > 0 && (() => {
            const flat = moments.flat();
            const opIdx = Math.min(step, flat.length) - 1;
            const target = flat[opIdx];
            if (!target) return null;
            let col = 0, seen = 0;
            for (let m = 0; m < moments.length; m++) {
              if (seen + moments[m].length > opIdx) { col = m; break; }
              seen += moments[m].length;
            }
            return (
              <rect x={PAD_L + col * CELL} y={4} width={CELL} height={height - 8} rx="14" className="step-marker" />
            );
          })()}

          {/* gates */}
          {moments.map((mom, col) =>
            mom.map(o => (
              <GateGlyph
                key={o.id} op={o} col={col}
                selected={o.id === selected}
                onSelect={() => setSelected(s => (s === o.id ? null : o.id))}
                readOnly={readOnly}
              />
            ))
          )}
        </svg>
      </div>

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y, '--tint': GATE_TINT[drag.gate] } as React.CSSProperties}>
          {GATE_LABEL[drag.gate]}
        </div>
      )}

      {sel && !readOnly && (
        <div className="glass glass-strong gate-inspector rise">
          <div className="gate-inspector-head">
            <span className="chip chip-accent">{GATE_LABEL[sel.name]}</span>
            <span className="tiny dim">qubit{sel.qubits.length > 1 ? 's' : ''} {sel.qubits.join(', ')}</span>
            <div className="panel-tools">
              {sel.qubits.length === 2 && <button className="btn btn-sm btn-ghost" onClick={() => flip(sel.id)}>Flip control ⇄ target</button>}
              <button className="btn btn-sm" onClick={() => remove(sel.id)}>Remove</button>
            </div>
          </div>
          <p className="tiny dim">{GATE_BLURB[sel.name]}</p>
          {PARAMETRIC.includes(sel.name) && (
            <div className="angle-row">
              <span className="tiny dim">angle</span>
              <input
                type="range" min={0} max={Math.PI * 2} step={Math.PI / 24}
                value={sel.params?.[0] ?? 0}
                onChange={e => setAngle(sel.id, parseFloat(e.target.value))}
              />
              <span className="num tiny">{fmtAngle(sel.params?.[0] ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      {onStep && (
        <div className="step-bar">
          <button className="btn btn-sm btn-icon" onClick={() => onStep(Math.max(0, (step ?? 0) - 1))} aria-label="Previous step">‹</button>
          <input
            type="range" min={0} max={circuit.ops.length} value={step ?? circuit.ops.length}
            onChange={e => onStep(parseInt(e.target.value, 10))}
            aria-label="Step through the circuit"
          />
          <button className="btn btn-sm btn-icon" onClick={() => onStep(Math.min(circuit.ops.length, (step ?? 0) + 1))} aria-label="Next step">›</button>
          <span className="tiny dim num">step {step ?? circuit.ops.length}/{circuit.ops.length}</span>
        </div>
      )}
    </div>
  );
}

function GateGlyph({ op, col, selected, onSelect, readOnly }: {
  op: GateOp; col: number; selected: boolean; onSelect: () => void; readOnly?: boolean;
}) {
  const cx = PAD_L + col * CELL + CELL / 2;
  const yOf = (q: number) => PAD_T + q * ROW + ROW / 2;
  const ctrls = controlsOf(op);
  const tgts = targetsOf(op);
  const tint = GATE_TINT[op.name] ?? 'var(--accent)';
  const all = op.qubits.map(yOf);
  const top = Math.min(...all), bot = Math.max(...all);

  if (op.name === 'barrier') {
    return (
      <line x1={cx} y1={8} x2={cx} y2={PAD_T * 2 + 400} stroke="var(--ink-4)" strokeWidth="2" strokeDasharray="4 5" opacity=".5" />
    );
  }

  return (
    <g className={`gate ${selected ? 'gate-selected' : ''}`} onClick={readOnly ? undefined : onSelect} style={{ '--tint': tint } as React.CSSProperties}>
      {op.qubits.length > 1 && <line x1={cx} y1={top} x2={cx} y2={bot} stroke={tint} strokeWidth="2.5" opacity=".8" />}

      {ctrls.map(q => <circle key={`c${q}`} cx={cx} cy={yOf(q)} r="6.5" fill={tint} />)}

      {op.name === 'swap' || op.name === 'cswap'
        ? tgts.map(q => (
            <g key={`s${q}`} stroke={tint} strokeWidth="3" strokeLinecap="round">
              <line x1={cx - 8} y1={yOf(q) - 8} x2={cx + 8} y2={yOf(q) + 8} />
              <line x1={cx - 8} y1={yOf(q) + 8} x2={cx + 8} y2={yOf(q) - 8} />
            </g>
          ))
        : tgts.map(q => {
            const y = yOf(q);
            if (op.name === 'cx' || op.name === 'ccx') {
              return (
                <g key={`t${q}`}>
                  <circle cx={cx} cy={y} r="13" fill="none" stroke={tint} strokeWidth="2.5" />
                  <line x1={cx - 13} y1={y} x2={cx + 13} y2={y} stroke={tint} strokeWidth="2.5" />
                  <line x1={cx} y1={y - 13} x2={cx} y2={y + 13} stroke={tint} strokeWidth="2.5" />
                </g>
              );
            }
            if (op.name === 'cz') return <circle key={`t${q}`} cx={cx} cy={y} r="6.5" fill={tint} />;
            if (op.name === 'cp') return <circle key={`t${q}`} cx={cx} cy={y} r="6.5" fill={tint} />;
            if (op.name === 'measure') {
              return (
                <g key={`t${q}`}>
                  <rect x={cx - 17} y={y - 15} width="34" height="30" rx="9" fill="var(--glass-bg-strong)" stroke={tint} strokeWidth="1.5" filter="url(#gateShadow)" />
                  <path d={`M ${cx - 8} ${y + 6} A 8 8 0 0 1 ${cx + 8} ${y + 6}`} fill="none" stroke={tint} strokeWidth="1.8" />
                  <line x1={cx} y1={y + 6} x2={cx + 6} y2={y - 4} stroke={tint} strokeWidth="1.8" strokeLinecap="round" />
                </g>
              );
            }
            const label = GATE_LABEL[op.name];
            const w = label.length > 2 ? 40 : 34;
            return (
              <g key={`t${q}`}>
                <rect x={cx - w / 2} y={y - 15} width={w} height="30" rx="10"
                      fill="var(--glass-bg-strong)" stroke={tint} strokeWidth="1.5" filter="url(#gateShadow)" />
                <text x={cx} y={y + 5} className="gate-text" fill={tint}>{label}</text>
                {op.params?.length ? (
                  <text x={cx} y={y + 24} className="gate-param">{fmtAngle(op.params[0])}</text>
                ) : null}
              </g>
            );
          })}
    </g>
  );
}

export function fmtAngle(theta: number): string {
  const over = theta / Math.PI;
  const r = Math.round(over * 12) / 12;
  if (Math.abs(over - r) < 1e-6) {
    if (r === 0) return '0';
    if (r === 1) return 'π';
    if (r === -1) return '−π';
    if (r === 0.5) return 'π/2';
    if (r === 0.25) return 'π/4';
    if (Math.abs(r - 1 / 3) < 1e-9) return 'π/3';
    if (Math.abs(r - 2 / 3) < 1e-9) return '2π/3';
    if (r === 0.75) return '3π/4';
    if (r === 1.5) return '3π/2';
    if (Math.abs(r - 1 / 6) < 1e-9) return 'π/6';
  }
  return `${theta.toFixed(2)}`;
}
