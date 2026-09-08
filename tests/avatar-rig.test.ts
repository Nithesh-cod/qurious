/**
 * The avatar's animation clips must bind to the avatar's skeleton.
 *
 * Swapping the rigged character is the one asset change that fails silently. The model
 * loads, the clips load, the mixer runs happily — and the character stands frozen in a
 * T-pose, because the track names address bones that are not in the new rig. Nothing
 * throws. Nothing logs. On a 92 pixel avatar you might not notice for a while.
 *
 * The clips come from Mixamo, whose bones carry a "mixamorig:" prefix that
 * scripts/convert-anims.mjs strips so they match the plain names in the GLB. That rename
 * is the fragile part, and this is what checks it held.
 *
 * Reading the GLB's JSON chunk directly rather than loading it through three.js keeps
 * this a file-format check with no WebGL, no DOM and no loader stubs.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AVATAR = join(__dirname, '..', 'public', 'avatar');
const GLB = join(AVATAR, 'tutor.glb');
const ANIM = join(AVATAR, 'anim');

/** Node names declared in a .glb, read out of its embedded glTF JSON chunk. */
function glbNodeNames(path: string): { names: Set<string>; joints: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 4).toString('ascii'), 'glTF magic').toBe('glTF');
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  return {
    names: new Set((gltf.nodes ?? []).map((n: { name?: string }) => n.name).filter(Boolean)),
    joints: (gltf.skins?.[0]?.joints ?? []).length,
  };
}

const clipFiles = readdirSync(ANIM).filter(f => f.endsWith('.json'));

describe('the avatar model', () => {
  it('is a rigged glTF binary with a skeleton', () => {
    const { names, joints } = glbNodeNames(GLB);
    expect(names.size).toBeGreaterThan(40);
    expect(joints).toBeGreaterThan(40);
    // The clips are authored against a humanoid rig; these are the bones every one of
    // them drives, so their absence means the wrong kind of model was dropped in.
    for (const bone of ['Hips', 'Spine', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']) {
      expect(names.has(bone), `model is missing the bone ${bone}`).toBe(true);
    }
  });

  it('ships a clip for every state the avatar can be in', () => {
    const states = ['idle', 'talk', 'think', 'celebrate', 'encourage', 'point', 'wave', 'listen', 'walk'];
    for (const s of states) {
      expect(clipFiles, `no clip for the ${s} state`).toContain(`${s}.json`);
    }
  });
});

describe('every clip binds to the model', () => {
  const { names } = glbNodeNames(GLB);

  for (const file of clipFiles) {
    it(`${file.replace('.json', '')} drives only bones that exist`, () => {
      const clip = JSON.parse(readFileSync(join(ANIM, file), 'utf8'));
      expect(clip.tracks?.length, 'clip has no tracks').toBeGreaterThan(0);
      expect(clip.duration, 'clip has no duration').toBeGreaterThan(0);

      // A track name is "<bone>.<property>", e.g. "LeftArm.quaternion".
      const unbound = [...new Set(
        clip.tracks.map((t: { name: string }) => t.name.split('.')[0])
      )].filter(bone => !names.has(bone as string));

      expect(unbound, `${file}: these bones are not in tutor.glb`).toEqual([]);
    });
  }

  it('leaves no Mixamo prefix behind', () => {
    // The converter strips it. If one survives, the clip silently does nothing.
    for (const file of clipFiles) {
      const raw = readFileSync(join(ANIM, file), 'utf8');
      expect(raw.includes('mixamorig'), `${file} still carries mixamorig bone names`).toBe(false);
    }
  });
});
