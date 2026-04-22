import { useState, useEffect, useCallback } from 'react';
import { fetchApplications, fetchMetrics, fetchProfileStatus, type Application, type Metrics } from './lib/api';
import FilterTabs from './components/FilterTabs';
import MetricsBar from './components/MetricsBar';
import Pipeline from './components/Pipeline';
import ReportPreview from './components/ReportPreview';
import EvaluateForm from './components/EvaluateForm';
import ProfileSetup from './components/ProfileSetup';
import GuidePopup from './components/GuidePopup';
import Scanner from './components/Scanner';
import SettingsModal from './components/SettingsModal';
import UrlQueue from './components/UrlQueue';
import CvSyncBanner from './components/CvSyncBanner';

export default function App() {
  const [apps, setApps] = useState<Application[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('score');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [showEvaluate, setShowEvaluate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [appData, metricsData] = await Promise.all([
        fetchApplications({ filter, sort }),
        fetchMetrics(),
      ]);
      setApps(appData);
      setMetrics(metricsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, sort]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Check if profile exists on mount
  useEffect(() => {
    fetchProfileStatus().then(status => {
      setHasProfile(status.hasProfile);
      if (!status.hasProfile) setShowProfile(true);
    }).catch(() => setHasProfile(false));
  }, []);

  function handleFilterChange(newFilter: string) {
    setFilter(newFilter);
  }

  function handleSortChange(newSort: string) {
    setSort(newSort);
  }

  return (
    <div className="h-screen flex flex-col bg-ctp-base">
      <CvSyncBanner />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-ctp-surface0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-ctp-blue">CAREER PIPELINE</h1>
          <span className="text-sm text-ctp-subtext0">
            {metrics ? `${metrics.total} offers` : ''}
            {metrics?.avg_score ? ` | Avg ${metrics.avg_score.toFixed(1)}/5` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="bg-ctp-surface1 text-ctp-subtext1 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            title="Settings"
          >
            ⚙️
          </button>
          <button
            onClick={() => setShowProfile(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 ${
              hasProfile
                ? 'bg-ctp-surface1 text-ctp-subtext1'
                : 'bg-ctp-peach text-ctp-crust animate-pulse'
            }`}
          >
            {hasProfile ? 'Profile' : 'Setup Profile'}
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="bg-ctp-teal text-ctp-crust px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Scan Jobs
          </button>
          <button
            onClick={() => setShowQueue(true)}
            className="bg-ctp-mauve text-ctp-crust px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Queue
          </button>
          <button
            onClick={() => setShowEvaluate(true)}
            className="bg-ctp-blue text-ctp-crust px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Evaluate
          </button>
          <a
            href="https://github.com/santifer/career-ops"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ctp-overlay0 hover:text-ctp-text"
          >
            career-ops
          </a>
        </div>
      </header>

      {/* Metrics bar */}
      <MetricsBar metrics={metrics} />

      {/* Filter tabs */}
      <FilterTabs
        active={filter}
        counts={metrics?.byStatus || {}}
        total={metrics?.total || 0}
        onChange={handleFilterChange}
      />

      {/* Main content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-ctp-subtext0 animate-pulse">Loading pipeline...</p>
        </div>
      ) : (
        <Pipeline
          apps={apps}
          sortMode={sort}
          onSortChange={handleSortChange}
          onSelect={setSelectedApp}
          onUpdate={loadData}
        />
      )}

      {/* Footer */}
      <footer className="px-4 py-2 bg-ctp-surface0 text-xs text-ctp-overlay0 flex justify-between">
        <span>
          Click row for report | Status dropdown to change | + Evaluate to score a new JD
        </span>
        <span>career-ops by santifer.io</span>
      </footer>

      {/* Report slide-over */}
      {selectedApp && (
        <ReportPreview app={selectedApp} onClose={() => setSelectedApp(null)} />
      )}

      {/* Evaluate modal */}
      {showEvaluate && (
        <EvaluateForm
          onComplete={loadData}
          onClose={() => setShowEvaluate(false)}
        />
      )}

      {/* Profile setup modal */}
      {showProfile && (
        <ProfileSetup
          onComplete={() => { setShowProfile(false); setHasProfile(true); }}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Scanner modal */}
      {showScanner && (
        <Scanner onClose={() => setShowScanner(false)} />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* URL Queue modal */}
      {showQueue && (
        <UrlQueue onClose={() => setShowQueue(false)} onEvaluationComplete={loadData} />
      )}

      {/* Help guide */}
      <GuidePopup />
    </div>
  );
}
