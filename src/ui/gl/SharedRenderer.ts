/**
 * One WebGL context for the whole app.
 *
 * A browser allows roughly sixteen live WebGL contexts per page and silently kills the
 * oldest when you exceed it — which is how a lesson page full of Bloch spheres turned
 * the tutor avatar into a blank white square. The old fix was a budget: four spheres in
 * 3D and every one after that downgraded to a flat drawing.
 *
 * This is the real fix. A single renderer lives off-screen. Each view owns an ordinary
 * 2D canvas sitting in its natural place in the document, and every frame the renderer
 * draws that view's scene once and blits the result into it.
 *
 * The blit is why this and not the usual scissor-rectangle trick. Scissoring needs one
 * canvas stretched over the viewport, which then has to be z-ordered against panels,
 * sheets and the floating avatar — and our panels use backdrop-filter, which would
 * blur any canvas sitting behind them. Per-view canvases stack like any other element,
 * so none of that arises. The cost is one drawImage per view per frame, which for a
 * handful of 190px spheres is nothing.
 *
 * Views scrolled off screen are skipped entirely.
 */

import * as THREE from 'three';

export interface View {
  /** The 2D canvas this view is blitted into. */
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Called once per frame before drawing, with seconds since the last frame. */
  update?: (dt: number) => void;
}

let renderer: THREE.WebGLRenderer | null = null;
let raf = 0;
let failed = false;
let lastW = -1, lastH = -1;
const views = new Set<View>();
const clock = new THREE.Clock();

/** True when WebGL is unavailable, so callers can fall back to a 2D drawing. */
export function glUnavailable(): boolean {
  return failed;
}

const dpr = () => Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 2);

function ensure(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'high-performance',
    });
  } catch {
    failed = true;
    return false;
  }
  renderer.setPixelRatio(dpr());
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // The one context can still be lost — a backgrounded tab, a driver reset. Mark it
  // unavailable so views fall back rather than freezing mid-frame.
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    failed = true;
  }, false);

  return true;
}

function visible(c: HTMLCanvasElement): boolean {
  const r = c.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  return !(r.bottom < -60 || r.top > window.innerHeight + 60 ||
           r.right < -60 || r.left > window.innerWidth + 60);
}

function frame() {
  raf = requestAnimationFrame(frame);
  if (!renderer) return;
  const dt = Math.min(clock.getDelta(), 0.05);

  for (const v of views) {
    if (!visible(v.canvas)) continue;
    v.update?.(dt);

    const w = v.canvas.clientWidth || v.canvas.width;
    const h = v.canvas.clientHeight || v.canvas.height;
    if (w < 2 || h < 2) continue;

    // Only reallocate the drawing buffer when the size actually changes. Views of the
    // same size render back to back without touching it.
    if (w !== lastW || h !== lastH) {
      renderer.setSize(w, h, false);
      lastW = w; lastH = h;
    }

    v.camera.aspect = w / h;
    v.camera.updateProjectionMatrix();
    renderer.render(v.scene, v.camera);

    const px = Math.round(w * dpr()), py = Math.round(h * dpr());
    if (v.canvas.width !== px || v.canvas.height !== py) {
      v.canvas.width = px;
      v.canvas.height = py;
    }
    const ctx = v.canvas.getContext('2d');
    if (!ctx) continue;
    ctx.clearRect(0, 0, px, py);
    ctx.drawImage(renderer.domElement, 0, 0, px, py);
  }
}

/** Register a view. Returns the function that removes it again. */
export function addView(v: View): () => void {
  if (!ensure()) return () => {};
  views.add(v);
  if (!raf) { clock.getDelta(); frame(); }
  return () => {
    views.delete(v);
    disposeScene(v.scene);
    // Do not tear the context down the instant the last view goes: React's development
    // double-effect removes and re-adds within the same tick, and rebuilding the
    // renderer in that gap loses the animation loop. Wait a beat and check again.
    if (views.size === 0) {
      setTimeout(() => { if (views.size === 0) shutdown(); }, 400);
    }
  };
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (mat) {
      (Array.isArray(mat) ? mat : [mat]).forEach(x => {
        const withMap = x as THREE.Material & { map?: THREE.Texture | null };
        withMap.map?.dispose();
        x.dispose();
      });
    }
  });
  scene.clear();
}

