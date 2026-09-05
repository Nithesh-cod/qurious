/**
 * The floating 3D tutor.
 *
 * Renders on its own transparent canvas above the app, so the avatar can drift
 * anywhere across any screen with no environment of its own.
 *
 * The scene has two independent parts:
 *
 *   aura       — the orbiting quantum rings, their satellites, and the listening ring.
 *                Always present, whichever body is showing. This is the app's identity.
 *   character  — either the procedural orb (no assets needed) or your rigged GLB.
 *
 * Keeping those separate is what lets the rings orbit a human model rather than
 * disappearing along with the placeholder.
 *
 * Assets, if present, are picked up automatically:
 *   public/avatar/tutor.glb          rigged character, T-pose
 *   public/avatar/anim/<state>.json  animation clips (see scripts/convert-anims.mjs)
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AvatarState =
  | 'idle'        // resting, always moving a little
  | 'talk'        // speaking
  | 'think'       // working on an answer
  | 'celebrate'   // learner got something right
  | 'encourage'   // learner got something wrong
  | 'point'       // drawing attention to the UI
  | 'wave'        // greeting
  | 'walk'        // drifting to a new spot on screen
  | 'listen';     // microphone open

export interface Avatar3DProps {
  state: AvatarState;
  /** 0..1 mouth openness while speaking, driven by the speech module. */
  level?: number;
  /** Where the avatar sits, as a fraction of the viewport. */
  pos: { x: number; y: number };
  onPosChange: (p: { x: number; y: number }) => void;
  onClick: () => void;
  size?: number;
  visible?: boolean;
  /** True while the avatar is easing to a new spot on its own, rather than following a finger. */
  gliding?: boolean;
}

/** Every state we try to load a clip for. Missing ones fall back to idle. */
const CLIP_NAMES: AvatarState[] = ['idle', 'talk', 'think', 'celebrate', 'encourage', 'point', 'wave', 'walk', 'listen'];

/**
 * Keep the whole avatar on screen, and clear of the bottom navigation bar on a phone.
 * Clamping in fractions alone is not enough — the avatar has a pixel size, so half of
 * it has to be accounted for or it hangs off the edge on a narrow screen.
 */
export function clampPos(x: number, y: number, size: number): { x: number; y: number } {
  const w = window.innerWidth, h = window.innerHeight;
  const half = size / 2;
  const bottomBar = w <= 760 ? 74 : 12;
  const minX = (half + 8) / w, maxX = 1 - (half + 8) / w;
  const minY = (half + 62) / h, maxY = 1 - (half + bottomBar) / h;
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}

const ACCENT = 0x6ee7ff;
const ACCENT2 = 0xb388ff;
const WARM = 0x6ef0c8;

