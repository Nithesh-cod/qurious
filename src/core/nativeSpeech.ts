/**
 * Native speech, for the Android build.
 *
 * Android System WebView does not ship the Web Speech *synthesis* API at all —
 * `window.speechSynthesis` is simply undefined — and recognition inside the WebView is
 * refused with "not-allowed" because a web page cannot hold the microphone permission
 * the way an app can. Both were verified on a Galaxy A15 running Android 16.
 *
 * So on a phone we go through the platform APIs instead: Android's own TextToSpeech
 * engine and its SpeechRecognizer. In a browser none of this loads and `speech.ts`
 * keeps using the Web Speech API exactly as before.
 */

import { Capacitor } from '@capacitor/core';
import type { LangCode } from './speech';

export const isNativePlatform = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

type TtsPlugin = {
  speak(o: { text: string; lang: string; rate: number; pitch: number; volume: number;
             category?: string; queueStrategy?: number }): Promise<void>;
  stop(): Promise<void>;
  getSupportedLanguages(): Promise<{ languages: string[] }>;
};

type SttPlugin = {
  available(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ speechRecognition: string }>;
  requestPermissions(): Promise<{ speechRecognition: string }>;
  start(o: { language?: string; maxResults?: number; partialResults?: boolean;
             popup?: boolean }): Promise<{ matches?: string[] }>;
  stop(): Promise<void>;
  addListener(name: 'partialResults' | 'listeningState',
              cb: (d: { matches?: string[]; status?: string }) => void): Promise<{ remove: () => Promise<void> }>;
  removeAllListeners(): Promise<void>;
};

let tts: TtsPlugin | null = null;
let stt: SttPlugin | null = null;
let loading: Promise<void> | null = null;

/** Loaded lazily so a browser build never pulls the native bridges in. */
export function loadNative(): Promise<void> {
  if (!isNativePlatform()) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const m = await import('@capacitor-community/text-to-speech');
      tts = m.TextToSpeech as unknown as TtsPlugin;
    } catch { tts = null; }
    try {
      const m = await import('@capacitor-community/speech-recognition');
      stt = m.SpeechRecognition as unknown as SttPlugin;
    } catch { stt = null; }
  })();
  return loading;
}

export const nativeTtsReady = (): boolean => tts !== null;
export const nativeSttReady = (): boolean => stt !== null;

/** Mouth movement, driven the same way as the web path since neither API exposes amplitude. */
function mouth(onLevel?: (v: number) => void) {
  if (!onLevel) return () => {};
  let t = 0;
  const timer = window.setInterval(() => {
    t += 0.09;
    const v = 0.35 + 0.32 * Math.sin(t * 7.3) + 0.22 * Math.sin(t * 13.1 + 1.4);
    onLevel(Math.max(0, Math.min(1, v)));
  }, 55);
  return () => { clearInterval(timer); onLevel(0); };
}

export async function nativeSpeak(
  text: string, lang: LangCode,
  ev: { onStart?: () => void; onEnd?: () => void; onLevel?: (v: number) => void } = {}
): Promise<boolean> {
  await loadNative();
  if (!tts) return false;
  try { await tts.stop(); } catch { /* nothing was speaking */ }
  ev.onStart?.();
  const stopMouth = mouth(ev.onLevel);
  try {
    await tts.speak({ text, lang, rate: 1.0, pitch: 1.05, volume: 1.0, category: 'ambient' });
  } catch {
    // A missing voice for this language should not look like a crash.
  } finally {
    stopMouth();
    ev.onEnd?.();
  }
  return true;
}

export async function nativeStopSpeaking(): Promise<void> {
  if (!tts) return;
  try { await tts.stop(); } catch { /* already stopped */ }
}

/** Which of our nine languages the phone actually has a voice for. */
export async function nativeVoiceLangs(): Promise<string[]> {
  await loadNative();
  if (!tts) return [];
  try { return (await tts.getSupportedLanguages()).languages ?? []; } catch { return []; }
}

export interface NativeListen { stop: () => void }

export async function nativeListen(
  lang: LangCode,
  onResult: (text: string, final: boolean) => void,
  onError?: (msg: string) => void,
  opts: { continuous?: boolean } = {}
): Promise<NativeListen | null> {
  await loadNative();
  if (!stt) return null;

  try {
    const avail = await stt.available();
    if (!avail.available) { onError?.('This phone has no speech recogniser installed.'); return null; }
    let perm = await stt.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await stt.requestPermissions();
    if (perm.speechRecognition !== 'granted') {
      onError?.('Microphone permission was denied. Tap the tutor instead — everything works without the mic.');
      return null;
    }
  } catch {
    onError?.('Could not reach the speech recogniser.');
    return null;
  }

  let stopped = false;
  let handle: { remove: () => Promise<void> } | null = null;

  try {
    handle = await stt.addListener('partialResults', d => {
      const text = d.matches?.[0];
      if (text) onResult(text.trim(), false);
    });
    // popup:false keeps Android's own listening dialog out of the way.
    const res = await stt.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
    const final = res?.matches?.[0];
    if (final && !stopped) onResult(final.trim(), true);
  } catch (e) {
    if (!stopped) onError?.((e as Error)?.message ?? 'Listening failed.');
  }

  return {
    stop: () => {
      stopped = true;
      handle?.remove().catch(() => {});
      stt?.stop().catch(() => {});
    },
  };
}
