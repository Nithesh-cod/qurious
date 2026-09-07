/**
 * The Bloch sphere.
 *
 * A single qubit's state as a point on a sphere. Three things make it teach rather than
 * decorate:
 *
 *   1. The arrow *travels* to each new state instead of snapping, so a gate reads as
 *      the rotation it actually is. A learner who watches an X gate swing the arrow
 *      from pole to pole has understood something a matrix will not tell them.
 *   2. It leaves a fading trail behind it, so the path is visible after the motion
 *      has finished — the difference between an X and a Y is the route, not the
 *      destination.
 *   3. You can drag it. A sphere you cannot turn is a picture of a sphere, and the
 *      whole point of the third dimension is being able to look round the back.
 *
 * When a qubit becomes entangled its vector shrinks toward the centre. That is drawn
 * honestly — a shrinking arrow and a growing haze — which makes entanglement something
 * you see rather than something you are told.
 *
 * Every sphere on the page shares one WebGL context. See gl/SharedRenderer.ts.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { addView, applyOrbit, attachOrbit, glUnavailable, type Orbit } from './gl/SharedRenderer';

export interface BlochProps {
  x: number; y: number; z: number;
  purity: number;
  label?: string;
  size?: number;
  accent?: string;
  /** Turn the trail off where it would be noise, such as tiny preview spheres. */
  trail?: boolean;
}

const TRAIL_POINTS = 48;

export function BlochSphere(props: BlochProps) {
  const { x, y, z, purity, label, size = 190, accent = '#6ee7ff', trail = true } = props;
  const mount = useRef<HTMLCanvasElement>(null);
  // three.js has Y up; the quantum z axis is the one that should point up on screen.
  const target = useRef(new THREE.Vector3(x, z, -y));

  useEffect(() => { target.current.set(x, z, -y); }, [x, y, z]);

  useEffect(() => {
    const el = mount.current;
    if (!el || glUnavailable()) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const orbit: Orbit = { theta: 0.72, phi: 1.12, radius: 4.1, auto: true };
    applyOrbit(camera, orbit);

    const accentColor = new THREE.Color(accent);

    // ---------------------------------------------------------------- the ball
    // A dense wireframe read as a grey mesh ball — heavy, and it fought the arrow for
    // attention. What makes a sphere look like glass is the edge, not the surface: a
    // fresnel rim brightens where the surface turns away from the camera, which is the
    // cue the eye actually uses to read curvature.
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.985, 48, 36),
      new THREE.MeshBasicMaterial({
        color: 0x0c1a33, transparent: true, opacity: 0.42, depthWrite: false,
      })
    ));

    const rimMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(accent) },
        uPower: { value: 2.6 },
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uPower;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          // Bright at grazing angles, invisible face-on: the glass edge.
          float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), uPower);
          gl_FragColor = vec4(uColor, f * 0.85);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 48), rimMat));

    // Sparse latitude and longitude lines. Six and four, not a mesh — enough to read
    // rotation, few enough to stay out of the way.
    const gridMat = new THREE.LineBasicMaterial({ color: 0x7fa8e0, transparent: true, opacity: 0.16 });
    for (let i = 0; i < 6; i++) {
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0));
      }
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), gridMat);
      line.rotation.y = (i / 6) * Math.PI;
      line.rotation.x = Math.PI / 2;
      scene.add(line);
    }
    for (let i = 1; i <= 3; i++) {
      const y = Math.cos((i / 4) * Math.PI);
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r));
      }
      scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // ---------------------------------------------------------------- guides
    const ring = (rot: [number, number, number], op: number, col: THREE.ColorRepresentation) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.0042, 8, 160),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })
      );
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      scene.add(mesh);
    };
    ring([Math.PI / 2, 0, 0], 0.42, accentColor);  // equator
    ring([0, 0, 0], 0.14, 0x8fb4e8);
    ring([0, Math.PI / 2, 0], 0.14, 0x8fb4e8);

    const axis = (dir: THREE.Vector3, color: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        dir.clone().multiplyScalar(-1.22), dir.clone().multiplyScalar(1.22),
      ]);
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.26 })));
    };
    axis(new THREE.Vector3(1, 0, 0), 0xff8fa8);
    axis(new THREE.Vector3(0, 1, 0), 0x6ef0c8);
    axis(new THREE.Vector3(0, 0, 1), 0xb388ff);

    // ---------------------------------------------------------------- labels
    // Sprites rather than DOM: they stay glued to the axis as the sphere turns.
    const label3d = (text: string, pos: THREE.Vector3, colour: string) => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const g = c.getContext('2d')!;
      g.font = '600 40px ui-sans-serif, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = colour;
      g.fillText(text, 64, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.92, depthTest: false,
      }));
      sprite.position.copy(pos);
      sprite.scale.set(0.42, 0.21, 1);
      scene.add(sprite);
    };
    label3d('|0⟩', new THREE.Vector3(0, 1.34, 0), '#eaf4ff');
    label3d('|1⟩', new THREE.Vector3(0, -1.34, 0), '#9fb4d8');
    label3d('|+⟩', new THREE.Vector3(1.34, 0, 0), '#ffb4c4');
    label3d('|i⟩', new THREE.Vector3(0, 0, -1.34), '#c9a8ff');

    // ---------------------------------------------------------------- the arrow
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.022, 1, 14),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    shaft.position.y = 0.5;
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.066, 0.17, 20),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    head.position.y = 1;
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 20, 16),
      new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.2, depthWrite: false })
    );
    halo.position.y = 1;
    arrow.add(shaft, head, halo);
    scene.add(arrow);

    // ---------------------------------------------------------------- the trail
    let trailLine: THREE.Line | null = null;
    const history: THREE.Vector3[] = [];
    if (trail) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
      trailLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: accentColor, transparent: true, opacity: 0.5,
      }));
      trailLine.frustumCulled = false;
      scene.add(trailLine);
    }

    // Grows as the qubit loses a state of its own — the picture of entanglement.
    const haze = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false })
    );
    scene.add(haze);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 })
    );
    scene.add(core);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(accentColor, 0.5);
    rim.position.set(-4, -1, -3);
    scene.add(rim);

    // ---------------------------------------------------------------- motion
    const current = target.current.clone();
    const up = new THREE.Vector3(0, 1, 0);
    let t = 0;

    const detachOrbit = attachOrbit(el, orbit, () => applyOrbit(camera, orbit));

    const remove = addView({
      canvas: el, scene, camera,
      update: dt => {
        t += dt;

        // Ease toward the new state. Frame-rate independent, so a 60Hz and a 120Hz
        // phone show the same motion.
        const k = 1 - Math.pow(0.0025, dt);
        current.lerp(target.current, k);

        const len = current.length();
        if (len > 1e-4) {
          arrow.visible = true;
          arrow.scale.set(1, Math.max(len, 0.001), 1);
          arrow.quaternion.setFromUnitVectors(up, current.clone().normalize());
        } else {
          arrow.visible = false;
        }
        halo.scale.setScalar(1 + Math.sin(t * 2.6) * 0.12);

        if (trailLine) {
          const tip = current.clone();
          const last = history[history.length - 1];
          if (!last || last.distanceToSquared(tip) > 2e-5) history.push(tip);
          while (history.length > TRAIL_POINTS) history.shift();
          const pos = trailLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < TRAIL_POINTS; i++) {
            const p = history[Math.max(0, history.length - TRAIL_POINTS + i)] ?? tip;
            pos.setXYZ(i, p.x, p.y, p.z);
          }
          pos.needsUpdate = true;
          (trailLine.material as THREE.LineBasicMaterial).opacity =
            history.length > 3 ? 0.5 : 0;
        }

        const mixed = Math.max(0, 1 - len);
        (core.material as THREE.MeshBasicMaterial).opacity = mixed * 0.9;
        core.scale.setScalar(1 + mixed * 0.7);
        (haze.material as THREE.MeshBasicMaterial).opacity = mixed * 0.16;
        haze.scale.setScalar(0.6 + mixed * 1.5);

        if (orbit.auto) {
          orbit.theta += dt * 0.12;
          applyOrbit(camera, orbit);
        }
      },
    });

    return () => { detachOrbit(); remove(); };
    // The scene is built once; live values arrive through the target ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent, trail]);

  if (glUnavailable()) return <BlochFlat {...props} />;

  return (
    <div className="bloch" style={{ width: size, height: size + (label ? 22 : 0) }}>
      <canvas ref={mount} className="bloch-gl" style={{ width: size, height: size }} />
      {label && (
        <span className="bloch-label tiny">
          {label}
          <span className="dim"> · {purity < 0.02 ? 'entangled' : `|r| = ${purity.toFixed(2)}`}</span>
        </span>
      )}
    </div>
  );
}

