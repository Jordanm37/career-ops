import { useEffect, useState } from 'react';

interface SyncIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

interface SyncStatus {
  ok: boolean;
  hasCv: boolean;
  hasProfile: boolean;
  issues: SyncIssue[];
}

const SEVERITY_ORDER: SyncIssue['severity'][] = ['error', 'warning', 'info'];

function highestSeverity(issues: SyncIssue[]): SyncIssue['severity'] {
  for (const s of SEVERITY_ORDER) {
    if (issues.some((i) => i.severity === s)) return s;
  }
  return 'info';
}

const SEVERITY_STYLES: Record<SyncIssue['severity'], string> = {
  error: 'bg-ctp-red/10 border-ctp-red/30 text-ctp-red',
  warning: 'bg-ctp-yellow/10 border-ctp-yellow/30 text-ctp-yellow',
  info: 'bg-ctp-blue/10 border-ctp-blue/30 text-ctp-blue',
};

const SEVERITY_ICONS: Record<SyncIssue['severity'], string> = {
  error: '✖',
  warning: '⚠',
  info: 'ℹ',
};

const ISSUE_SEVERITY_COLOR: Record<SyncIssue['severity'], string> = {
  error: 'text-ctp-red',
  warning: 'text-ctp-yellow',
  info: 'text-ctp-blue',
};

export default function CvSyncBanner() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/cv-sync')
      .then((r) => r.json())
      .then((data: SyncStatus) => setStatus(data))
      .catch(() => {
        // Silently fail — don't block the UI if the endpoint is unavailable
      });
  }, []);

  if (!status || status.ok || dismissed) return null;

  const { issues } = status;
  const top = highestSeverity(issues);
  const bannerClass = SEVERITY_STYLES[top];
  const icon = SEVERITY_ICONS[top];

  return (
    <div className={`border-b px-4 py-2 text-sm ${bannerClass}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <span className="font-semibold shrink-0">{icon}</span>
          <span>
            {expanded
              ? 'CV sync issues — click to collapse'
              : `${issues.length} CV sync issue${issues.length !== 1 ? 's' : ''} — click to view`}
          </span>
          <span className="text-xs opacity-60">{expanded ? '▲' : '▼'}</span>
        </button>

        <button
          className="shrink-0 opacity-50 hover:opacity-90 transition-opacity px-1"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss CV sync banner"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <ul className="mt-2 ml-5 space-y-1 list-disc">
          {issues.map((issue, i) => (
            <li key={i} className={`opacity-90 ${ISSUE_SEVERITY_COLOR[issue.severity]}`}>
              <span className="text-xs font-medium uppercase mr-1 opacity-60">[{issue.severity}]</span>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
