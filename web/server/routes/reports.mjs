import { Router } from 'express';
import { getReport, getApplication } from '../db.mjs';

const router = Router();

// GET /api/applications/:id/report
router.get('/:id/report', (req, res) => {
  const app = getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const report = getReport(app.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  res.json({
    application_id: app.id,
    company: app.company,
    role: app.role,
    content: report.content,
    created_at: report.created_at,
  });
});

export default router;
