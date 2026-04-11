import { useState, useRef, useEffect } from 'react';

const STATUS_OPTIONS = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];

const STATUS_COLORS: Record<string, string> = {
  evaluated: 'bg-ctp-surface1 text-ctp-text',
  applied: 'bg-ctp-sky/20 text-ctp-sky',
  responded: 'bg-ctp-blue/20 text-ctp-blue',
  interview: 'bg-ctp-green/20 text-ctp-green',
  offer: 'bg-ctp-green/20 text-ctp-green',
  rejected: 'bg-ctp-surface1 text-ctp-subtext0',
  discarded: 'bg-ctp-surface1 text-ctp-subtext0',
  skip: 'bg-ctp-red/20 text-ctp-red',
};

interface Props {
  current: string;
  normalized: string;
  onSelect: (status: string) => void;
}

export default function StatusPicker({ current, normalized, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const colorClass = STATUS_COLORS[normalized] || 'bg-ctp-surface1 text-ctp-text';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass} hover:opacity-80 transition-opacity`}
      >
        {current}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-ctp-surface0 border border-ctp-surface1 rounded-lg shadow-xl py-1 min-w-[140px]">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => { onSelect(opt); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-ctp-surface1 transition-colors ${
                opt === current ? 'text-ctp-blue font-medium' : 'text-ctp-text'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
