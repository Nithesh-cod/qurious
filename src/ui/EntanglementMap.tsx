/**
 * Which qubits are entangled with which, and how strongly.
 *
 * The Bloch spheres already show *that* a qubit is entangled — the arrow shrinks to a dot
 * because an entangled qubit has no state of its own to draw. That is the right lesson
 * and the lessons teach it. What the spheres cannot show is *with whom*: in a three-qubit
 * state, three collapsed arrows look identical whether all three share one state or two
 * are paired and the third is entangled with something else entirely.
 *
 * So this draws the pairs. For every pair of qubits it measures how far the pair is from
 * being separable and draws a link whose weight is that number. Separable pairs get no
 * link at all, which is the point — you can see the structure, not just the symptom.
 *
 * The measure is the length of each qubit's Bloch vector. For a pure overall state a
 * qubit's vector is full length exactly when it is unentangled with everything else, and
 * shrinks as it becomes more entangled. Taking the pair's shared shortfall gives a number
 * that is 0 for a product state and 1 for a maximally entangled pair, which is what a
 * learner needs to see. It is a visual aid, deliberately not a formal entanglement
 * monotone, and the caption says so rather than implying more rigour than it has.
 */

import type { Statevector } from '../core/simulator';

export interface Link { a: number; b: number; strength: number }

/** Pairwise link strengths, 0 (separable) to 1 (maximally entangled). */
export function entanglementLinks(state: Statevector): Link[] {
  const n = Math.round(Math.log2(state.size));
  const purity = Array.from({ length: n }, (_, q) => state.bloch(q).purity);
  const links: Link[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      // Both qubits must have lost length for the pair to be linked; a qubit that is
      // still full length is entangled with nobody.
      const strength = Math.max(0, Math.min(1, (1 - purity[a]) * (1 - purity[b])));
      if (strength > 0.02) links.push({ a, b, strength });
    }
  }
  return links;
}

export function EntanglementMap({ state, size = 200 }: { state: Statevector; size?: number }) {
  const n = Math.round(Math.log2(state.size));
  if (n < 2) return null;

  const links = entanglementLinks(state);
  const r = size / 2 - 26;
  const cx = size / 2;
  const cy = size / 2;
  const nodes = Array.from({ length: n }, (_, q) => {
    // Start at the top and go clockwise, so q0 is where a reader looks first.
    const angle = -Math.PI / 2 + (q / n) * Math.PI * 2;
    return { q, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  return (
    <figure className="entangle-map">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
           aria-label={links.length
             ? `Entanglement between ${links.length} qubit ${links.length === 1 ? 'pair' : 'pairs'}`
             : 'No entanglement — every qubit has a state of its own'}>
        {links.map(l => {
          const A = nodes[l.a];
          const B = nodes[l.b];
          return (
            <line
              key={`${l.a}-${l.b}`}
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke="var(--accent-2)"
              strokeWidth={1 + l.strength * 5}
              strokeOpacity={0.25 + l.strength * 0.6}
              strokeLinecap="round"
            />
          );
        })}
        {nodes.map(node => {
          const purity = state.bloch(node.q).purity;
          return (
            <g key={node.q}>
              <circle
                cx={node.x} cy={node.y} r={14}
                fill="var(--glass-bg-strong)"
                stroke={purity > 0.98 ? 'var(--mint)' : 'var(--accent-2)'}
                strokeWidth={2}
              />
              <text
                x={node.x} y={node.y + 4} textAnchor="middle"
                fontSize={12} fill="var(--ink)" fontFamily="ui-monospace, monospace"
              >
                {node.q}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="tiny dim">
        {links.length === 0
          ? 'No links: every qubit has a state of its own, so this is a product state.'
          : `${links.length} entangled ${links.length === 1 ? 'pair' : 'pairs'}. A thicker line means the two share more. A green ring means that qubit is unentangled.`}
      </figcaption>
    </figure>
  );
}
