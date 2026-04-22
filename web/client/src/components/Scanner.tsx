import { useState, useEffect, useRef, useCallback } from 'react';

interface ScannerProps {
  onClose: () => void;
}

interface DiscoveredJob {
  id: number;
  url: string;
  title: string;
  company: string;
  portal: string;
  source: string;
  seniority_boost: number;
  status: string;
  discovered_at: string;
}

interface ScanStats {
  level1: number;
  level2: number;
  discovered: number;
  filtered: number;
  duplicates: number;
}

interface PortalInfo {
  companies: { name: string; careers_url: string; hasApi: boolean; scanMethod: string }[];
  titleFilter: { positive: string[]; negative: string[]; seniority_boost: string[] };
  queryCount: number;
  profileMerged: boolean;
}

const EMPTY_STATS: ScanStats = {
  level1: 0,
  level2: 0,
  discovered: 0,
  filtered: 0,
  duplicates: 0,
};

export default function Scanner({ onClose }: ScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<ScanStats>(EMPTY_STATS);
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [portals, setPortals] = useState<PortalInfo | null>(null);
  const [portalsOpen, setPortalsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = useState<Set<number>>(new Set());

  const logsEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const loadDiscovered = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/discovered?status=new');
      if (res.ok) {
        const data: DiscoveredJob[] = await res.json();
        setJobs(data);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const loadPortals = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/portals');
      if (res.ok) {
        const data: PortalInfo = await res.json();
        setPortals(data);
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadDiscovered();
    loadPortals();
  }, [loadDiscovered, loadPortals]);

  async function handleStartScan() {
    setError(null);
    setLogs([]);
    setStats(EMPTY_STATS);
    setScanDone(false);

    try {
      const startRes = await fetch('/api/scan/start', { method: 'POST' });
      if (!startRes.ok) {
        const body = await startRes.json().catch(() => ({}));
        setError(body.message || 'Failed to start scan');
        return;
      }

      setScanning(true);

      const es = new EventSource('/api/scan/status');
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'log' && data.text) {
            setLogs((prev) => [...prev, data.text]);
          }

          if (data.stats) {
            setStats((prev) => ({ ...prev, ...data.stats }));
          }

          if (data.status === 'done' || data.type === 'done') {
            es.close();
            esRef.current = null;
            setScanning(false);
            setScanDone(true);
            loadDiscovered();
          }

          if (data.status === 'error' || data.type === 'error') {
            es.close();
            esRef.current = null;
            setScanning(false);
            setError(data.text || 'Scan encountered an error');
          }
        } catch {
          // malformed event, skip
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setScanning(false);
        setError('Connection to scanner lost');
      };
    } catch (err) {
      setScanning(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function handleCancel() {
    esRef.current?.close();
    esRef.current = null;

    try {
      await fetch('/api/scan/cancel', { method: 'POST' });
    } catch {
      // best-effort
    }

    setScanning(false);
    setLogs((prev) => [...prev, '— Scan cancelled by user —']);
  }

  async function handleDismiss(id: number) {
    try {
      const res = await fetch(`/api/scan/discovered/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (res.ok) {
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: 'dismissed' } : j))
        );
      }
    } catch {
      // non-fatal
    }
  }

  async function handleEvaluate(id: number) {
    setEvaluatingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/evaluate/from-discovered/${id}`, { method: 'POST' });
      if (res.ok) {
        // Drain the SSE stream to completion
        const reader = res.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: 'evaluated' } : j))
        );
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Evaluation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setEvaluatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const isRunning = scanning;
  const hasJobs = jobs.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[88vh] flex flex-col bg-ctp-mantle rounded-xl border border-ctp-surface1 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-ctp-blue">Job Scanner</h2>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-ctp-yellow">
                <span className="inline-block w-2 h-2 rounded-full bg-ctp-yellow animate-pulse" />
                Scanning…
              </span>
            )}
            {scanDone && !isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-ctp-green">
                <span className="inline-block w-2 h-2 rounded-full bg-ctp-green" />
                Scan complete
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-ctp-subtext0 hover:text-ctp-text text-xl px-2"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Scan controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartScan}
              disabled={isRunning}
              className="px-5 py-2 bg-ctp-blue text-ctp-crust font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              Start Scan
            </button>
            {isRunning && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-ctp-surface1 text-ctp-red border border-ctp-red/40 font-medium rounded-lg hover:bg-ctp-red/10 transition-colors text-sm"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-ctp-red/10 border border-ctp-red/30 rounded-lg px-4 py-3 text-sm text-ctp-red">
              {error}
            </div>
          )}

          {/* Progress area */}
          {(isRunning || logs.length > 0) && (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-5 gap-2">
                {(
                  [
                    { label: 'Level 1', value: stats.level1, color: 'text-ctp-blue' },
                    { label: 'Level 2', value: stats.level2, color: 'text-ctp-lavender' },
                    { label: 'Discovered', value: stats.discovered, color: 'text-ctp-green' },
                    { label: 'Filtered', value: stats.filtered, color: 'text-ctp-yellow' },
                    { label: 'Duplicates', value: stats.duplicates, color: 'text-ctp-overlay0' },
                  ] as const
                ).map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-2 text-center"
                  >
                    <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
                    <div className="text-xs text-ctp-subtext0 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* Log stream */}
              <div className="bg-ctp-crust border border-ctp-surface1 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs text-ctp-subtext0 space-y-0.5">
                {logs.length === 0 ? (
                  <span className="text-ctp-overlay0">Waiting for output…</span>
                ) : (
                  logs.map((line, i) => (
                    <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">
                      {line}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* Discovered jobs table */}
          {hasJobs && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-ctp-subtext1">
                Discovered Jobs
                <span className="ml-2 text-ctp-overlay0 font-normal">({jobs.length})</span>
              </h3>

              <div className="rounded-xl border border-ctp-surface1 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ctp-surface0 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">Company</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">Title</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">Source</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ctp-surface0">
                    {jobs.map((job) => (
                      <tr
                        key={job.id}
                        className="bg-ctp-mantle hover:bg-ctp-surface0 transition-colors"
                      >
                        {/* Company */}
                        <td className="px-4 py-3 text-ctp-text font-medium whitespace-nowrap">
                          {job.company}
                        </td>

                        {/* Title + seniority boost */}
                        <td className="px-4 py-3 text-ctp-subtext1 max-w-xs">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-ctp-blue hover:underline truncate"
                              title={job.title}
                            >
                              {job.title}
                            </a>
                            {job.seniority_boost > 0 && (
                              <span
                                className="text-ctp-yellow shrink-0"
                                title={`Seniority boost: +${job.seniority_boost}`}
                              >
                                ★
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Source badge */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              job.source.endsWith('_api')
                                ? 'text-ctp-green bg-ctp-green/10'
                                : job.source === 'playwright'
                                ? 'text-ctp-blue bg-ctp-blue/10'
                                : 'text-ctp-mauve bg-ctp-mauve/10'
                            }`}
                          >
                            {job.source.endsWith('_api') ? 'API' : job.source === 'playwright' ? 'Scrape' : 'Search'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {job.status === 'new' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEvaluate(job.id)}
                                disabled={evaluatingIds.has(job.id)}
                                className="px-3 py-1 bg-ctp-blue/15 text-ctp-blue border border-ctp-blue/30 text-xs font-medium rounded-md hover:bg-ctp-blue/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {evaluatingIds.has(job.id) ? 'Evaluating…' : 'Evaluate'}
                              </button>
                              <button
                                onClick={() => handleDismiss(job.id)}
                                disabled={evaluatingIds.has(job.id)}
                                className="px-3 py-1 bg-ctp-surface1 text-ctp-subtext0 border border-ctp-surface2 text-xs font-medium rounded-md hover:text-ctp-red hover:border-ctp-red/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Dismiss
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded ${
                                job.status === 'evaluated'
                                  ? 'bg-ctp-green/10 text-ctp-green'
                                  : 'bg-ctp-surface1 text-ctp-overlay0'
                              }`}
                            >
                              {job.status === 'evaluated' ? 'Evaluated' : 'Dismissed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Portal info — collapsible */}
          <div className="border border-ctp-surface1 rounded-lg overflow-hidden">
            <button
              onClick={() => setPortalsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-ctp-surface0 hover:bg-ctp-surface1 transition-colors text-left"
            >
              <span className="text-sm font-medium text-ctp-subtext1">Portal Configuration</span>
              <span className="text-ctp-overlay0 text-xs">{portalsOpen ? '▲' : '▼'}</span>
            </button>

            {portalsOpen && (
              <div className="px-4 py-3 bg-ctp-mantle space-y-1.5">
                {portals ? (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-ctp-subtext0">Companies configured</span>
                      <span className="text-ctp-text font-medium tabular-nums">{portals.companies.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-ctp-subtext0">Title filters</span>
                      <span className="text-ctp-text font-medium tabular-nums">
                        {portals.titleFilter.positive.length}+ / {portals.titleFilter.negative.length}−
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-ctp-subtext0">Search queries</span>
                      <span className="text-ctp-text font-medium tabular-nums">{portals.queryCount}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-ctp-subtext0">Profile keywords</span>
                      <span className={`font-medium ${portals.profileMerged ? 'text-ctp-green' : 'text-ctp-overlay0'}`}>
                        {portals.profileMerged ? 'Active' : 'No profile'}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-ctp-overlay0">No portal data available.</p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
