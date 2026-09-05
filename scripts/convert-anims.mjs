/**
 * Convert Mixamo FBX animations into compact clip files.
 *
 *   node scripts/convert-anims.mjs
 *
 * The FBX files exported from Mixamo carry the whole skinned mesh, about 3.3 MB each.
 * We only want the animation curves — the character itself already lives in tutor.glb.
 * This parses each FBX, throws the geometry away, and writes just the AnimationClip as
 * JSON, which is a fraction of the size and loads instantly on a phone.
 *
 * Source files are read from ../avatar (the folder in the project root).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnimationClip } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const source = resolve(project, '..', 'avatar');
const outDir = join(project, 'public', 'avatar', 'anim');

/**
 * Which Mixamo clip drives which avatar state.
 * Mixamo has no "talking" animation in this set, so the greeting gesture stands in —
 * it reads as someone addressing you, which is what the state is for.
 */
const MAP = {
  'Old Man Idle.fbx': 'idle',
  'Standing Greeting.fbx': 'talk',
  'Stand To Cover.fbx': 'think',
  'Quick Formal Bow.fbx': 'celebrate',
  'Salute.fbx': 'encourage',
  'Right Turn W_ Briefcase.fbx': 'point',
  'Entry.fbx': 'wave',
  'Start Walking.fbx': 'walk',
  'Walk Forward Arc Right.fbx': 'listen',
};

// Node has no DOM, and FBXLoader only touches these when a file embeds textures.
// The animation files do not, so a minimal stub is enough to let parsing finish.
const stubElement = () => ({
  style: {}, setAttribute() {}, appendChild() {}, getContext: () => null,
  addEventListener() {}, removeEventListener() {},
});
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: stubElement,
    createElement: stubElement,
    createTextNode: () => ({}),
    body: stubElement(),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node' };
}

if (!existsSync(source)) {
  console.error(`No avatar folder at ${source}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const loader = new FBXLoader();
let converted = 0;
let sourceBytes = 0;
let outBytes = 0;

for (const [file, state] of Object.entries(MAP)) {
  const path = join(source, file);
  if (!existsSync(path)) {
    console.warn(`  skip  ${file} — not found`);
    continue;
  }

  const buf = readFileSync(path);
  sourceBytes += buf.byteLength;

  let group;
  try {
    group = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  } catch (err) {
    console.warn(`  fail  ${file} — ${err.message}`);
    continue;
  }

  const clip = group.animations?.[0];
  if (!clip) {
    console.warn(`  none  ${file} — no animation track inside`);
    continue;
  }

  // Mixamo prefixes every bone with "mixamorig". The GLB rig uses plain names, so
  // strip the prefix and the clip binds straight onto it.
  for (const track of clip.tracks) {
    track.name = track.name.replace(/^mixamorig[0-9]*:?/i, '');
  }
  clip.name = state;

  const json = JSON.stringify(AnimationClip.toJSON(clip));
  const out = join(outDir, `${state}.json`);
  writeFileSync(out, json);
  outBytes += json.length;
  converted++;

  const kb = (json.length / 1024).toFixed(0);
  const srcMb = (buf.byteLength / 1024 / 1024).toFixed(1);
  console.log(`  ok    ${state.padEnd(10)} ${srcMb} MB FBX  ->  ${kb} KB  (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`);
}

console.log(
  `\n${converted} clips written to public/avatar/anim/\n` +
  `${(sourceBytes / 1024 / 1024).toFixed(1)} MB of FBX became ${(outBytes / 1024 / 1024).toFixed(2)} MB of clip JSON.`
);

const model = join(project, 'public', 'avatar', 'tutor.glb');
if (existsSync(model)) {
  console.log(`Model in place: tutor.glb (${(statSync(model).size / 1024 / 1024).toFixed(2)} MB)`);
} else {
  console.log('Model missing — copy avatar/model.glb to public/avatar/tutor.glb');
}
