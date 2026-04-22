import { Router } from 'express';
import { startScan, getScanStatus, cancelScan } from '../scanner.mjs';
import { listDiscoveredJobs, updateDiscoveredJobStatus, getLatestScanRun } from '../db.mjs';
import { loadPortals } from '../portals.mjs';

const router = Router();

// POST /api/scan/start — trigger a new scan
router.post('/start', (req, res) => {
  const status = getScanStatus();
  if (status?.status === 'running') {
    return res.status(409).json({ error: 'Scan already running', scan: status });
  }

  const options = { categories: req.body?.categories };

  // Start scan in background, stream progress via SSE on /status
  startScan(options).catch(err => console.error('Scan error:', err));

  res.json({ message: 'Scan started', scanId: getScanStatus()?.id });
});

// GET /api/scan/status — SSE stream of scan progress
router.get('/status', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const status = getScanStatus();
  if (!status || status.status !== 'running') {
    // Send current state and close
    res.write(`data: ${JSON.stringify(status || { status: 'idle' })}\n\n`);
    res.end();
    return;
  }

  // Send existing progress
  for (const msg of status.progress) {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }

  // Poll for new progress
  let lastIndex = status.progress.length;
  const interval = setInterval(() => {
    const current = getScanStatus();
    if (!current) {
      clearInterval(interval);
      res.end();
      return;
    }

    // Send new messages
    while (lastIndex < current.progress.length) {
      res.write(`data: ${JSON.stringify(current.progress[lastIndex])}\n\n`);
      lastIndex++;
    }

    // Send stats update
    res.write(`data: ${JSON.stringify({ type: 'stats', stats: current.stats, status: current.status })}\n\n`);

    if (current.status !== 'running') {
      clearInterval(interval);
      res.write(`data: ${JSON.stringify({ type: 'done', stats: current.stats })}\n\n`);
      res.end();
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

// POST /api/scan/cancel — cancel running scan
router.post('/cancel', (req, res) => {
  cancelScan();
  res.json({ message: 'Scan cancelled' });
});

// GET /api/scan/discovered — list discovered jobs
router.get('/discovered', (req, res) => {
  const status = req.query.status || 'new';
  const jobs = listDiscoveredJobs(status);
  res.json(jobs);
});

// PATCH /api/scan/discovered/:id — update job status (queue or dismiss)
router.patch('/discovered/:id', (req, res) => {
  const { status } = req.body; // 'queued' or 'dismissed'
  if (!['queued', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "queued" or "dismissed"' });
  }
  updateDiscoveredJobStatus(req.params.id, status);
  res.json({ success: true });
});

// GET /api/scan/portals — list configured portals
router.get('/portals', (req, res) => {
  const { trackedCompanies, titleFilter, searchQueries, profileMerged, categories } = loadPortals();
  res.json({
    companies: trackedCompanies.map(c => ({
      name: c.name,
      careers_url: c.careers_url,
      hasApi: !!c.api,
      scanMethod: c.scan_method || (c.api ? 'greenhouse_api' : 'playwright'),
      category: c.category,
    })),
    titleFilter,
    queryCount: searchQueries.length,
    profileMerged,
    categories,
  });
});

// GET /api/scan/history — get latest scan run info
router.get('/history', (req, res) => {
  const run = getLatestScanRun();
  res.json(run || { status: 'never_run' });
});

export default router;
