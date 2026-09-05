/**
 * LLM adapter.
 *
 * Optional by design. Everything in this app works with no key and no network; the
 * language model widens what the tutor can answer, it does not enable it.
 *
 * The important rule survives: anything the model proposes as a *circuit fix* is run
 * on the simulator before the learner sees it, exactly like the offline repair search.
 * The model gets no special trust. For prose answers we cannot verify text the same
 * way, so those are labelled as coming from the model rather than from the verified
 * knowledge base — the learner always knows which one is talking.
 *
 * Keys live in localStorage on the device. They are never sent anywhere except the
 * provider the user chose.
 */

import type { Circuit, GateName } from './ir';
import { ARITY, newId } from './ir';

export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'custom';

export interface Provider {
  id: ProviderId;
  label: string;
  /** Where to sign up, shown in the settings panel. */
  keyUrl: string;
  /** One line on what the free tier actually gives you. */
  freeNote: string;
  defaultModel: string;
  /** Suggested alternatives shown in the model dropdown. */
  models: string[];
  needsKey: boolean;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    freeNote: 'Free tier with a generous daily quota. Easiest to get — sign in with a Google account, click "Create API key", done. No card required.',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
    needsKey: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    freeNote: 'Free tier, extremely fast responses. Sign up, open API Keys, create one. Model names change often — the list below was verified against a live key, and /v1/models on your account is the authority.',
    defaultModel: 'qwen/qwen3.8-27b',
    // gpt-oss models spend tokens on a hidden reasoning pass before answering, so they
    // need the larger token budget this adapter already sends.
    models: ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound-mini'],
    needsKey: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    freeNote: 'Aggregates many models. Some carry a ":free" suffix and cost nothing, though they are rate limited and can be busy.',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    models: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-2-9b-it:free'],
    needsKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    keyUrl: 'https://ollama.com',
    freeNote: 'Runs entirely on your own machine, no key and no internet. Install Ollama, run "ollama pull llama3.2", and point this at http://localhost:11434. Desktop only — a phone cannot reach it unless it is on the same network.',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'phi3', 'qwen2.5'],
    needsKey: false,
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    keyUrl: '',
    freeNote: 'Any endpoint that speaks the OpenAI chat completions format. Enter the full URL ending in /v1/chat/completions.',
    defaultModel: 'gpt-4o-mini',
    models: [],
    needsKey: true,
  },
];

export interface LlmConfig {
  enabled: boolean;
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Only used by ollama and custom. */
  baseUrl: string;
}

export const DEFAULT_CONFIG: LlmConfig = {
  enabled: false,
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.0-flash',
  baseUrl: '',
};

const STORE_KEY = 'quantum-learning:llm';

/**
 * Build-time defaults from .env, so a demo build can ship with the model already wired.
 *
 * Vite inlines these into the client bundle, which means anyone holding the built app
 * or the APK can read the key. That is acceptable for a free-tier demo key you are
 * willing to rotate, and unacceptable for anything else — in which case leave
 * VITE_LLM_API_KEY empty and let each user enter their own in Settings.
 */
function envConfig(): Partial<LlmConfig> {
  const env = (import.meta as { env?: Record<string, string> }).env ?? {};
  const apiKey = env.VITE_LLM_API_KEY?.trim();
  if (!apiKey) return {};
  const provider = (env.VITE_LLM_PROVIDER?.trim() as ProviderId) || 'gemini';
  const known = PROVIDERS.find(p => p.id === provider);
  return {
    enabled: true,
    apiKey,
    provider: known ? provider : 'gemini',
    model: env.VITE_LLM_MODEL?.trim() || known?.defaultModel || DEFAULT_CONFIG.model,
    baseUrl: env.VITE_LLM_BASE_URL?.trim() || '',
  };
}

export function loadConfig(): LlmConfig {
  const fromEnv = envConfig();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    // A key the user entered themselves always wins over the build-time one.
    if (raw) return { ...DEFAULT_CONFIG, ...fromEnv, ...JSON.parse(raw) };
  } catch { /* storage unavailable; fall back to whatever the build carries */ }
  return { ...DEFAULT_CONFIG, ...fromEnv };
}

export function saveConfig(c: LlmConfig): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch { /* nothing to do */ }
}

export function isConfigured(c: LlmConfig): boolean {
  if (!c.enabled) return false;
  const p = PROVIDERS.find(x => x.id === c.provider);
  if (!p) return false;
  if (p.needsKey && !c.apiKey.trim()) return false;
  if ((c.provider === 'ollama' || c.provider === 'custom') && !c.baseUrl.trim()) return false;
  return true;
}

// ---------------------------------------------------------------- transport

const TIMEOUT_MS = 20_000;

interface CallResult { text: string; ms: number }

