import { useState } from 'react';
import { updateApplication, type Application } from '../lib/api';
import StatusPicker from './StatusPicker';

interface Props {
  apps: Application[];
  sortMode: string;
  onSortChange: (sort: string) => void;
  onSelect: (app: Application) => void;
  onUpdate: () => void;
}

function scoreColor(score: number | null): string {
  if (!score) return 'text-ctp-subtext0';
  if (score >= 4.2) return 'text-ctp-green font-bold';
  if (score >= 3.8) return 'text-ctp-yellow';
  if (score >= 3.0) return 'text-ctp-text';
  return 'text-ctp-red';
}

const SORT_COLUMNS: Record<string, string> = {
  score: 'Score',
  date: 'Date',
  company: 'Company',
  status: 'Status',
};

export default function Pipeline({ apps, sortMode, onSortChange, onSelect, onUpdate }: Props) {
  const [grouped, setGrouped] = useState(true);

  async function handleStatusChange(app: Application, newStatus: string) {
    await updateApplication(app.id, { status: newStatus });
    onUpdate();
  }

  // Group apps by normalized status
  const statusOrder = ['interview', 'offer', 'responded', 'applied', 'evaluated', 'skip', 'rejected', 'discarded'];
  const groups = new Map<string, Application[]>();
  if (grouped) {
    for (const status of statusOrder) {
      const items = apps.filter((a) => a.status_normalized === status);
      if (items.length > 0) groups.set(status, items);
    }
    // Catch any status not in the order
    const knownStatuses = new Set(statusOrder);
    const other = apps.filter((a) => !knownStatuses.has(a.status_normalized));
    if (other.length > 0) groups.set('other', other);
  }

  function renderRow(app: Application) {
    return (
      <tr
        key={app.id}
        className="group hover:bg-ctp-surface0/50 cursor-pointer transition-colors border-b border-ctp-surface0/50"
        onClick={() => onSelect(app)}
      >
        <td className={`py-2.5 px-3 text-right tabular-nums ${scoreColor(app.score)}`}>
          {app.score ? app.score.toFixed(1) : '-'}
        </td>
        <td className="py-2.5 px-3 font-medium text-ctp-text max-w-[200px] truncate">
          {app.company}
        </td>
        <td className="py-2.5 px-3 text-ctp-subtext1 max-w-[300px] truncate">
          {app.role}
        </td>
        <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
          <StatusPicker
            current={app.status}
            normalized={app.status_normalized}
            onSelect={(s) => handleStatusChange(app, s)}
          />
        </td>
        <td className="py-2.5 px-3 text-ctp-yellow text-sm max-w-[150px] truncate">
          {app.comp_estimate || ''}
        </td>
        <td className="py-2.5 px-3 text-ctp-subtext0 text-sm">
          {app.date}
        </td>
        <td className="py-2.5 px-3 text-center">
          {app.job_url ? (
            <a
              href={app.job_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-ctp-blue hover:text-ctp-sky text-sm"
              title="Open job posting"
            >
              Link
            </a>
          ) : (
            <span className="text-ctp-surface2">-</span>
          )}
        </td>
      </tr>
    );
  }

  function renderSortHeader(column: string) {
    const isActive = sortMode === column;
    return (
      <button
        onClick={() => onSortChange(column)}
        className={`text-xs font-medium uppercase tracking-wide ${
          isActive ? 'text-ctp-blue' : 'text-ctp-subtext0 hover:text-ctp-text'
        }`}
      >
        {SORT_COLUMNS[column]}
        {isActive && ' \u25BC'}
      </button>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-ctp-subtext0">
        No offers match this filter
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-ctp-surface0/30 text-xs text-ctp-subtext0">
        <div className="flex items-center gap-4">
          <span>Sort: {renderSortHeader('score')} {renderSortHeader('date')} {renderSortHeader('company')} {renderSortHeader('status')}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGrouped(!grouped)}
            className="text-ctp-subtext0 hover:text-ctp-text"
          >
            View: {grouped ? 'Grouped' : 'Flat'}
          </button>
          <span>{apps.length} shown</span>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-ctp-subtext0 uppercase tracking-wide border-b border-ctp-surface1">
            <th className="py-2 px-3 w-16">Score</th>
            <th className="py-2 px-3">Company</th>
            <th className="py-2 px-3">Role</th>
            <th className="py-2 px-3 w-28">Status</th>
            <th className="py-2 px-3 w-36">Comp</th>
            <th className="py-2 px-3 w-28">Date</th>
            <th className="py-2 px-3 w-16 text-center">URL</th>
          </tr>
        </thead>
        <tbody>
          {grouped ? (
            Array.from(groups.entries()).map(([status, items]) => (
              <GroupSection key={status} status={status} items={items} renderRow={renderRow} />
            ))
          ) : (
            apps.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupSection({
  status,
  items,
  renderRow,
}: {
  status: string;
  items: Application[];
  renderRow: (app: Application) => React.ReactNode;
}) {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <>
      <tr>
        <td colSpan={7} className="px-3 pt-4 pb-1">
          <div className="flex items-center gap-2 text-xs font-bold text-ctp-subtext0 uppercase tracking-widest">
            <span className="flex-shrink-0">{capitalize(status)} ({items.length})</span>
            <div className="flex-1 border-t border-ctp-surface1" />
          </div>
        </td>
      </tr>
      {items.map(renderRow)}
    </>
  );
}
