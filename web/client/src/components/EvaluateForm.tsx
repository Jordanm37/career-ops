import { useState } from 'react';
import Markdown from 'react-markdown';
import { streamEvaluation } from '../lib/api';

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

export default function EvaluateForm({ onComplete, onClose }: Props) {
  const [jdText, setJdText] = useState('');
  const [jdUrl, setJdUrl] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jdText && !jdUrl) return;

    setLoading(true);
    setOutput('');
    setError(null);

    try {
      for await (const event of streamEvaluation({
        jd_text: jdText || undefined,
        jd_url: jdUrl || undefined,
        company: company || undefined,
        role: role || undefined,
      })) {
        if (event.type === 'chunk') {
          setOutput((prev) => prev + (event.content || ''));
        } else if (event.type === 'done') {
          onComplete();
        } else if (event.type === 'error') {
          setError(event.error || 'Evaluation failed');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-ctp-mantle rounded-xl border border-ctp-surface1 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-ctp-blue">Evaluate Job Offer</h2>
          <button onClick={onClose} className="text-ctp-subtext0 hover:text-ctp-text text-xl px-2">x</button>
        </div>

        <div className="p-6">
          {!output ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-ctp-subtext0 mb-1">Job URL (optional)</label>
                <input
                  type="url"
                  value={jdUrl}
                  onChange={(e) => setJdUrl(e.target.value)}
                  placeholder="https://jobs.example.com/..."
                  className="w-full bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-3 py-2 text-ctp-text placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue"
                />
              </div>

              <div>
                <label className="block text-sm text-ctp-subtext0 mb-1">Job Description</label>
                <textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste the full job description here..."
                  rows={10}
                  className="w-full bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-3 py-2 text-ctp-text placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-ctp-subtext0 mb-1">Company (optional)</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Auto-detected from JD"
                    className="w-full bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-3 py-2 text-ctp-text placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-ctp-subtext0 mb-1">Role (optional)</label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Auto-detected from JD"
                    className="w-full bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-3 py-2 text-ctp-text placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-ctp-red/10 border border-ctp-red/30 rounded-lg p-3 text-sm text-ctp-red">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (!jdText && !jdUrl)}
                className="w-full bg-ctp-blue text-ctp-crust font-medium py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'Evaluating...' : 'Evaluate'}
              </button>
            </form>
          ) : (
            <div>
              {loading && (
                <div className="mb-4 flex items-center gap-2 text-sm text-ctp-subtext0">
                  <span className="inline-block w-2 h-2 rounded-full bg-ctp-blue animate-pulse" />
                  Generating evaluation...
                </div>
              )}
              <div className="report-content">
                <Markdown>{output}</Markdown>
              </div>
              {error && (
                <div className="mt-4 bg-ctp-red/10 border border-ctp-red/30 rounded-lg p-3 text-sm text-ctp-red">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
