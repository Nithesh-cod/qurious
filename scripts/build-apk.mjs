/**
 * One command to rebuild the Android app and drop the APK in the project root.
 *
 *   npm run apk
 *
 * Builds the web bundle, syncs it into the Capacitor Android project, runs Gradle,
 * and copies the result to N:\MY PROJECTS\SIH\QuantumLearning.apk.
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const repoRoot = resolve(project, '..');
const androidDir = join(project, 'android');
const outApk = join(repoRoot, 'Qurious.apk');

const localAppData = process.env.LOCALAPPDATA ?? '';
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(localAppData, 'Android', 'Sdk');
const jbr = process.env.JAVA_HOME ?? 'C:\\Program Files\\Android\\Android Studio\\jbr';

const step = (msg) => console.log(`\n\u2192 ${msg}`);
const run = (cmd, cwd) =>
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: jbr } });

if (!existsSync(sdk)) {
  console.error(`Android SDK not found at ${sdk}. Set ANDROID_HOME and try again.`);
  process.exit(1);
}

step('Building the web bundle');
run('npm run build', project);

if (!existsSync(androidDir)) {
  step('Adding the Android platform');
  run('npx cap add android', project);
}

step('Writing android/local.properties');
mkdirSync(androidDir, { recursive: true });
writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);

step('Syncing web assets into the Android project');
run('npx cap sync android', project);

// `cap add` scaffolds Capacitor's stock launcher icon and splash, and `cap sync` never
// touches them — which is how a build shipped with somebody else's logo on it. Ours are
// generated into resources/android by scripts/make-android-branding.py and stamped over
// the project here, after every sync, so a regenerated android/ cannot lose them.
step('Applying Qurious launcher icons and splash screens');
const brandDir = join(project, 'resources', 'android');
const resDir = join(androidDir, 'app', 'src', 'main', 'res');
if (existsSync(brandDir)) {
  let copied = 0;
  for (const folder of readdirSync(brandDir)) {
    const from = join(brandDir, folder);
    const to = join(resDir, folder);
    mkdirSync(to, { recursive: true });
    for (const file of readdirSync(from)) {
      copyFileSync(join(from, file), join(to, file));
      copied++;
    }
  }
  console.log(`  ${copied} branding files copied into android/app/src/main/res`);
} else {
  console.warn('  resources/android is missing — run scripts/make-android-branding.py');
}

step('Running Gradle (this takes a while the first time)');
// The `.\` prefix is required: cmd.exe will not resolve gradlew.bat from the working
// directory on its own when NoDefaultCurrentDirectoryInExePath is set.
run(process.platform === 'win32' ? '.\\gradlew.bat assembleDebug --no-daemon' : './gradlew assembleDebug --no-daemon', androidDir);

const built = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(built)) {
  console.error(`Gradle finished but no APK was produced at ${built}`);
  process.exit(1);
}

copyFileSync(built, outApk);
const mb = (statSync(outApk).size / 1024 / 1024).toFixed(2);
console.log(`\n\u2713 ${outApk}  (${mb} MB)`);
console.log('  Install with:  adb install -r "' + outApk + '"');
console.log('  Or copy it to a phone and open it (allow installing from unknown sources).');