export function Avatar3D({
  state, level = 0, pos, onPosChange, onClick, size = 132, visible = true, gliding = false,
}: Avatar3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setState: (s: AvatarState) => void;
    setLevel: (v: number) => void;
    dispose: () => void;
  } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL — the app still works, the avatar simply does not appear
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // updateStyle must stay on: with it off the canvas keeps no CSS size and is
    // displayed at devicePixelRatio times `size`, which overflows its container.
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    // A page holding many WebGL canvases can have this one taken away. Ask for it back
    // rather than leaving the tutor as a blank square.
    const canvas = renderer.domElement;
    const onLost = (e: Event) => { e.preventDefault(); };
    const onRestored = () => { renderer.setSize(size, size); };
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    // Far enough back that the widest ring plus the celebrate jump stays inside the
    // canvas. Closer than this and the rings clip at the edges.
    camera.position.set(0, 0.3, 6.4);
    camera.lookAt(0, 0.05, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.5, 3.5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT2, 0.7);
    rim.position.set(-3, 1.5, -2);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(ACCENT, 0.45);
    fill.position.set(-1, -1, 3);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    // ================================================================ aura
    // The orbiting rings belong to the product, not to whichever body is showing, so
    // they live in their own group and survive a model being loaded.
    const aura = new THREE.Group();
    root.add(aura);

    const ringSpec: [radius: number, tiltX: number, spin: number, colour: number][] = [
      [1.12, 0.0, 0.0, ACCENT],
      [1.30, Math.PI / 2.6, 0.5, ACCENT2],
      [1.02, -Math.PI / 3.2, -0.7, WARM],
    ];

    const rings = ringSpec.map(([r, rx, rz, col]) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.026, 10, 84),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.62 })
      );
      ring.rotation.set(rx + Math.PI / 2, 0, rz);
      aura.add(ring);
      return ring;
    });

    // A satellite on each ring, so the rotation is legible at small sizes.
    const dots = ringSpec.map(([, , , col]) => {
      const d = new THREE.Mesh(
        new THREE.SphereGeometry(0.072, 16, 12),
        new THREE.MeshBasicMaterial({ color: col })
      );
      aura.add(d);
      return d;
    });

    // Appears while the microphone is open.
    const listenRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.02, 8, 64),
      new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0 })
    );
    listenRing.rotation.x = Math.PI / 2;
    aura.add(listenRing);

    // ================================================================ character
    const character = new THREE.Group();
    root.add(character);

    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f1c30, roughness: 0.25, metalness: 0.1,
      clearcoat: 1, clearcoatRoughness: 0.15,
      emissive: new THREE.Color(ACCENT).multiplyScalar(0.06),
    });
    character.add(new THREE.Mesh(new THREE.SphereGeometry(0.82, 48, 36), coreMat));

    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 24),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.32 })
    );
    character.add(heart);

    const face = new THREE.Group();
    face.position.z = 0.74;
    character.add(face);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff });
    const eyeGeo = new THREE.SphereGeometry(0.088, 18, 14);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.21, 0.16, 0.12);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.21, 0.16, 0.12);
    face.add(eyeL, eyeR);

    const mouth = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.16, 4, 12),
      new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.9 })
    );
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(0, -0.14, 0.14);
    mouth.scale.set(1, 1, 0.5);
    face.add(mouth);

    // ================================================================ model
    let mixer: THREE.AnimationMixer | null = null;
    const actions = new Map<string, THREE.AnimationAction>();
    let currentAction: THREE.AnimationAction | null = null;
    let usingGlb = false;
    let pending: AvatarState | null = null;

    function play(name: string, fade = 0.32) {
      const next = actions.get(name) ?? actions.get('idle');
      if (!next || next === currentAction) return;
      next.reset().setEffectiveWeight(1).fadeIn(fade).play();
      currentAction?.fadeOut(fade);
      currentAction = next;
    }

    new GLTFLoader().load(
      'avatar/tutor.glb',
      gltf => {
        const model = gltf.scene;

        // Normalise the model so the rings — which orbit the origin — sit around the
        // torso whatever scale the file was saved at. 2.4 units tall reads well against
        // a ring system about 3.3 units across.
        const box = new THREE.Box3().setFromObject(model);
        const height = Math.max(1e-3, box.getSize(new THREE.Vector3()).y);
        model.scale.setScalar(2.4 / height);
        box.setFromObject(model);
        model.position.y -= box.min.y + 1.2;
        model.position.x -= (box.min.x + box.max.x) / 2;

        model.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.frustumCulled = false;
        });

        character.visible = false;
        root.add(model);
        usingGlb = true;

        // Give the rings room to orbit a human silhouette rather than a small orb.
        aura.scale.setScalar(1.28);

        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) actions.set(clip.name.toLowerCase(), mixer.clipAction(clip));

        // Clips converted from the Mixamo FBX files by scripts/convert-anims.mjs.
        Promise.all(
          CLIP_NAMES.map(async name => {
            if (actions.has(name)) return;
            try {
              const res = await fetch(`avatar/anim/${name}.json`);
              if (!res.ok) return;
              const clip = THREE.AnimationClip.parse(await res.json());
              if (mixer) actions.set(name, mixer.clipAction(clip));
            } catch { /* clip not supplied; idle covers it */ }
          })
        ).then(() => play(pending ?? 'idle', 0));

        play('idle', 0);
      },
      undefined,
      () => { /* no model supplied — the procedural avatar stays */ }
    );

    // ================================================================ animation
    let raf = 0;
    let t = 0;
    let cur: AvatarState = state;
    let lvl = 0;
    let blink = 0;
    let nextBlink = 2 + Math.random() * 3;
    const clock = new THREE.Clock();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;
      mixer?.update(dt);

      // Never completely still — that is what makes it feel alive.
      const breathe = Math.sin(t * 1.5) * 0.045;
      root.position.y = breathe;
      root.position.x = 0;
      root.rotation.y = Math.sin(t * 0.55) * 0.22;
      root.rotation.z = Math.sin(t * 0.9) * 0.03;

      // --- aura, always running whichever body is showing
      rings.forEach((ring, i) => {
        const [r, , rz] = ringSpec[i];
        const dir = i % 2 ? -1 : 1;
        ring.rotation.z = rz + t * (0.5 + i * 0.24) * dir;
        const a = t * (1.1 + i * 0.5) * dir;
        const local = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
        local.applyEuler(ring.rotation);
        dots[i].position.copy(local);
      });
      // Counter-rotate so the rings hold their own axis rather than swinging with the body.
      aura.rotation.y = -root.rotation.y * 0.6;

      const wantRing = cur === 'listen' ? 0.8 : 0;
      const lm = listenRing.material as THREE.MeshBasicMaterial;
      lm.opacity += (wantRing - lm.opacity) * 0.12;
      listenRing.rotation.z = t * 1.6;
      if (cur === 'listen') listenRing.scale.setScalar(1 + Math.sin(t * 3.4) * 0.09);

      // --- procedural body only
      if (!usingGlb) {
        heart.scale.setScalar(1 + Math.sin(t * 2.6) * 0.07 + lvl * 0.18);
        (heart.material as THREE.MeshBasicMaterial).opacity = 0.26 + Math.sin(t * 2.6) * 0.06 + lvl * 0.2;

        blink += dt;
        if (blink > nextBlink) {
          const p = (blink - nextBlink) / 0.13;
          const sy = p < 1 ? Math.max(0.08, Math.abs(Math.cos(p * Math.PI))) : 1;
          eyeL.scale.y = sy; eyeR.scale.y = sy;
          if (p >= 1) { blink = 0; nextBlink = 2 + Math.random() * 3.5; eyeL.scale.y = 1; eyeR.scale.y = 1; }
        }

        const open = cur === 'talk' ? 0.35 + lvl * 1.5 : 0.35;
        mouth.scale.y += (open - mouth.scale.y) * 0.35;
        mouth.scale.x += ((cur === 'talk' ? 1 + lvl * 0.25 : 1) - mouth.scale.x) * 0.2;
      }

      // --- per-state flourishes on top of whichever body is showing.
      // With a rigged model the clip carries the performance, so these stay subtle.
      const gain = usingGlb ? 0.35 : 1;
      switch (cur) {
        case 'celebrate':
          root.position.y = breathe + Math.abs(Math.sin(t * 6.5)) * 0.34 * gain;
          root.rotation.z += Math.sin(t * 9) * 0.16 * gain;
          break;
        case 'think':
          root.rotation.z += Math.sin(t * 1.4) * 0.16 * gain;
          break;
        case 'wave':
          root.rotation.z += Math.sin(t * 7) * 0.2 * gain;
          break;
        case 'point':
          root.position.x = Math.sin(t * 3) * 0.06 * gain;
          break;
        case 'encourage':
          root.rotation.x = Math.sin(t * 2.2) * 0.1 * gain;
          break;
        default:
          root.rotation.x = 0;
      }

      renderer.render(scene, camera);
    };
    tick();

    api.current = {
      setState: s => {
        if (s === cur) return;
        cur = s;
        pending = s;
        if (usingGlb) play(s);
      },
      setLevel: v => { lvl = v; },
      dispose: () => {
        cancelAnimationFrame(raf);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        mixer?.stopAllAction();
        renderer.dispose();
        scene.traverse(o => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
        });
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      },
    };

    return () => api.current?.dispose();
  }, [size]);

  useEffect(() => { api.current?.setState(state); }, [state]);
  useEffect(() => { api.current?.setLevel(level); }, [level]);

  // A rotation or an on-screen keyboard can leave the avatar out of bounds.
  useEffect(() => {
    const onResize = () => onPosChange(clampPos(pos.x, pos.y, size));
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ---------------------------------------------------------------- dragging
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number } | null>(null);

  /**
   * A finger never holds perfectly still, so treating any movement at all as a drag
   * meant taps on a phone were swallowed and the tutor appeared not to respond.
   * Anything inside this radius counts as a tap.
   */
  const TAP_SLOP = 10;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      dx: e.clientX - pos.x * window.innerWidth,
      dy: e.clientY - pos.y * window.innerHeight,
      startX: e.clientX,
      startY: e.clientY,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Only actually move once the gesture has travelled past the tap threshold.
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= TAP_SLOP) return;
    onPosChange(clampPos(
      (e.clientX - d.dx) / window.innerWidth,
      (e.clientY - d.dy) / window.innerHeight,
      size
    ));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= TAP_SLOP) onClick();
  };

  if (!visible) return null;

  return (
    <div
      ref={host}
      className={`avatar3d avatar-${state}${gliding ? ' avatar-gliding' : ''}`}
      style={{
        width: size, height: size,
        left: `calc(${pos.x * 100}% - ${size / 2}px)`,
        top: `calc(${pos.y * 100}% - ${size / 2}px)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="button"
      tabIndex={0}
      aria-label="Tutor. Tap to ask a question."
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    />
  );
}
