import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { fetchReport, type Application, type Report } from '../lib/api';
import ContactoModal from './ContactoModal';
import DeepResearch from './DeepResearch';
import ApplyAssistant from './ApplyAssistant';

interface Props {
  app: Application;
  onClose: () => void;
}

export default function ReportPreview({ app, onClose }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showContacto, setShowContacto] = useState(false);
  const [showDeep, setShowDeep] = useState(false);
  const [showApply, setShowApply] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchReport(app.id)
      .then(setReport)
      .catch(() => setError('No report available'))
      .finally(() => setLoading(false));
  }, [app.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-3xl bg-ctp-mantle border-l border-ctp-surface1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ctp-text">{app.company}</h2>
            <p className="text-sm text-ctp-subtext0">{app.role}</p>
          </div>
          <div className="flex items-center gap-3">
            {app.job_url && (
              <a
                href={app.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-ctp-blue hover:underline"
              >
                Open Job URL
              </a>
            )}
            <button
              onClick={onClose}
              className="text-ctp-subtext0 hover:text-ctp-text text-xl leading-none px-2"
            >
              x
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 px-6 py-4">
          {app.score && (
            <div className="bg-ctp-surface0 rounded-lg p-3">
              <div className="text-xs text-ctp-subtext0">Score</div>
              <div className={`text-2xl font-bold ${scoreColor(app.score)}`}>
                {app.score.toFixed(1)}/5
              </div>
            </div>
          )}
          {app.archetype && (
            <div className="bg-ctp-surface0 rounded-lg p-3">
              <div className="text-xs text-ctp-subtext0">Archetype</div>
              <div className="text-sm text-ctp-mauve font-medium">{app.archetype}</div>
            </div>
          )}
          {app.comp_estimate && (
            <div className="bg-ctp-surface0 rounded-lg p-3">
              <div className="text-xs text-ctp-subtext0">Comp</div>
              <div className="text-sm text-ctp-yellow">{app.comp_estimate}</div>
            </div>
          )}
          {app.remote && (
            <div className="bg-ctp-surface0 rounded-lg p-3">
              <div className="text-xs text-ctp-subtext0">Remote</div>
              <div className="text-sm text-ctp-teal">{app.remote}</div>
            </div>
          )}
        </div>

        {app.tldr && (
          <div className="px-6 pb-3">
            <div className="text-xs text-ctp-subtext0 mb-1">TL;DR</div>
            <p className="text-sm text-ctp-subtext1">{app.tldr}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 px-6 pb-3">
          <button
            onClick={() => setShowContacto(true)}
            className="px-3 py-1.5 bg-ctp-blue/15 border border-ctp-blue/30 text-ctp-blue rounded-lg text-xs font-medium hover:bg-ctp-blue/25 transition-colors"
          >
            💬 LinkedIn Message
          </button>
          <button
            onClick={() => setShowDeep(true)}
            className="px-3 py-1.5 bg-ctp-mauve/15 border border-ctp-mauve/30 text-ctp-mauve rounded-lg text-xs font-medium hover:bg-ctp-mauve/25 transition-colors"
          >
            🔍 Deep Research
          </button>
          <button
            onClick={() => setShowApply(true)}
            className="px-3 py-1.5 bg-ctp-green/15 border border-ctp-green/30 text-ctp-green rounded-lg text-xs font-medium hover:bg-ctp-green/25 transition-colors"
          >
            ✍️ Answer Questions
          </button>
        </div>

        {/* Full report */}
        <div className="px-6 py-4 border-t border-ctp-surface0">
          {loading && <p className="text-ctp-subtext0 animate-pulse">Loading report...</p>}
          {error && <p className="text-ctp-subtext0">{error}</p>}
          {report && (
            <div className="report-content">
              <Markdown>{report.content}</Markdown>
            </div>
          )}
        </div>
      </div>

      {/* Action modals */}
      {showContacto && (
        <ContactoModal
          applicationId={app.id}
          company={app.company}
          role={app.role}
          onClose={() => setShowContacto(false)}
        />
      )}
      {showDeep && (
        <DeepResearch
          applicationId={app.id}
          company={app.company}
          role={app.role}
          onClose={() => setShowDeep(false)}
        />
      )}
      {showApply && (
        <ApplyAssistant
          applicationId={app.id}
          company={app.company}
          role={app.role}
          onClose={() => setShowApply(false)}
        />
      )}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 4.2) return 'text-ctp-green';
  if (score >= 3.8) return 'text-ctp-yellow';
  if (score >= 3.0) return 'text-ctp-text';
  return 'text-ctp-red';
}
