import { Router } from 'express';
import { getApplication, getReport } from '../db.mjs';
import { getSetting } from '../db.mjs';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import OpenAI from 'openai';

const router = Router();
const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..', '..');

// POST /api/contacto/:applicationId — generates LinkedIn outreach messages
router.post('/:applicationId', async (req, res) => {
  const app = getApplication(req.params.applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const apiKey = getSetting('OPENAI_API_KEY');
  if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

  // Load CV and contacto mode
  const cvPath = resolve(CAREER_OPS_PATH, 'cv.md');
  const contactoPath = resolve(CAREER_OPS_PATH, 'modes', 'contacto.md');
  const cv = existsSync(cvPath) ? readFileSync(cvPath, 'utf-8') : '';
  const contacto = existsSync(contactoPath) ? readFileSync(contactoPath, 'utf-8') : '';

  // Get the report for this application
  const report = getReport(app.id);
  const reportText = report?.content || '';

  const client = new OpenAI({ apiKey });
  const { targetType } = req.body || {};

  const systemPrompt = `${contacto}\n\nIMPORTANT: Output in English. Return JSON only with this shape:
{
  "recruiter": { "message": "...", "notes": "..." },
  "peer": { "message": "...", "notes": "..." },
  "hiring_manager": { "message": "...", "notes": "..." }
}
Each message must be under 300 characters (LinkedIn connection request limit).`;

  const userPrompt = `Company: ${app.company}
Role: ${app.role}
Archetype: ${app.archetype || 'N/A'}
Score: ${app.score || 'N/A'}
TL;DR: ${app.tldr || 'N/A'}

CV:
${cv.substring(0, 3000)}

Evaluation report excerpt:
${reportText.substring(0, 2000)}

Generate 3 LinkedIn connection messages (recruiter, peer, hiring manager) using the rules in the system prompt.`;

  try {
    const response = await client.chat.completions.create({
      model: getSetting('AI_MODEL') || 'gpt-4o',
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const data = JSON.parse(response.choices[0].message.content);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
