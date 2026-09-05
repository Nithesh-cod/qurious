/**
 * Speech — the tutor talks, and listens.
 *
 * Two backends, chosen by where the app is running:
 *
 *  - In a browser, the Web Speech API. No download, no library.
 *  - In the Android build, the platform's own TextToSpeech and SpeechRecognizer, via
 *    `nativeSpeech.ts`. This is not a nicety: Android System WebView ships no
 *    `speechSynthesis` object at all, and recognition inside a WebView is refused with
 *    "not-allowed". Verified on a Galaxy A15 (Android 16, WebView 151) — before this
 *    split the tutor was mute in the APK while working fine in Chrome.
 *
 * Caveats that remain true on both paths:
 *
 *  - Which Indian voices exist varies by handset; the phone's installed voices decide.
 *  - Recognition usually needs a network connection, so the wake word stops working
 *    offline. Everything else in the app keeps working.
 */

import {
  isNativePlatform, loadNative,
  nativeSpeak, nativeStopSpeaking, nativeListen,
} from './nativeSpeech';

export type LangCode = 'en-IN' | 'en-US' | 'hi-IN' | 'ta-IN' | 'te-IN' | 'kn-IN' | 'ml-IN' | 'mr-IN' | 'bn-IN';

export interface SpeechLang {
  code: LangCode;
  label: string;
  native: string;
}

export const LANGS: SpeechLang[] = [
  { code: 'en-IN', label: 'English (India)', native: 'English' },
  { code: 'en-US', label: 'English (US)', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr-IN', label: 'Marathi', native: 'मराठी' },
  { code: 'bn-IN', label: 'Bengali', native: 'বাংলা' },
];

// ---------------------------------------------------------------- speaking

type SpeechEvents = {
  onStart?: () => void;
  onEnd?: () => void;
  /** Rough mouth-open amount 0..1 while speaking, for avatar lip movement. */
  onLevel?: (v: number) => void;
};

let currentUtterance: SpeechSynthesisUtterance | null = null;
let levelTimer: number | null = null;

/** Kick the native bridges awake early so the first tap on the speaker is not the slow one. */
if (isNativePlatform()) void loadNative();

export function speechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativePlatform()) return true;   // resolved properly once loadNative settles
  return 'speechSynthesis' in window;
}

export function voicesFor(lang: LangCode): SpeechSynthesisVoice[] {
  // The native path picks its voice from the language tag alone; there is no
  // SpeechSynthesisVoice object to hand back on a phone.
  if (isNativePlatform() || !('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices();
  const base = lang.split('-')[0];
  const exact = all.filter(v => v.lang.replace('_', '-') === lang);
  if (exact.length) return exact;
  return all.filter(v => v.lang.replace('_', '-').startsWith(base));
}

/**
 * Speak a line. Resolves when finished (or immediately if speech is unavailable, so
 * callers never hang on a device without voices).
 */
export function speak(text: string, lang: LangCode = 'en-IN', ev: SpeechEvents = {}): Promise<void> {
  if (!text.trim()) { ev.onEnd?.(); return Promise.resolve(); }

  // On a phone this is the only path that produces sound.
  if (isNativePlatform()) {
    return nativeSpeak(text, lang, ev).then(spoke => {
      if (!spoke) ev.onEnd?.();
    });
  }

  if (!('speechSynthesis' in window)) { ev.onEnd?.(); return Promise.resolve(); }

  stopSpeaking();

  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voice = voicesFor(lang)[0];
    if (voice) u.voice = voice;
    u.rate = 0.98;
    u.pitch = 1.02;

    const finish = () => {
      if (levelTimer !== null) { clearInterval(levelTimer); levelTimer = null; }
      ev.onLevel?.(0);
      ev.onEnd?.();
      currentUtterance = null;
      resolve();
    };

    u.onstart = () => {
      ev.onStart?.();
      // The Web Speech API exposes no amplitude, so drive the mouth from a shaped
      // noise signal. It reads as talking, which is all the avatar needs.
      if (ev.onLevel) {
        let t = 0;
        levelTimer = window.setInterval(() => {
          t += 0.09;
          const v = 0.35 + 0.32 * Math.sin(t * 7.3) + 0.22 * Math.sin(t * 13.1 + 1.4);
          ev.onLevel?.(Math.max(0, Math.min(1, v)));
        }, 55);
      }
    };
    u.onend = finish;
    u.onerror = finish;

    currentUtterance = u;
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (isNativePlatform()) { void nativeStopSpeaking(); return; }
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  if (levelTimer !== null) { clearInterval(levelTimer); levelTimer = null; }
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  if (isNativePlatform()) return false;   // the native call resolves when it finishes
  return 'speechSynthesis' in window && window.speechSynthesis.speaking;
}

// ---------------------------------------------------------------- listening

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function listeningSupported(): boolean {
  if (typeof window === 'undefined') return false;
  // In a WebView the constructor exists but start() is always refused, so its presence
  // proves nothing. On a phone we go through the native recogniser, which reports its
  // own availability and permission state when actually asked to listen.
  if (isNativePlatform()) return true;
  return recognitionCtor() !== null;
}

export interface ListenHandle { stop: () => void }

/** Listen once and return what was heard. */
export function listenOnce(
  lang: LangCode,
  onResult: (text: string, final: boolean) => void,
  onError?: (msg: string) => void
): ListenHandle {
  if (isNativePlatform()) {
    let live: { stop: () => void } | null = null;
    let cancelled = false;
    void nativeListen(lang, onResult, onError).then(h => {
      if (cancelled) h?.stop(); else live = h;
    });
    return { stop: () => { cancelled = true; live?.stop(); } };
  }

  const Ctor = recognitionCtor();
  if (!Ctor) { onError?.('This device cannot listen — speech recognition is unavailable.'); return { stop: () => {} }; }

  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0]?.transcript ?? '';
      if (text) onResult(text.trim(), !!r.isFinal);
    }
  };
  rec.onerror = e => {
    const map: Record<string, string> = {
      'not-allowed': 'Microphone permission was denied.',
      'no-speech': 'I did not hear anything.',
      'network': 'Speech recognition needs a network connection on this device.',
      'audio-capture': 'No microphone was found.',
    };
    onError?.(map[e.error] ?? `Could not listen (${e.error}).`);
  };

  try { rec.start(); } catch { onError?.('Could not start listening.'); }
  return { stop: () => { try { rec.abort(); } catch { /* already stopped */ } } };
}

