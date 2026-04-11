import { useState } from 'react';

const sections = [
  {
    title: 'Evaluate a Job',
    text: 'Click "+ Evaluate" in the header, paste a job description or URL, and the AI will score it against your CV and profile. Results appear in the pipeline table.',
  },
  {
    title: 'Pipeline Table',
    text: 'All evaluated offers appear here. Click column headers to sort by Score, Date, Company, or Status. Click any row to open the full evaluation report.',
  },
  {
    title: 'Filter Tabs',
    text: 'Use the tabs above the table to filter by status — All, Evaluated, Applied, Interview, Top (score ≥ 4), or Skip.',
  },
  {
    title: 'Change Status',
    text: 'Each row has a status dropdown. Use it to track your progress: Evaluated → Applied → Interview → Offer → Accepted/Rejected.',
  },
  {
    title: 'Profile Setup',
    text: 'Click "Profile" in the header to set up or edit your candidate profile. This helps the AI tailor evaluations to your target roles, archetypes, and preferences.',
  },
  {
    title: 'Reports',
    text: 'Click any row to open a detailed report with archetype fit, compensation estimate, remote policy, TL;DR, and a full breakdown of the role.',
  },
];

export default function GuidePopup() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMinimized(false); }}
        className="fixed bottom-4 right-4 z-50 bg-ctp-blue text-ctp-crust w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-lg hover:opacity-90 transition-opacity"
        title="Help Guide"
      >
        ?
      </button>
    );
  }

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 bg-ctp-surface1 text-ctp-blue px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-lg hover:bg-ctp-surface2 transition-colors"
      >
        <span className="text-base font-bold">?</span>
        Guide
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-h-[70vh] bg-ctp-surface0 border border-ctp-surface2 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-ctp-surface1 shrink-0">
        <h3 className="text-sm font-bold text-ctp-blue">How to Use</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="text-ctp-overlay1 hover:text-ctp-text px-1.5 py-0.5 rounded text-base leading-none"
            title="Minimize"
          >
            −
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-ctp-overlay1 hover:text-ctp-red px-1.5 py-0.5 rounded text-base leading-none"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto p-4 space-y-3">
        {sections.map((s) => (
          <div key={s.title}>
            <h4 className="text-xs font-semibold text-ctp-lavender mb-1">{s.title}</h4>
            <p className="text-xs text-ctp-subtext0 leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
