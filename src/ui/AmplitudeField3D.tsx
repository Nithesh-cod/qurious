/**
 * Amplitudes as what they actually are: complex numbers.
 *
 * The flat view draws probability as a bar and reduces phase to a colour swatch. That
 * is enough to read a state, but it hides the one thing worth seeing — phase is a
 * *direction*, and interference is what happens when two directions line up or oppose.
 * A colour cannot show "these two are about to cancel"; an arrow can.
 *
 * So each basis state gets a phasor: an arrow in its own complex plane, length equal to
 * the magnitude of the amplitude and angle equal to its argument. Lay those along an
 * axis and the whole statevector is on screen at once, with the quantity that drives
 * every quantum algorithm shown geometrically rather than as a legend entry.
 *
 * What to look for, and the reason this earns its place:
 *
 *   - A Hadamard on |0⟩ makes two phasors of equal length, both pointing right.
 *   - Add a Z and one of them swings to point left. Nothing about the probabilities
 *     changed — the bars are identical — but the arrows are now opposed.
 *   - Apply the second Hadamard and the opposed pair cancels to nothing, while the
 *     aligned pair adds. That is interference, and here you can watch it coming.
 *
 * Shares the app's single WebGL context. See gl/SharedRenderer.ts.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Statevector } from '../core/simulator';
import { addView, applyOrbit, attachOrbit, glUnavailable, type Orbit } from './gl/SharedRenderer';

/**
 * Eight, not sixteen. Sixteen fitted on screen only by pushing the camera so far back
 * that the arrows became specks and the labels were unreadable — measured on a 384px
 * phone. Three qubits is the width at which every phasor still reads. The flat list
 * handles anything wider.
 */
export const MAX_STATES_3D = 8;

export interface AmplitudeFieldProps {
  state: Statevector;
  width?: number;
  height?: number;
  accent?: string;
}

interface Slot {
  group: THREE.Group;
  phasor: THREE.Group;
  shaft: THREE.Mesh;
  head: THREE.Mesh;
  bar: THREE.Mesh;
  tip: THREE.Mesh;
  /** Eased values, so a gate reads as motion rather than a jump. */
  mag: number;
  ang: number;
  prob: number;
}

/** Hue by phase, matching the flat view's convention so the two agree. */
function phaseHue(angle: number): THREE.Color {
  const t = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return new THREE.Color().setHSL(t / (Math.PI * 2), 0.72, 0.62);
}

