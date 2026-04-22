import { useState } from 'react';

const sections = [
  {
    title: 'Scan for Jobs',
    text: 'Click "Scan Jobs" to discover open positions across 111+ companies in AI, Aerospace, Automotive, Robotics, Industrial, Medical, Hardware, Enterprise SaaS, and regional sets (Australia, Europe, DACH). The scanner uses Greenhouse/Ashby/Lever APIs for speed and falls back to Playwright + OpenAI web search for coverage.',
  },
  {
    title: 'Filter Scans by Category',
    text: 'In the Scanner, click category chips (AI, Aerospace, Robotics, Australia, etc.) to scan only those companies. No chips selected = scan everything. The count updates live so you know exactly how many companies will be checked.',
  },
  {
    title: 'Add Your Own Companies',
    text: 'Click "Manage Companies" in the Scanner to add any employer not in the default list. Provide name, careers URL, and category. Optionally add a Greenhouse API URL for direct JSON access. Your custom companies appear in category counts and get scanned alongside the defaults.',
  },
  {
    title: 'Profile-Driven Discovery',
    text: 'Your profile target roles (e.g. "Mechatronics Engineer") are automatically merged into title filters and used to generate web search queries, so jobs at companies NOT in the static list can still be discovered.',
  },
  {
    title: 'Evaluate Discovered Jobs',
    text: 'When a scan finds jobs, click "Evaluate" on any row to run a full AI evaluation against your CV and profile. The job moves into the main pipeline with a score, archetype fit, comp estimate, and detailed breakdown.',
  },
  {
    title: 'Evaluate a Job Manually',
    text: 'Click "+ Evaluate" in the header to paste any job description or URL. Same evaluation engine as the scanner flow — useful for jobs shared by a friend or spotted outside the tool.',
  },
  {
    title: 'Pipeline Table',
    text: 'All evaluated offers appear here. Click column headers to sort by Score, Date, Company, or Status. Click any row to open the full evaluation report.',
  },
  {
    title: 'Filter & Track',
    text: 'Filter tabs narrow by status (All, Evaluated, Applied, Interview, Top, Skip). Each row has a status dropdown to track progress: Evaluated → Applied → Interview → Offer.',
  },
  {
    title: 'Profile Setup',
    text: 'Click "Profile" in the header to set up or edit your candidate profile. It auto-fills from your CV using AI on first upload. Your profile shapes scoring, discovery queries, and title filters.',
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
