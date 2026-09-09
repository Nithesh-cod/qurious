/**
 * Settings — where the API key goes.
 *
 * The key is stored in this browser only and sent nowhere except the provider the
 * learner picks. The app is fully usable with this left empty.
 */

import { useEffect, useState } from 'react';
import {
  PROVIDERS, saveConfig, testConnection, type LlmConfig, type ProviderId,
} from '../core/llm';
import { useSlideIn } from './useSlideIn';
import { analyticsEnabled, setAnalyticsEnabled, exportEvents, summarise, clearEvents } from '../core/analytics';

export function SettingsSheet({ config, onChange, onClose }: {
  config: LlmConfig;
  onChange: (c: LlmConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LlmConfig>(config);
  const slide = useSlideIn();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const provider = PROVIDERS.find(p => p.id === draft.provider)!;

  const set = (patch: Partial<LlmConfig>) => {
    setDraft(d => ({ ...d, ...patch }));
    setResult(null);
  };

  const pickProvider = (id: ProviderId) => {
    const p = PROVIDERS.find(x => x.id === id)!;
    set({
      provider: id,
      model: p.defaultModel,
      baseUrl: id === 'ollama' ? 'http://localhost:11434' : '',
    });
  };

  const apply = () => {
    saveConfig(draft);
    onChange(draft);
    onClose();
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    setResult(await testConnection(draft));
    setTesting(false);
  };

  return (
    <>
      <div className={`sheet-backdrop ${slide}`} onClick={onClose} />
      <section className={`glass sheet settings-sheet ${slide}`} role="dialog" aria-label="Settings">
        <span className="sheet-grip" />
        <div className="sheet-head">
          <h3>AI tutor connection</h3>
          <div className="panel-tools">
            <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={apply}>Save</button>
          </div>
        </div>

        <div className="sheet-body settings-body">
          <p className="tiny dim">
            Everything in this app works without this. Connecting a model widens what the tutor can
            answer beyond its built-in quantum knowledge. Your key is stored on this device only.
          </p>

          <label className="setting-toggle">
            <input type="checkbox" checked={draft.enabled} onChange={e => set({ enabled: e.target.checked })} />
            <span>Use a language model when the built-in knowledge has no answer</span>
          </label>

          {draft.enabled && (
            <>
              <div className="setting-group">
                <span className="setting-label">Provider</span>
                <div className="provider-grid">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      className={`glass provider-card ${draft.provider === p.id ? 'picked' : ''}`}
                      onClick={() => pickProvider(p.id)}
                    >
                      <strong>{p.label}</strong>
                      {p.id === 'gemini' && <span className="chip chip-mint tiny">easiest free option</span>}
                      <span className="tiny dim">{p.freeNote}</span>
                    </button>
                  ))}
                </div>
              </div>

              {provider.keyUrl && (
                <p className="tiny">
                  Get a key here:{' '}
                  <a href={provider.keyUrl} target="_blank" rel="noreferrer">{provider.keyUrl}</a>
                </p>
              )}

              {provider.needsKey && (
                <div className="setting-group">
                  <span className="setting-label">API key</span>
                  <input
                    type="password" value={draft.apiKey} placeholder="paste your key here"
                    onChange={e => set({ apiKey: e.target.value.trim() })}
                    autoComplete="off" spellCheck={false}
                  />
                </div>
              )}

              {(draft.provider === 'ollama' || draft.provider === 'custom') && (
                <div className="setting-group">
                  <span className="setting-label">
                    {draft.provider === 'ollama' ? 'Ollama address' : 'Endpoint URL'}
                  </span>
                  <input
                    type="text" value={draft.baseUrl}
                    placeholder={draft.provider === 'ollama' ? 'http://localhost:11434' : 'https://…/v1/chat/completions'}
                    onChange={e => set({ baseUrl: e.target.value.trim() })}
                    spellCheck={false}
                  />
                </div>
              )}

              <div className="setting-group">
                <span className="setting-label">Model</span>
                <input
                  type="text" value={draft.model} onChange={e => set({ model: e.target.value.trim() })}
                  spellCheck={false} list="model-options"
                />
                <datalist id="model-options">
                  {provider.models.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>

              <div className="setting-actions">
                <button className="btn btn-sm" onClick={test} disabled={testing}>
                  {testing ? 'Testing…' : 'Test connection'}
                </button>
                {result && (
                  <span className={`tiny ${result.ok ? 'ok-text' : 'err-text'}`}>{result.message}</span>
                )}
              </div>

              <p className="tiny dim">
                The rule does not change with a model connected: any circuit fix it proposes is still
                run on the simulator before you see it, and discarded if it does not work. Prose answers
                are labelled as coming from the model, because text cannot be checked the same way.
              </p>
            </>
          )}

          <AnalyticsSection />
        </div>
      </section>
    </>
  );
}


/**
 * Opt-in study instrumentation.
 *
 * Off by default and stated plainly. Nothing is sent anywhere — there is no endpoint in
 * the analytics module at all, which a test enforces. The only way data leaves the device
 * is the learner pressing Download and handing the file over, so consent is an action
 * rather than a checkbox scrolled past.
 */
function AnalyticsSection() {
  const [on, setOn] = useState(() => analyticsEnabled());
  const [count, setCount] = useState(0);

  useEffect(() => { setCount(summarise().events); }, [on]);

  const download = () => {
    const blob = new Blob([exportEvents()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qurious-study-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-block">
      <h4 className="tiny">Help us test the app</h4>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={e => { setAnalyticsEnabled(e.target.checked); setOn(e.target.checked); }}
        />
        Record how I use the app, on this device only
      </label>
      <p className="tiny dim">
        Off unless you turn it on. It notes which lessons and challenges you open and finish,
        and how long they take — never anything you type. It is stored on this device and sent
        nowhere. Turning it off deletes what was collected.
      </p>
      {on && (
        <div className="settings-row">
          <span className="tiny dim">{count} event{count === 1 ? '' : 's'} recorded</span>
          <button className="btn btn-sm btn-ghost" onClick={download}>Download my data</button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => { clearEvents(); setCount(0); }}
          >
            Erase it
          </button>
        </div>
      )}
    </div>
  );
}