/** Tear the context down when the last view goes, so a long session does not leak it. */
function shutdown() {
  cancelAnimationFrame(raf);
  raf = 0;
  renderer?.dispose();
  renderer = null;
  lastW = -1; lastH = -1;
}

/**
 * Drag-to-orbit for one view's camera, listening on the view's own canvas.
 *
 * Written rather than pulling in OrbitControls, which expects to own the canvas it is
 * given — and here several views share one renderer while each owns its own element.
 */
export interface Orbit {
  /** Azimuth around Y. */
  theta: number;
  /** Elevation, clamped away from the poles where the view would roll. */
  phi: number;
  radius: number;
  /** Slow drift while untouched. Stops for good once the learner takes hold. */
  auto: boolean;
}

/**
 * How far a touch must travel before it counts as an orbit rather than a scroll.
 * Below this every gesture is ambiguous, and guessing early is what makes a page feel
 * like it is fighting the finger.
 */
const CLAIM_SLOP = 8;

export function attachOrbit(el: HTMLElement, orbit: Orbit, onChange?: () => void): () => void {
  let dragging = false;
  let lastX = 0, lastY = 0, pointer = -1;
  // A touch starts undecided. A mouse never is — there is nothing else it could mean.
  let claimed = false;
  let startX = 0, startY = 0;

  const down = (e: PointerEvent) => {
    dragging = true;
    pointer = e.pointerId;
    lastX = startX = e.clientX;
    lastY = startY = e.clientY;
    claimed = e.pointerType !== 'touch';
    if (claimed) {
      orbit.auto = false;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = 'grabbing';
    }
  };

  const move = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointer) return;

    if (!claimed) {
      // Undecided touch. `touch-action: pan-y` means the browser is still free to turn
      // this into a page scroll, and it will send pointercancel when it does. Until one
      // of us commits, move the camera by nothing.
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > CLAIM_SLOP) {
        // Plainly a scroll. Stand down and let the page have it.
        dragging = false;
        return;
      }
      if (Math.abs(dx) <= CLAIM_SLOP) return;
      // Sideways past the slop: nothing else on this axis wants the gesture, so take it.
      claimed = true;
      orbit.auto = false;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = 'grabbing';
      lastX = e.clientX; lastY = e.clientY;
      return;
    }

    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    orbit.theta -= dx * 0.0095;
    orbit.phi = Math.min(Math.PI - 0.12, Math.max(0.12, orbit.phi - dy * 0.0095));
    onChange?.();
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    dragging = false;
    claimed = false;
    el.releasePointerCapture?.(e.pointerId);
    el.style.cursor = 'grab';
  };

  el.style.cursor = 'grab';
  // Not `none`.
  //
  // `none` hands the element every touch, including the vertical swipe that means "scroll
  // the page". On a phone the Build tab stacks a dozen of these spheres down a long
  // column, so almost anywhere the thumb lands is a sphere — the page simply would not
  // scroll. `pan-y` reserves the vertical axis for the document and leaves the horizontal
  // one here, which is also the axis that matters: azimuth is what people reach for.
  //
  // Tilt is not lost. Once a drag is claimed sideways the browser stops competing for the
  // gesture and every later move, vertical included, arrives here.
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}

/** Place a camera from spherical orbit coordinates. */
export function applyOrbit(camera: THREE.PerspectiveCamera, o: Orbit) {
  camera.position.set(
    o.radius * Math.sin(o.phi) * Math.sin(o.theta),
    o.radius * Math.cos(o.phi),
    o.radius * Math.sin(o.phi) * Math.cos(o.theta)
  );
  camera.lookAt(0, 0, 0);
}
