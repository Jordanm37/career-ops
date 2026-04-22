import { Router } from 'express';
import { getSetting, upsertSetting, deleteSetting, listSettings } from '../db.mjs';

const router = Router();

// Known/allowed setting keys for security (don't let users set arbitrary env vars)
const ALLOWED_KEYS = new Set([
  'OPENAI_API_KEY',
  'ADZUNA_APP_ID',
  'ADZUNA_APP_KEY',
  'AI_MODEL',
]);

function maskValue(value) {
  if (!value || value.length < 8) return '****';
  return '****' + value.slice(-4);
}

// GET /api/settings — returns status of each known key (masked)
router.get('/', (req, res) => {
  const rows = listSettings();
  const dbKeys = new Map(rows.map(r => [r.key, r.value]));

  const response = {};
  for (const key of ALLOWED_KEYS) {
    const dbValue = dbKeys.get(key);
    const envValue = process.env[key];
    response[key] = {
      set: !!(dbValue || envValue),
      source: dbValue ? 'db' : envValue ? 'env' : 'none',
      masked: dbValue ? maskValue(dbValue) : envValue ? maskValue(envValue) : null,
    };
  }
  res.json(response);
});

// POST /api/settings — { key, value }
router.post('/', (req, res) => {
  const { key, value } = req.body;
  if (!ALLOWED_KEYS.has(key)) {
    return res.status(400).json({ error: `Key "${key}" not allowed` });
  }
  if (!value || typeof value !== 'string') {
    return res.status(400).json({ error: 'Value is required' });
  }
  upsertSetting(key, value.trim());
  res.json({ success: true });
});

// DELETE /api/settings/:key
router.delete('/:key', (req, res) => {
  if (!ALLOWED_KEYS.has(req.params.key)) {
    return res.status(400).json({ error: 'Key not allowed' });
  }
  deleteSetting(req.params.key);
  res.json({ success: true });
});

export default router;
