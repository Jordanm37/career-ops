import { useState, useCallback } from 'react';

interface Props {
  applicationId: number;
  company: string;
  role: string;
  onClose: () => void;
}

interface AnswerItem {
  question: string;
  answer: string;
  char_count: number;
  notes?: string;
}

type Tone = 'professional' | 'casual' | 'enthusiastic';

const TONES: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
];

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

function CharBadge({ count }: { count: number }) {
  const over = count > 1500;
  return (
    <span
      className={`text-xs tabular-nums font-mono ${over ? 'text-ctp-red font-semibold' : 'text-ctp-overlay0'}`}
    >
      {count} chars{over ? ' (long)' : ''}
    </span>
  );
}

function AnswerCard({
  item,
  index,
  applicationId,
  company,
  role,
  onRetone,
}: {
  item: AnswerItem;
  index: number;
  applicationId: number;
  company: string;
  role: string;
  onRetone: (index: number, updated: AnswerItem) => void;
}) {
  const [tone, setTone] = useState<Tone>('professional');
  const [retoning, setRetoning] = useState(false);
  const [retoneError, setRetoneError] = useState<string | null>(null);

  async function handleRetone(newTone: Tone) {
    setTone(newTone);
    if (newTone === 'professional' && item.answer) {
      // No need to fetch if switching back and already have original;
      // but we always hit the API to be consistent with multi-retone flows.
    }
    setRetoning(true);
    setRetoneError(null);
    try {
      const res = await fetch(`/api/apply/${applicationId}/retone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: item.question, answer: item.answer, tone: newTone }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      onRetone(index, {
        ...item,
        answer: data.answer ?? item.answer,
        char_count: data.char_count ?? data.answer?.length ?? item.char_count,
        notes: data.notes ?? item.notes,
      });
    } catch (err) {
      setRetoneError(err instanceof Error ? err.message : 'Retone failed');
    } finally {
      setRetoning(false);
    }
  }

  return (
    <div className="rounded-xl border border-ctp-surface1 bg-ctp-surface0 p-4 space-y-3">
      {/* Question */}
      <p className="text-sm font-semibold text-ctp-text leading-snug">
        <span className="text-ctp-overlay1 mr-1.5">{index + 1}.</span>
        {item.question}
      </p>

      {/* Answer body */}
      <div className="bg-ctp-mantle border border-ctp-surface1 rounded-lg px-3 py-2.5 text-sm text-ctp-text leading-relaxed whitespace-pre-wrap break-words min-h-[3rem]">
        {retoning ? (
          <span className="text-ctp-subtext0 animate-pulse">Rewriting…</span>
        ) : (
          item.answer
        )}
      </div>

      {retoneError && (
        <p className="text-xs text-ctp-red">{retoneError}</p>
      )}

      {/* Footer: char count + tone selector + copy */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CharBadge count={item.char_count} />

        <div className="flex items-center gap-2 ml-auto">
          {/* Tone dropdown */}
          <select
            value={tone}
            onChange={(e) => handleRetone(e.target.value as Tone)}
            disabled={retoning}
            className="text-xs bg-ctp-surface1 text-ctp-text border border-ctp-surface2 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ctp-blue disabled:opacity-50 disabled:cursor-not-allowed"
            title="Rewrite with different tone"
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <CopyButton text={item.answer} />
        </div>
      </div>

      {/* Notes */}
      {item.notes && (
        <p className="text-xs text-ctp-subtext0 leading-relaxed border-t border-ctp-surface1 pt-2">
          {item.notes}
        </p>
      )}
    </div>
  );
}

export default function ApplyAssistant({ applicationId, company, role, onClose }: Props) {
  const [questionsText, setQuestionsText] = useState('');
  const [additionalText, setAdditionalText] = useState('');
  const [answers, setAnswers] = useState<AnswerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdditional, setShowAdditional] = useState(false);

  const generate = useCallback(
    async (questionsToSend: string[]) => {
      if (!questionsToSend.length) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/apply/${applicationId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: questionsToSend }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${res.status})`);
        }
        const data = await res.json();
        const incoming: AnswerItem[] = (data.answers ?? []).map((a: AnswerItem) => ({
          ...a,
          char_count: a.char_count ?? a.answer?.length ?? 0,
        }));
        setAnswers((prev) => [...prev, ...incoming]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [applicationId],
  );

  function handleGenerate() {
    const questions = questionsText
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean);
    if (!questions.length) {
      setError('Paste at least one question.');
      return;
    }
    setAnswers([]);
    generate(questions);
  }

  function handleAddMore() {
    const extra = additionalText
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean);
    if (!extra.length) return;
    generate(extra);
    setAdditionalText('');
    setShowAdditional(false);
  }

  function handleRetone(index: number, updated: AnswerItem) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? updated : a)));
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-3xl my-8 bg-ctp-mantle border border-ctp-surface1 rounded-xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 rounded-t-xl flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ctp-green">Apply Assistant</h2>
            <p className="text-xs text-ctp-subtext0 truncate">
              {company} — {role}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ctp-overlay0 hover:text-ctp-text transition-colors text-xl leading-none px-1"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto" style={{ maxHeight: '80vh' }}>

          {/* Question input */}
          {answers.length === 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wide">
                Application questions
              </label>
              <textarea
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
                placeholder={"Paste each question on its own line, for example:\nWhy do you want to work here?\nDescribe a technical challenge you solved.\nWhat are your salary expectations?"}
                rows={7}
                className="w-full bg-ctp-base border border-ctp-surface1 rounded-lg px-3 py-2.5 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-green resize-y font-mono"
              />
              <p className="text-xs text-ctp-overlay0">One question per line. The AI will generate a tailored answer for each.</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-ctp-red/10 border border-ctp-red/30 rounded-lg px-4 py-3 text-sm text-ctp-red">
              {error}
            </div>
          )}

          {/* Loading spinner */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-2 border-ctp-surface1 border-t-ctp-green rounded-full animate-spin" />
              <p className="text-sm text-ctp-subtext0">Generating answers…</p>
            </div>
          )}

          {/* Answer cards */}
          {answers.length > 0 && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ctp-subtext0">
                  {answers.length} answer{answers.length !== 1 ? 's' : ''} generated
                </p>
                <button
                  onClick={() => { setAnswers([]); setError(null); }}
                  className="text-xs text-ctp-overlay0 hover:text-ctp-red transition-colors"
                >
                  Clear all
                </button>
              </div>

              {answers.map((item, i) => (
                <AnswerCard
                  key={i}
                  item={item}
                  index={i}
                  applicationId={applicationId}
                  company={company}
                  role={role}
                  onRetone={handleRetone}
                />
              ))}

              {/* Add more questions */}
              {showAdditional ? (
                <div className="space-y-2 pt-2 border-t border-ctp-surface1">
                  <label className="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wide">
                    Additional questions
                  </label>
                  <textarea
                    value={additionalText}
                    onChange={(e) => setAdditionalText(e.target.value)}
                    placeholder="One question per line…"
                    rows={4}
                    className="w-full bg-ctp-base border border-ctp-surface1 rounded-lg px-3 py-2.5 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-green resize-y font-mono"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddMore}
                      disabled={!additionalText.trim()}
                      className="px-4 py-1.5 bg-ctp-green text-ctp-crust text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Generate
                    </button>
                    <button
                      onClick={() => { setShowAdditional(false); setAdditionalText(''); }}
                      className="px-4 py-1.5 bg-ctp-surface1 text-ctp-text text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAdditional(true)}
                  className="w-full py-2 border border-dashed border-ctp-surface2 rounded-lg text-sm text-ctp-overlay0 hover:text-ctp-text hover:border-ctp-green transition-colors"
                >
                  + Add more questions
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-ctp-mantle border-t border-ctp-surface1 px-6 py-4 rounded-b-xl flex items-center justify-between gap-3">
          <span className="text-xs text-ctp-overlay0">
            {loading ? 'Generating…' : answers.length > 0 ? `${answers.length} answer${answers.length !== 1 ? 's' : ''}` : 'Paste questions above'}
          </span>
          <div className="flex gap-2">
            {answers.length > 0 && !loading && (
              <button
                onClick={handleGenerate}
                className="px-4 py-1.5 bg-ctp-surface1 text-ctp-text text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                Regenerate all
              </button>
            )}
            <button
              onClick={answers.length === 0 ? handleGenerate : onClose}
              disabled={loading}
              className="px-5 py-1.5 bg-ctp-green text-ctp-crust text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {answers.length === 0 ? 'Generate Answers' : 'Done'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
