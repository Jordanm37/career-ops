import { Router } from 'express';
import {
  listApplications,
  getApplication,
  updateApplicationStatus,
  updateApplicationNotes,
  getMetrics,
  normalizeStatus,
} from '../db.mjs';

const router = Router();

// GET /api/applications?filter=evaluated&sort=score&order=desc
router.get('/', (req, res) => {
  const { filter, sort, order } = req.query;
  const apps = listApplications({ filter, sort, order });
  // Add normalized status for frontend
  const result = apps.map(a => ({
    ...a,
    status_normalized: normalizeStatus(a.status),
  }));
  res.json(result);
});

// GET /api/metrics
router.get('/metrics', (req, res) => {
  const metrics = getMetrics();
  res.json(metrics);
});

// GET /api/applications/:id
router.get('/:id', (req, res) => {
  const app = getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Not found' });
  res.json({ ...app, status_normalized: normalizeStatus(app.status) });
});

// PATCH /api/applications/:id
router.patch('/:id', (req, res) => {
  const { status, notes } = req.body;
  const app = getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Not found' });

  if (status) updateApplicationStatus(app.id, status);
  if (notes !== undefined) updateApplicationNotes(app.id, notes);

  const updated = getApplication(req.params.id);
  res.json({ ...updated, status_normalized: normalizeStatus(updated.status) });
});

export default router;