/**
 * The no-WebGL fallback: an honest flat projection rather than a blank box.
 * Kept because a device without WebGL should still be able to read the state.
 */
export function BlochFlat({ x, y, z, purity, label, size = 120, accent = '#6ee7ff' }: BlochProps) {
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  const px = cx + x * r * 0.92;
  const py = cy - z * r * 0.92;
  const faded = Math.max(0.12, purity);

  return (
    <div className="bloch" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Bloch vector for ${label ?? 'qubit'}`}>
        <defs>
          <radialGradient id={`bg-${label ?? 'q'}`} cx="38%" cy="32%">
            <stop offset="0%" stopColor="#1a2b4d" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0a1220" stopOpacity="0.35" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#bg-${label ?? 'q'})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#7fa8e0" strokeOpacity="0.32" />
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.3} fill="none" stroke={accent} strokeOpacity="0.3" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#6ef0c8" strokeOpacity="0.2" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#ff8fa8" strokeOpacity="0.2" />
        <text x={cx} y={cy - r - 1} fontSize="9" fill="#eaf4ff" opacity="0.75" textAnchor="middle">|0⟩</text>
        <text x={cx} y={cy + r + 8} fontSize="9" fill="#9fb4d8" opacity="0.7" textAnchor="middle">|1⟩</text>
        {purity > 0.02 ? (
          <>
            <line x1={cx} y1={cy} x2={px} y2={py} stroke={accent} strokeWidth="2.2" strokeOpacity={faded} strokeLinecap="round" />
            <circle cx={px} cy={py} r="4.4" fill={accent} fillOpacity={faded} />
          </>
        ) : (
          <circle cx={cx} cy={cy} r="6" fill="#ffc46b" fillOpacity="0.85" />
        )}
      </svg>
      {label && (
        <span className="bloch-label tiny">
          {label}
          <span className="dim"> · {purity < 0.02 ? 'entangled' : `|r| = ${purity.toFixed(2)}`}</span>
        </span>
      )}
    </div>
  );
}