export function AmplitudeField3D({
  state, width = 320, height = 220, accent = '#6ee7ff',
}: AmplitudeFieldProps) {
  const mount = useRef<HTMLCanvasElement>(null);
  /** Live amplitudes, read by the animation loop without rebuilding the scene. */
  const amps = useRef<{ re: number; im: number }[]>([]);
  const nRef = useRef(0);

  // Keep the ref in step with the state on every render.
  const n = Math.min(state.size, MAX_STATES_3D);
  amps.current = Array.from({ length: n }, (_, i) => ({ re: state.re[i], im: state.im[i] }));
  nRef.current = n;

  useEffect(() => {
    const el = mount.current;
    if (!el || glUnavailable()) return;

    const count = nRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1.5, 0.1, 200);
    const accentColor = new THREE.Color(accent);
    const spacing = 1.15;
    const originX = -((count - 1) * spacing) / 2;

    // Frame the row rather than guessing a distance: work out how far back the camera
    // has to be for the whole span to fit horizontally, and add a margin.
    const halfSpan = ((count - 1) * spacing) / 2 + 0.95;
    const vFov = (40 * Math.PI) / 180;
    // Deliberately pessimistic: the canvas is width-driven, so on a narrow phone the
    // real aspect is around 1.2. Seeding 1.5 assumed a wider field of view than exists
    // and pushed the last phasor off the right edge.
    const aspect = 1.05;
    const hHalf = Math.atan(Math.tan(vFov / 2) * aspect);
    const fit = halfSpan / Math.tan(hHalf);
    // Nearly front-on, so the row reads as a row and the arrows as arrows. Enough tilt
    // to show that each phasor lives in its own plane, not enough to make it a diagonal.
    const orbit: Orbit = { theta: 0.30, phi: 1.34, radius: Math.max(5.2, fit * 1.06), auto: true };
    applyOrbit(camera, orbit);

    // The axis the basis states are laid along.
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(originX - 0.8, 0, 0),
        new THREE.Vector3(originX + (count - 1) * spacing + 0.8, 0, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x7fa8e0, transparent: true, opacity: 0.3 })
    ));

    const label = (text: string, pos: THREE.Vector3, colour: string, scale = 0.5) => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const g = c.getContext('2d')!;
      g.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = colour;
      g.fillText(text, 128, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.9, depthTest: false,
      }));
      sprite.position.copy(pos);
      sprite.scale.set(scale * 2, scale * 0.5, 1);
      scene.add(sprite);
      return sprite;
    };

    const slots: Slot[] = [];
    const bits = Math.log2(state.size) | 0;

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      group.position.x = originX + i * spacing;
      scene.add(group);

      // The complex plane this amplitude lives in, drawn as a faint unit circle.
      const ringPts: THREE.Vector3[] = [];
      for (let a = 0; a <= 72; a++) {
        const t = (a / 72) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(0, Math.sin(t) * 0.52, Math.cos(t) * 0.52));
      }
      group.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({ color: 0x7fa8e0, transparent: true, opacity: 0.18 })
      ));

      // Probability as a translucent column — the quantity you can compare at a glance.
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1, 0.3),
        new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.16, depthWrite: false })
      );
      bar.position.y = 0.5;
      group.add(bar);

      // The phasor itself: rotates in the plane, length is the magnitude.
      const phasor = new THREE.Group();
      group.add(phasor);

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 1, 10),
        new THREE.MeshBasicMaterial({ color: accentColor })
      );
      shaft.position.y = 0.5;
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.062, 0.15, 14),
        new THREE.MeshBasicMaterial({ color: accentColor })
      );
      head.position.y = 1;
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 14, 10),
        new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.28, depthWrite: false })
      );
      tip.position.y = 1;
      phasor.add(shaft, head, tip);

      label(`|${i.toString(2).padStart(bits, '0')}⟩`,
        new THREE.Vector3(originX + i * spacing, -0.78, 0), '#9fb4d8', 0.42);

      slots.push({ group, phasor, shaft, head, bar, tip, mag: 0, ang: 0, prob: 0 });
    }

    let sway = 0;
    const detach = attachOrbit(el, orbit, () => applyOrbit(camera, orbit));

    const remove = addView({
      canvas: el, scene, camera,
      update: dt => {
        const k = 1 - Math.pow(0.004, dt);   // frame-rate independent easing
        const live = amps.current;

        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          const a = live[i] ?? { re: 0, im: 0 };
          const mag = Math.hypot(a.re, a.im);
          const prob = mag * mag;
          let ang = Math.atan2(a.im, a.re);

          // Take the short way round, so a phase crossing pi does not spin the arrow
          // the long way and read as a much bigger change than it is.
          let d = ang - s.ang;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          ang = s.ang + d;

          s.mag += (mag - s.mag) * k;
          s.ang += (ang - s.ang) * k;
          s.prob += (prob - s.prob) * k;

          const len = Math.max(s.mag, 1e-4);
          s.phasor.visible = s.mag > 0.004;
          // The phasor lies in the plane the ring drew: rotate about X so the arrow
          // sweeps through the Y-Z plane, which is this basis state's complex plane.
          s.phasor.rotation.x = -s.ang;
          s.phasor.scale.set(1, len, 1);
          s.head.position.y = 1;
          s.tip.position.y = 1;

          s.bar.scale.y = Math.max(s.prob * 2.2, 0.0012);
          s.bar.position.y = s.bar.scale.y / 2;
          (s.bar.material as THREE.MeshBasicMaterial).opacity = 0.1 + s.prob * 0.3;

          const col = phaseHue(s.ang);
          (s.shaft.material as THREE.MeshBasicMaterial).color.copy(col);
          (s.head.material as THREE.MeshBasicMaterial).color.copy(col);
          (s.tip.material as THREE.MeshBasicMaterial).color.copy(col);
        }

        if (orbit.auto) {
          // Rock, do not orbit. A full turn puts the row end-on, where it reads as a
          // single overlapping smear; a gentle sway keeps it legible and still shows
          // that the phasors have depth.
          sway += dt;
          orbit.theta = 0.30 + Math.sin(sway * 0.5) * 0.34;
          applyOrbit(camera, orbit);
        }
      },
    });

    return () => { detach(); remove(); };
    // Rebuilt only when the register width changes; amplitudes flow through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.size, accent]);

  if (glUnavailable()) return null;

  return (
    <div className="ampfield">
      <canvas
        ref={mount}
        className="ampfield-gl"
        style={{ width, height }}
        aria-label="Amplitudes as phasors. Drag to rotate."
      />
      <p className="tiny dim ampfield-legend">
        Each arrow is one amplitude: <strong>length</strong> is its size,{' '}
        <strong>direction</strong> is its phase. The pale column behind it is the
        probability. Arrows that oppose each other cancel — drag to look along the axis.
      </p>
    </div>
  );
}
