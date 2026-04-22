import { useState, useEffect, useCallback, useRef } from 'react';

interface QueueItem {
  id: number;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  company: string | null;
  role: string | null;
  application_id: number | null;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

interface Props {
  onClose: () => void;
  onEvaluationComplete?: () => void;
}

function StatusBadge({ status }: { status: QueueItem['status'] }) {
  const styles: Record<QueueItem['status'], string> = {
    pending: 'bg-ctp-surface1 text-ctp-subtext0',
    processing: 'bg-ctp-blue/20 text-ctp-blue animate-pulse',
    completed: 'bg-ctp-green/20 text-ctp-green',
    failed: 'bg-ctp-red/20 text-ctp-red',
  };
  const labels: Record<QueueItem['status'], string> = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function truncateUrl(url: string, max = 60): string {
  if (url.length <= max) return url;
  return url.slice(0, max) + '…';
}

export default function UrlQueue({ onClose, onEvaluationComplete }: Props) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processAll, setProcessAll] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const processAllRef = useRef(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      if (res.ok) setItems(await res.json());
    } catch {
      // silent — stale data is fine
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleAddUrls() {
    const lines = urlInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('http'));

    if (!lines.length) {
      setAddError('Paste at least one URL starting with http');
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add URLs');
      setUrlInput('');
      setLiveStatus(`Added ${data.added} of ${data.total} URL(s)`);
      await fetchItems();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/queue/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleClearCompleted() {
    await fetch('/api/queue/clear/completed', { method: 'DELETE' });
    await fetchItems();
  }

  async function processNextItem(): Promise<boolean> {
    setProcessing(true);
    setLiveStatus('Starting next evaluation…');

    return new Promise<boolean>((resolve) => {
      fetch('/api/evaluate/queue/next', { method: 'POST' })
        .then((res) => {
          // Not SSE — no pending items
          if (res.headers.get('content-type')?.includes('application/json')) {
            return res.json().then((data) => {
              setLiveStatus(data.message || 'No pending items');
              setProcessing(false);
              resolve(false);
            });
          }

          // SSE stream
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          async function pump() {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop()!;

              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === 'start') {
                    setLiveStatus(`Evaluating: ${truncateUrl(event.item?.url || '', 55)}`);
                    await fetchItems();
                  } else if (event.type === 'chunk') {
                    // ignore content chunks — just keep spinner
                  } else if (event.type === 'complete') {
                    const label = [event.company, event.role].filter(Boolean).join(' — ');
                    setLiveStatus(`Completed${label ? `: ${label}` : ''} (App #${event.applicationId})`);
                    onEvaluationComplete?.();
                    await fetchItems();
                    setProcessing(false);
                    resolve(true);
                    return;
                  } else if (event.type === 'error') {
                    setLiveStatus(`Error: ${event.error}`);
                    await fetchItems();
                    setProcessing(false);
                    resolve(false);
                    return;
                  }
                } catch {
                  // malformed SSE line — skip
                }
              }
            }
            setProcessing(false);
            resolve(false);
          }

          pump().catch((err) => {
            setLiveStatus(`Stream error: ${err.message}`);
            setProcessing(false);
            resolve(false);
          });
        })
        .catch((err) => {
          setLiveStatus(`Error: ${err.message}`);
          setProcessing(false);
          resolve(false);
        });
    });
  }

  async function handleProcessNext() {
    processAllRef.current = false;
    setProcessAll(false);
    await processNextItem();
  }

  async function handleProcessAll() {
    processAllRef.current = true;
    setProcessAll(true);
    let continued = true;
    while (processAllRef.current && continued) {
      continued = await processNextItem();
    }
    processAllRef.current = false;
    setProcessAll(false);
    if (!continued) setLiveStatus((prev) => prev || 'All done — queue is empty');
  }

  function handleStopAll() {
    processAllRef.current = false;
    setProcessAll(false);
    setLiveStatus('Stopped — will finish current item then halt');
  }

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const hasCompleted = items.some((i) => i.status === 'completed');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-ctp-mantle rounded-xl border border-ctp-surface1 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-ctp-blue">URL Queue</h2>
            <p className="text-xs text-ctp-subtext0 mt-0.5">
              Paste job URLs for sequential evaluation
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
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* URL input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ctp-subtext0">
              Paste URLs (one per line)
            </label>
            <textarea
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setAddError(null); }}
              placeholder={'https://jobs.example.com/role-1\nhttps://jobs.example.com/role-2'}
              rows={4}
              className="w-full bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-3 py-2 text-ctp-text text-sm placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue resize-y font-mono"
            />
            {addError && (
              <p className="text-xs text-ctp-red">{addError}</p>
            )}
            <button
              onClick={handleAddUrls}
              disabled={adding || !urlInput.trim()}
              className="px-4 py-2 bg-ctp-blue text-ctp-crust text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {adding ? 'Adding…' : 'Add URLs to Queue'}
            </button>
          </div>

          {/* Live status */}
          {liveStatus && (
            <div className="flex items-center gap-2 bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-4 py-2.5 text-sm">
              {processing && (
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-ctp-blue shrink-0 animate-pulse" />
              )}
              <span className="text-ctp-text">{liveStatus}</span>
            </div>
          )}

          {/* Queue table */}
          {items.length > 0 ? (
            <div className="rounded-xl border border-ctp-surface1 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-ctp-surface0 border-b border-ctp-surface1">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 w-[40%]">URL</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ctp-subtext0">Company</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ctp-subtext0">Role</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ctp-subtext0">Status</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ctp-surface1">
                  {items.map((item) => (
                    <tr key={item.id} className="bg-ctp-mantle hover:bg-ctp-surface0/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={item.url}
                          className="text-ctp-sapphire hover:underline font-mono text-xs break-all"
                        >
                          {truncateUrl(item.url, 55)}
                        </a>
                        {item.error && (
                          <p className="text-xs text-ctp-red mt-0.5 font-mono">{item.error}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-ctp-text text-xs">{item.company || '—'}</td>
                      <td className="px-4 py-2.5 text-ctp-text text-xs">{item.role || '—'}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={item.status === 'processing'}
                          title="Remove"
                          className="text-ctp-subtext0 hover:text-ctp-red transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-ctp-subtext0 text-sm">
              Queue is empty — paste some URLs above to get started
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-ctp-mantle border-t border-ctp-surface1 px-6 py-4 flex items-center gap-3 shrink-0">
          <button
            onClick={handleProcessNext}
            disabled={processing || pendingCount === 0}
            className="px-4 py-2 bg-ctp-sapphire text-ctp-crust text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Process Next
          </button>

          {processAll ? (
            <button
              onClick={handleStopAll}
              className="px-4 py-2 bg-ctp-red text-ctp-crust text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleProcessAll}
              disabled={processing || pendingCount === 0}
              className="px-4 py-2 bg-ctp-mauve text-ctp-crust text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Process All ({pendingCount})
            </button>
          )}

          {hasCompleted && (
            <button
              onClick={handleClearCompleted}
              disabled={processing}
              className="px-4 py-2 bg-ctp-surface1 text-ctp-subtext0 text-sm font-medium rounded-lg hover:bg-ctp-surface2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear Completed
            </button>
          )}

          <div className="flex-1" />

          <span className="text-xs text-ctp-overlay0">
            {items.length} item{items.length !== 1 ? 's' : ''} · {pendingCount} pending
          </span>
        </div>
      </div>
    </div>
  );
}
