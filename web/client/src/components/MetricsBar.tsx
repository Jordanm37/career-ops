import type { Metrics } from '../lib/api';

const STATUS_COLORS: Record<string, string> = {
  interview: 'text-ctp-green',
  offer: 'text-ctp-green',
  responded: 'text-ctp-blue',
  applied: 'text-ctp-sky',
  evaluated: 'text-ctp-text',
  skip: 'text-ctp-red',
  rejected: 'text-ctp-subtext0',
  discarded: 'text-ctp-subtext0',
};

const STATUS_ORDER = ['interview', 'offer', 'responded', 'applied', 'evaluated', 'skip', 'rejected', 'discarded'];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MetricsBar({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return null;

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-ctp-surface0 text-sm">
      {STATUS_ORDER.map((status) => {
        const count = metrics.byStatus[status];
        if (!count) return null;
        return (
          <span key={status} className={STATUS_COLORS[status] || 'text-ctp-text'}>
            {capitalize(status)}:{count}
          </span>
        );
      })}
    </div>
  );
}
