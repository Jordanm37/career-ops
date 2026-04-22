import { Router } from 'express';
import {
  insertQueueUrl, listQueueUrls, getPendingQueueUrl,
  updateQueueStatus, deleteQueueUrl, clearQueueCompleted,
} from '../db.mjs';

const router = Router();

// GET /api/queue — list all queue items
router.get('/', (req, res) => {
  res.json(listQueueUrls());
});

// POST /api/queue — add URLs (body: { urls: string[] } or { url: string })
router.post('/', (req, res) => {
  const urls = req.body?.urls || (req.body?.url ? [req.body.url] : []);
  if (!urls.length) return res.status(400).json({ error: 'urls array required' });
  let added = 0;
  for (const url of urls) {
    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (!trimmed || !trimmed.startsWith('http')) continue;
    const result = insertQueueUrl(trimmed);
    if (result.changes > 0) added++;
  }
  res.json({ success: true, added, total: urls.length });
});

// DELETE /api/queue/clear/completed — clear all completed items (must be before /:id)
router.delete('/clear/completed', (req, res) => {
  clearQueueCompleted();
  res.json({ success: true });
});

// DELETE /api/queue/:id — remove an item
router.delete('/:id', (req, res) => {
  deleteQueueUrl(req.params.id);
  res.json({ success: true });
});

export default router;