async function call(cfg: LlmConfig, system: string, user: string): Promise<CallResult> {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: unknown;

    if (cfg.provider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
      };
    } else if (cfg.provider === 'ollama') {
      url = `${cfg.baseUrl.replace(/\/$/, '')}/api/chat`;
      body = {
        model: cfg.model,
        stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      };
    } else {
      // Groq, OpenRouter and any custom endpoint all speak OpenAI chat completions.
      url =
        cfg.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions'
        : cfg.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions'
        : cfg.baseUrl.replace(/\/$/, '');
      headers = { ...headers, Authorization: `Bearer ${cfg.apiKey}` };
      body = {
        model: cfg.model,
        temperature: 0.3,
        max_tokens: 700,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      };
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(friendlyError(res.status, detail));
    }
    const json = await res.json();

    const text: string =
      cfg.provider === 'gemini'
        ? (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim()
        : cfg.provider === 'ollama'
          ? (json?.message?.content ?? '').trim()
          : (json?.choices?.[0]?.message?.content ?? '').trim();

    if (!text) throw new Error('The model returned an empty response.');
    return { text, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(status: number, detail: string): string {
  if (status === 401 || status === 403) return 'That API key was rejected. Check it in Settings.';
  if (status === 429) return 'Rate limit reached on the free tier. Wait a moment, or switch provider in Settings.';
  if (status === 404) return 'That model name was not found for this provider. Pick another in Settings.';
  if (status >= 500) return 'The provider is having trouble right now. The offline tutor still works.';
  return `Request failed (${status}). ${detail.slice(0, 120)}`;
}

// ---------------------------------------------------------------- prompts

const TUTOR_SYSTEM = `You are the tutor inside "Qurious", a hands-on quantum computing app for students in India.

Rules you must follow:
- Answer in plain, warm, direct language. Short sentences. No markdown headings, no bullet symbols, no LaTeX.
- Write so the answer can be read aloud by a text to speech voice. Say "ket zero" rather than "|0>".
- Be accurate about quantum mechanics. If you are not sure, say you are not sure.
- Never claim a circuit produces a state unless you are certain; the app verifies circuits itself.
- Keep answers under 120 words unless the learner asks for more detail.
- If the question is not about quantum computing or this app, answer it briefly and helpfully anyway.`;

const FIX_SYSTEM = `You repair quantum circuits. Reply with ONLY a JSON object, no prose and no code fences.

Format: {"ops":[{"name":"h","qubits":[0]},{"name":"cx","qubits":[0,1]}],"why":"one short sentence"}

Allowed gate names: i x y z h s sdg t tdg rx ry rz p cx cy cz swap ccx cswap measure barrier
Gates rx, ry, rz and p also take "params":[angleInRadians].
For cx, cy and cz, qubits are [control, target]. For ccx they are [control1, control2, target].
Return the COMPLETE corrected circuit, not just the changed gate.`;

// ---------------------------------------------------------------- public API

export interface LlmAnswer {
  text: string;
  ms: number;
  model: string;
}

/** Ask a free-form question. Context is prepended so answers stay relevant to the app. */
export async function askLlm(cfg: LlmConfig, question: string, context?: string): Promise<LlmAnswer> {
  if (!isConfigured(cfg)) throw new Error('No language model is configured.');
  const user = context ? `${context}\n\nLearner asks: ${question}` : question;
  const { text, ms } = await call(cfg, TUTOR_SYSTEM, user);
  return { text: stripFormatting(text), ms, model: cfg.model };
}

export interface LlmFix {
  circuit: Circuit;
  why: string;
  ms: number;
}

/**
 * Ask the model to repair a circuit.
 *
 * What comes back is a *candidate only*. The caller runs it on the simulator and
 * discards it if it does not produce the target — same gate the offline search goes
 * through. A wrong answer from the model never reaches the learner.
 */
export async function askLlmFix(
  cfg: LlmConfig,
  circuit: Circuit,
  targetDescription: string
): Promise<LlmFix> {
  if (!isConfigured(cfg)) throw new Error('No language model is configured.');

  const current = circuit.ops
    .map(o => `${o.name}(${o.qubits.join(',')}${o.params?.length ? `, ${o.params[0].toFixed(4)}` : ''})`)
    .join(' ') || '(empty)';

  const user =
    `Circuit has ${circuit.qubits} qubits.\n` +
    `Current gates in order: ${current}\n` +
    `The learner needs it to produce: ${targetDescription}\n` +
    `Return the corrected circuit as JSON.`;

  const { text, ms } = await call(cfg, FIX_SYSTEM, user);
  const parsed = parseFixJson(text, circuit.qubits);
  return { circuit: parsed.circuit, why: parsed.why, ms };
}

function parseFixJson(text: string, qubits: number): { circuit: Circuit; why: string } {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('The model did not return a circuit.');

  const obj = JSON.parse(cleaned.slice(start, end + 1)) as {
    ops?: { name?: string; qubits?: number[]; params?: number[] }[];
    why?: string;
  };
  if (!Array.isArray(obj.ops)) throw new Error('The model did not return a gate list.');

  let maxQubit = qubits - 1;
  const ops = obj.ops.flatMap(o => {
    const name = String(o.name ?? '').toLowerCase() as GateName;
    if (!(name in ARITY)) return [];
    const qs = (o.qubits ?? []).map(Number).filter(Number.isInteger);
    if (qs.length !== ARITY[name]) return [];
    if (qs.some(q => q < 0 || q > 31)) return [];
    maxQubit = Math.max(maxQubit, ...qs);
    const params = (o.params ?? []).map(Number).filter(Number.isFinite);
    return [{ id: newId(), name, qubits: qs, ...(params.length ? { params } : {}) }];
  });

  if (!ops.length) throw new Error('The model returned no usable gates.');

  return {
    circuit: { version: 1, name: 'AI suggestion', qubits: Math.max(qubits, maxQubit + 1), ops },
    why: String(obj.why ?? 'Suggested by the language model.').slice(0, 240),
  };
}

/** Strip markdown the model may add despite instructions, so speech reads cleanly. */
function stripFormatting(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Quick connectivity check for the settings panel. */
export async function testConnection(cfg: LlmConfig): Promise<{ ok: boolean; message: string; ms?: number }> {
  try {
    const r = await askLlm(cfg, 'Reply with exactly: ready');
    return { ok: true, message: `Connected. Model replied in ${r.ms} ms.`, ms: r.ms };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
