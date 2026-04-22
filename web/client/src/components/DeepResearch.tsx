import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';

interface Props {
  applicationId: number;
  company: string;
  role: string;
  onClose: () => void;
}

export default function DeepResearch({ applicationId, company, role, onClose }: Props) {
  const [content, setContent] = useState('');
  const [streaming, setStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      try {
        const res = await fetch(`/api/deep/${applicationId}`, {
          method: 'POST',
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `HTTP ${res.status}`);
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError('No response body');
          setStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'chunk' && event.content) {
                setContent(prev => prev + event.content);
              } else if (event.type === 'done') {
                setStreaming(false);
              } else if (event.type === 'error') {
                setError(event.error ?? 'Unknown error');
                setStreaming(false);
              }
            } catch {
              // malformed SSE line — skip
            }
          }
        }
        setStreaming(false);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Request failed');
        setStreaming(false);
      }
    }

    run();

    return () => {
      controller.abort();
    };
  }, [applicationId]);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (streaming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [content, streaming]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-4xl my-8 bg-ctp-mantle border border-ctp-surface1 rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 rounded-t-xl flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ctp-text truncate">
              Deep Research — {company}
            </h2>
            <p className="text-xs text-ctp-subtext0 truncate">{role}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!streaming && content && (
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-ctp-surface1 text-ctp-text text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-ctp-overlay0 hover:text-ctp-text transition-colors text-xl leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: '75vh' }}>
          {error && (
            <div className="bg-ctp-red/10 border border-ctp-red/30 rounded-lg p-4 text-sm text-ctp-red">
              {error}
            </div>
          )}

          {!error && !content && streaming && (
            <p className="text-ctp-subtext0 text-sm animate-pulse">
              Researching {company}…
            </p>
          )}

          {content && (
            <div className="report-content prose-deep">
              <Markdown>{content}</Markdown>
            </div>
          )}

          {streaming && content && (
            <div className="mt-4 flex items-center gap-2 text-xs text-ctp-subtext0">
              <span className="inline-block w-2 h-2 rounded-full bg-ctp-blue animate-pulse" />
              Generating…
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-ctp-surface1 rounded-b-xl flex items-center justify-between">
          <span className="text-xs text-ctp-overlay0">
            {streaming ? 'Streaming…' : error ? 'Failed' : 'Complete'}
          </span>
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
