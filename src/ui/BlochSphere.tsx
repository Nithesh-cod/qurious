/**
 * 3D Bloch sphere.
 *
 * A single qubit's state as a point on a sphere, rendered with Three.js. The arrow
 * animates to each new state rather than snapping, so a learner sees the *rotation*
 * a gate performs, which is the whole intuition the gate names are trying to convey.
 *
 * When a qubit becomes entangled its Bloch vector shrinks toward the centre — the
 * sphere renders that honestly, which makes entanglement visible rather than asserted.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Browsers cap how many live WebGL contexts a page may hold — around sixteen, and
 * exceeding it silently kills the oldest, which is how the tutor avatar ended up as a
 * blank white square on a lesson page full of spheres.
 *
 * So spheres take a slot from a shared budget, and any that cannot get one render the
 * 2D fallback instead. The budget deliberately leaves headroom for the avatar, which
 * is created once and must never be the one that gets dropped.
 */
const WEBGL_BUDGET = 4;
let liveContexts = 0;

export interface BlochProps {
  x: number; y: number; z: number;
  purity: number;
  label?: string;
  size?: number;
  accent?: string;
}

export function BlochSphere(props: BlochProps) {
  const { x, y, z, purity, label, size = 190, accent = '#6ee7ff' } = props;
  const mount = useRef<HTMLDivElement>(null);
  const target = useRef(new THREE.Vector3(x, z, -y)); // three.js Y is up; map quantum z -> screen up
  const api = useRef<{ dispose: () => void; setAccent: (c: string) => void } | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;

    if (liveContexts >= WEBGL_BUDGET) { setFallback(true); return; }
    liveContexts++;
    let released = false;
    const release = () => { if (!released) { released = true; liveContexts--; } };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(2.5, 1.75, 2.9);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      release();
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // updateStyle must stay on: with it off the canvas keeps no CSS size and is
    // displayed at devicePixelRatio times `size`, which overflows its container.
    renderer.setSize(size, size);
    el.appendChild(renderer.domElement);

    const accentColor = new THREE.Color(accent);

    // --- the glass sphere itself
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 36),
      new THREE.MeshPhongMaterial({
        color: 0x9fc8ff, transparent: true, opacity: 0.085,
        shininess: 70, specular: 0x88bbff, depthWrite: false,
      })
    );
    scene.add(shell);

    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(1.001, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x7fa8e0, wireframe: true, transparent: true, opacity: 0.11 })
    );
    scene.add(wire);

    // --- equator and meridians, so rotation is readable
    const ring = (rot: [number, number, number], op: number) => {
      const g = new THREE.RingGeometry(0.998, 1.004, 96);
      const m = new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: op, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      scene.add(mesh);
      return mesh;
    };
    ring([Math.PI / 2, 0, 0], 0.26);   // equator (x-y plane)
    ring([0, 0, 0], 0.1);              // x-z plane
    ring([0, Math.PI / 2, 0], 0.1);    // y-z plane

    // --- axes
    const axis = (dir: THREE.Vector3, color: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        dir.clone().multiplyScalar(-1.28), dir.clone().multiplyScalar(1.28),
      ]);
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 })));
    };
    axis(new THREE.Vector3(1, 0, 0), 0xff8fa8);
    axis(new THREE.Vector3(0, 1, 0), 0x6ef0c8);
    axis(new THREE.Vector3(0, 0, 1), 0xb388ff);

    // --- poles
    const pole = (yPos: number, color: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 16, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
      );
      m.position.set(0, yPos, 0);
      scene.add(m);
    };
    pole(1, 0xffffff);
    pole(-1, 0x8fa2c8);

    // --- the state vector
    const vectorGroup = new THREE.Group();
    scene.add(vectorGroup);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 1, 12),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    shaft.position.y = 0.5;
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.062, 0.16, 16),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    head.position.y = 1;
    const glowBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 20, 16),
      new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.22 })
    );
    glowBall.position.y = 1;
    const arrow = new THREE.Group();
    arrow.add(shaft, head, glowBall);
    vectorGroup.add(arrow);

    // centre dot — grows as the qubit becomes entangled and the vector shrinks
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 })
    );
    scene.add(core);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(3, 4, 5);
    scene.add(key);

    // --- animate toward the target direction
    const current = target.current.clone();
    let raf = 0;
    let spin = 0;
    const up = new THREE.Vector3(0, 1, 0);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      current.lerp(target.current, 0.12);

      const len = current.length();
      if (len > 1e-4) {
        arrow.visible = true;
        arrow.scale.set(1, Math.max(len, 0.001), 1);
        head.position.y = 1;
        glowBall.position.y = 1;
        arrow.quaternion.setFromUnitVectors(up, current.clone().normalize());
      } else {
        arrow.visible = false;
      }
      (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - len) * 0.9;
      core.scale.setScalar(1 + (1 - Math.min(len, 1)) * 0.7);

      spin += 0.0022;
      scene.rotation.y = Math.sin(spin) * 0.32;
      renderer.render(scene, camera);
    };
    tick();

    api.current = {
      dispose: () => {
        release();
        cancelAnimationFrame(raf);
        renderer.dispose();
        scene.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
        });
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      },
      setAccent: (c: string) => {
        const col = new THREE.Color(c);
        [shaft, head, glowBall].forEach(m => (m.material as THREE.MeshBasicMaterial).color = col);
      },
    };

    return () => api.current?.dispose();
    // Rebuilt only on size change; state updates flow through the ref below.
  }, [size]);

  useEffect(() => { target.current.set(x, z, -y); }, [x, y, z]);
  useEffect(() => { api.current?.setAccent(accent); }, [accent]);

  // No context available — the flat version carries the same information.
  if (fallback) return <BlochFlat {...props} size={Math.round(size * 0.86)} />;

  const entangled = purity < 0.999;

  return (
    <div className="bloch">
      <div ref={mount} className="bloch-canvas" style={{ width: size, height: size }} />
      <div className="bloch-meta">
        {label && <span className="bloch-label">{label}</span>}
        <span className={`chip ${entangled ? 'chip-amber' : 'chip-accent'} tiny`}>
          {entangled ? `entangled · |r| = ${purity.toFixed(2)}` : 'pure state'}
        </span>
      </div>
      <div className="bloch-coords num tiny dim">
        x {fmt(x)} &nbsp; y {fmt(y)} &nbsp; z {fmt(z)}
      </div>
    </div>
  );
}

const fmt = (v: number) => (Math.abs(v) < 5e-4 ? '0.00' : v.toFixed(2));

/** 2D fallback used when WebGL is unavailable or the device is very weak. */
export function BlochFlat({ x, y, z, purity, label, size = 150 }: BlochProps) {
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;
  const px = cx + x * r * 0.86 + y * r * 0.34;
  const py = cy - z * r * 0.86 + y * r * 0.2;
  return (
    <div className="bloch">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={label}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--glass-border)" strokeWidth="1" />
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.34} fill="none" stroke="var(--accent)" strokeWidth="1" opacity=".3" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="var(--glass-border)" strokeWidth="1" opacity=".5" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="var(--glass-border)" strokeWidth="1" opacity=".5" />
        {purity > 0.02 && (
          <>
            <line x1={cx} y1={cy} x2={px} y2={py} stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={px} cy={py} r="5.5" fill="var(--accent)" />
          </>
        )}
        <circle cx={cx} cy={cy} r={3 + (1 - purity) * 6} fill="var(--amber)" opacity={1 - purity} />
      </svg>
      <div className="bloch-meta">{label && <span className="bloch-label">{label}</span>}</div>
    </div>
  );
}