// ---------------------------------------------------------------- wake word

export interface WakeOptions {
  phrases?: string[];
  lang?: LangCode;
  onWake: (heardAfterPhrase: string) => void;
  onStateChange?: (listening: boolean) => void;
  onError?: (msg: string) => void;
}

/**
 * Continuous "hey tutor" listener.
 *
 * Restarts itself when the recogniser times out, which browsers do every few seconds.
 * Two things worth knowing before relying on it in a demo: it needs microphone
 * permission, and on Android it needs a network connection. Always leave the tap
 * target available as the reliable path.
 */
export function startWakeWord(opts: WakeOptions): ListenHandle {
  const phrases = (opts.phrases ?? ['hey tutor', 'hey teacher', 'hi tutor', 'ok tutor']).map(p => p.toLowerCase());

  // Android's recogniser hands back one utterance and stops, so the continuous listener
  // is built here by relistening rather than by asking for `continuous`.
  if (isNativePlatform()) {
    let stopped = false;
    let live: { stop: () => void } | null = null;

    const round = () => {
      if (stopped) return;
      void nativeListen(
        opts.lang ?? 'en-IN',
        (text, final) => {
          const heard = text.toLowerCase().trim();
          const hit = phrases.find(p => heard.includes(p));
          if (hit) {
            opts.onWake(heard.slice(heard.indexOf(hit) + hit.length).trim());
            live?.stop();
            return;
          }
          if (final) { live?.stop(); setTimeout(round, 400); }
        },
        msg => { stopped = true; opts.onStateChange?.(false); opts.onError?.(msg); }
      ).then(h => {
        if (stopped) { h?.stop(); return; }
        live = h;
        opts.onStateChange?.(!!h);
        if (!h) stopped = true;
      });
    };

    round();
    return { stop: () => { stopped = true; opts.onStateChange?.(false); live?.stop(); } };
  }

  const Ctor = recognitionCtor();
  if (!Ctor) { opts.onError?.('Wake word needs speech recognition, which this device does not provide.'); return { stop: () => {} }; }

  let stopped = false;
  let rec: SpeechRecognitionLike | null = null;

  const begin = () => {
    if (stopped) return;
    const r = new Ctor();
    rec = r;
    r.lang = opts.lang ?? 'en-IN';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const heard = (e.results[i][0]?.transcript ?? '').toLowerCase().trim();
        if (!heard) continue;
        const hit = phrases.find(p => heard.includes(p));
        if (hit) {
          const after = heard.slice(heard.indexOf(hit) + hit.length).trim();
          opts.onWake(after);
          try { r.stop(); } catch { /* will restart via onend */ }
          return;
        }
      }
    };
    r.onerror = e => {
      if (e.error === 'not-allowed') {
        stopped = true;
        opts.onStateChange?.(false);
        opts.onError?.('Microphone permission was denied, so the wake word is off.');
      }
      // Other errors are usually transient; onend restarts.
    };
    r.onend = () => {
      opts.onStateChange?.(false);
      if (!stopped) setTimeout(begin, 400);
    };

    try { r.start(); opts.onStateChange?.(true); }
    catch { setTimeout(begin, 900); }
  };

  begin();
  return {
    stop: () => {
      stopped = true;
      opts.onStateChange?.(false);
      try { rec?.abort(); } catch { /* already stopped */ }
    },
  };
}

/** Warm the voice list — Chrome populates it asynchronously. */
export function primeVoices(): Promise<void> {
  if (isNativePlatform()) return loadNative();
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise(resolve => {
    const have = window.speechSynthesis.getVoices();
    if (have.length) { resolve(); return; }
    const on = () => { window.speechSynthesis.removeEventListener('voiceschanged', on); resolve(); };
    window.speechSynthesis.addEventListener('voiceschanged', on);
    setTimeout(resolve, 1500);
  });
}
