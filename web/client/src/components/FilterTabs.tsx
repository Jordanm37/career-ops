const TABS = [
  { filter: 'all', label: 'ALL' },
  { filter: 'evaluated', label: 'EVALUATED' },
  { filter: 'applied', label: 'APPLIED' },
  { filter: 'interview', label: 'INTERVIEW' },
  { filter: 'top', label: 'TOP \u22654' },
  { filter: 'skip', label: 'SKIP' },
];

interface Props {
  active: string;
  counts: Record<string, number>;
  total: number;
  onChange: (filter: string) => void;
}

export default function FilterTabs({ active, counts, total, onChange }: Props) {
  function getCount(filter: string) {
    if (filter === 'all') return total;
    if (filter === 'top') return undefined; // can't easily compute client-side
    return counts[filter] || 0;
  }

  return (
    <div className="flex border-b border-ctp-surface1">
      {TABS.map((tab) => {
        const isActive = active === tab.filter;
        const count = getCount(tab.filter);
        return (
          <button
            key={tab.filter}
            onClick={() => onChange(tab.filter)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              isActive
                ? 'text-ctp-blue border-ctp-blue'
                : 'text-ctp-subtext0 border-transparent hover:text-ctp-text hover:border-ctp-surface2'
            }`}
          >
            {tab.label}
            {count !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
