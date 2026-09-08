# Avatar assets

The tutor uses the rigged character in this folder. If these files are removed the app
falls back to a procedural orb, so nothing here is required to run.

## What is here

    tutor.glb            the character, rigged, T-pose, no animation (2.0 MB)
    anim/idle.json       animation clips, one per avatar state
    anim/talk.json
    anim/think.json
    anim/celebrate.json
    anim/encourage.json
    anim/point.json
    anim/wave.json
    anim/listen.json
    anim/walk.json       spare, not currently bound to a state

## Adding or replacing animations

Mixamo exports animations as FBX, and each file is around 3 MB because it carries the
whole skinned mesh. We only need the curves — the character already lives in tutor.glb.
The converter strips everything else:

1. Put the FBX files in the project-root `avatar/` folder
2. Map the filename to a state in `scripts/convert-anims.mjs`
3. Run `node scripts/convert-anims.mjs`

That turned 39.6 MB of FBX into 1.62 MB of clip JSON, which is what ships in the APK.

The converter also strips the `mixamorig:` prefix from every track name so the clips
bind onto the plain bone names (`Hips`, `Spine`, `Head`, …) used by tutor.glb. If you
swap in a differently-named rig, that rename is the thing to adjust.

## Replacing the character

Export as glTF Binary (.glb) and save it as `tutor.glb`. Any scale works — the model is
auto-normalised to 2.4 units tall with its feet at y = −1.2 so the rings orbit its
torso. It should face +Z (toward the viewer); if it ends up facing away, add
`model.rotation.y = Math.PI` in `src/ui/Avatar3D.tsx`.

Do not copy the export straight in. Run:

    python scripts/shrink-avatar-textures.py

It reads avatar/model.glb and writes public/avatar/tutor.glb with every texture resized
to what a 92 pixel avatar can actually show. On the current character that is 4.30 MB
down to 2.04 MB, almost all of it from one 1024 by 1024 hair texture. Measured at the
size the avatar is drawn, the worst texture loses 33 dB and most lose over 40, which is
below what anyone can see. The source model is never modified, so it is always
re-runnable and always reversible.

After replacing the character, run the tests. tests/avatar-rig.test.ts checks that every
track in every clip names a bone the new model actually has. That is the failure worth
guarding against: a renamed rig loads and plays without a single error, and simply never
moves.

## The rings

The orbiting rings are drawn in code, not in the model, and live in their own group
(`aura` in `Avatar3D.tsx`). They stay whichever body is showing. `aura.scale` is set to
1.28 when a model loads, which sizes them around a human silhouette rather than the orb.
