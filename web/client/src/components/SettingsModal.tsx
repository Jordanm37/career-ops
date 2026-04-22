import { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
}

interface SettingStatus {
  set: boolean;
  source: 'db' | 'env' | 'none';
  masked: string | null;
}

interface SettingsData {
  [key: string]: SettingStatus;
}

const SETTING_DEFS = [
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    description: 'Required for AI job evaluation and CV parsing. Get one at https://platform.openai.com/api-keys',
    secret: true,
  },
  {
    key: 'ADZUNA_APP_ID',
    label: 'Adzuna App ID',
    description: 'For real job search results (Level 3 scanner). Free tier at https://developer.adzuna.com/',
    secret: true,
  },
  {
    key: 'ADZUNA_APP_KEY',
    label: 'Adzuna API Key',
    description: 'Paired with App ID above. Free tier: 25 requests/day.',
    secret: true,
  },
  {
    key: 'AI_MODEL',
    label: 'OpenAI Model',
    description: "Default: gpt-4o. Set to 'gpt-4o-mini' for cheaper evaluations.",
    secret: false,
  },
] as const;

type SettingKey = typeof SETTING_DEFS[number]['key'];

export default function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<SettingsData>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [loading, setLoading] = useState(true);

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data: SettingsData = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function setMessage(key: string, text: string, ok: boolean) {
    setMessages(prev => ({ ...prev, [key]: { text, ok } }));
    setTimeout(() => setMessages(prev => { const next = { ...prev }; delete next[key]; return next; }), 3000);
  }

  async function handleSave(key: SettingKey) {
    const value = inputs[key]?.trim();
    if (!value) {
      setMessage(key, 'Enter a value first', false);
      return;
    }
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setMessage(key, 'Saved', true);
        setInputs(prev => ({ ...prev, [key]: '' }));
        await loadSettings();
      } else {
        const data = await res.json();
        setMessage(key, data.error || 'Save failed', false);
      }
    } catch {
      setMessage(key, 'Network error', false);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  async function handleDelete(key: SettingKey) {
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/settings/${key}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage(key, 'Removed', true);
        await loadSettings();
      } else {
        const data = await res.json();
        setMessage(key, data.error || 'Delete failed', false);
      }
    } catch {
      setMessage(key, 'Network error', false);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-ctp-base border border-ctp-surface2 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ctp-surface1">
          <h2 className="text-base font-semibold text-ctp-text">Settings</h2>
          <button
            onClick={onClose}
            className="text-ctp-overlay0 hover:text-ctp-text transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Info banner */}
          <div className="bg-ctp-surface0 border border-ctp-surface1 rounded-lg p-3 text-xs text-ctp-subtext1 leading-relaxed">
            These settings let you configure API keys for AI evaluation and job search.
            Keys are stored in SQLite on the server (not sent to any third party).
            If both an env var and a saved key exist, the saved key wins.
          </div>

          {loading ? (
            <p className="text-ctp-subtext0 text-sm animate-pulse text-center py-4">Loading…</p>
          ) : (
            SETTING_DEFS.map(def => {
              const status = settings[def.key];
              const isSaving = saving[def.key];
              const msg = messages[def.key];
              const isSet = status?.set;
              const sourceLabel = status?.source === 'db' ? 'saved' : status?.source === 'env' ? 'env var' : null;

              return (
                <div key={def.key} className="border border-ctp-surface1 rounded-lg p-4 space-y-3">
                  {/* Label + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ctp-text">{def.label}</span>
                    {isSet ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-ctp-green/20 text-ctp-green font-medium">
                        Set
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-ctp-surface1 text-ctp-overlay0">
                        Not set
                      </span>
                    )}
                    {sourceLabel && (
                      <span className="text-xs text-ctp-overlay0">({sourceLabel})</span>
                    )}
                    {isSet && status?.masked && (
                      <span className="text-xs text-ctp-overlay0 font-mono">{status.masked}</span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-ctp-subtext0 leading-relaxed">{def.description}</p>

                  {/* Input row */}
                  <div className="flex gap-2">
                    <input
                      type={def.secret ? 'password' : 'text'}
                      placeholder={isSet ? 'Enter new value to update…' : `Enter ${def.label}…`}
                      value={inputs[def.key] || ''}
                      onChange={e => setInputs(prev => ({ ...prev, [def.key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(def.key); }}
                      className="flex-1 bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue"
                      disabled={isSaving}
                    />
                    <button
                      onClick={() => handleSave(def.key)}
                      disabled={isSaving || !inputs[def.key]?.trim()}
                      className="px-3 py-1.5 rounded-lg bg-ctp-blue text-ctp-crust text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      Save
                    </button>
                    {isSet && status?.source === 'db' && (
                      <button
                        onClick={() => handleDelete(def.key)}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded-lg bg-ctp-surface1 text-ctp-red text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Feedback message */}
                  {msg && (
                    <p className={`text-xs ${msg.ok ? 'text-ctp-green' : 'text-ctp-red'}`}>
                      {msg.text}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ctp-surface1 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-ctp-surface1 text-ctp-text text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
