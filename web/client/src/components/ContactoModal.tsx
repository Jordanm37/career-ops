import { useState, useEffect, useCallback } from 'react';

interface Props {
  applicationId: number;
  company: string;
  role: string;
  onClose: () => void;
}

interface MessageEntry {
  message: string;
  notes: string;
}

interface ContactoResult {
  recruiter: MessageEntry;
  peer: MessageEntry;
  hiring_manager: MessageEntry;
}

const CARDS: { key: keyof ContactoResult; label: string; color: string }[] = [
  { key: 'recruiter', label: 'Recruiter', color: 'text-ctp-blue' },
  { key: 'peer', label: 'Peer', color: 'text-ctp-mauve' },
  { key: 'hiring_manager', label: 'Hiring Manager', color: 'text-ctp-green' },
];

function CharCount({ count }: { count: number }) {
  const over = count > 280;
  return (
    <span className={`text-xs tabular-nums font-mono ${over ? 'text-ctp-red font-semibold' : 'text-ctp-overlay0'}`}>
      {count}/300
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1 bg-ctp-blue text-ctp-crust text-xs font-medium rounded-md hover:opacity-90 transition-opacity shrink-0"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function MessageCard({ label, color, entry }: { label: string; color: string; entry: MessageEntry }) {
  const charCount = entry.message.length;

  return (
    <div className="rounded-xl border border-ctp-surface1 bg-ctp-surface0 p-4 space-y-3">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${color}`}>{label}</span>
      </div>

      {/* Message box */}
      <div className="relative">
        <div className="bg-ctp-mantle border border-ctp-surface1 rounded-lg px-3 py-2.5 font-mono text-sm text-ctp-text leading-relaxed whitespace-pre-wrap break-words min-h-[3.5rem]">
          {entry.message}
        </div>
        {/* Footer row: char count + copy */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <CharCount count={charCount} />
            <CopyButton text={entry.message} />
          </div>
        </div>
      </div>

      {/* Notes hint */}
      {entry.notes && (
        <p className="text-xs text-ctp-subtext0 leading-relaxed border-t border-ctp-surface1 pt-2">
          {entry.notes}
        </p>
      )}
    </div>
  );
}

export default function ContactoModal({ applicationId, company, role, onClose }: Props) {
  const [result, setResult] = useState<ContactoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/contacto/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: ContactoResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  // Generate on mount
  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-ctp-mantle rounded-xl border border-ctp-surface1 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-ctp-blue">LinkedIn Outreach</h2>
            <p className="text-xs text-ctp-subtext0 mt-0.5">
              {company} — {role}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ctp-subtext0 hover:text-ctp-text text-xl px-2"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-ctp-surface1 border-t-ctp-blue rounded-full animate-spin" />
              <p className="text-sm text-ctp-subtext0">Generating messages…</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="bg-ctp-red/10 border border-ctp-red/30 rounded-lg px-4 py-3 text-sm text-ctp-red">
              {error}
            </div>
          )}

          {/* Message cards */}
          {result && !loading && (
            <>
              <p className="text-xs text-ctp-subtext0">
                Hook / Proof / Proposal — 3-sentence format, under 300 chars each.
              </p>
              {CARDS.map(({ key, label, color }) => (
                <MessageCard
                  key={key}
                  label={label}
                  color={color}
                  entry={result[key]}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-ctp-mantle border-t border-ctp-surface1 px-6 py-4 flex justify-end">
          <button
            onClick={generate}
            disabled={loading}
            className="px-5 py-2 bg-ctp-blue text-ctp-crust text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
      </div>
    </div>
  );
}
