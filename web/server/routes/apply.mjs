import { Router } from 'express';
import { getApplication, getReport, getSetting } from '../db.mjs';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import OpenAI from 'openai';

const router = Router();
const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..', '..');

// POST /api/apply/:applicationId — generates answers for application questions
// body: { questions: string[] } or { questions_text: string (newline-separated) }
router.post('/:applicationId', async (req, res) => {
  const app = getApplication(req.params.applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const apiKey = getSetting('OPENAI_API_KEY');
  if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

  // Accept questions as array or raw text
  let questions = req.body?.questions || [];
  if (!questions.length && req.body?.questions_text) {
    questions = req.body.questions_text.split('\n').map(q => q.trim()).filter(Boolean);
  }
  if (!questions.length) {
    return res.status(400).json({ error: 'questions array or questions_text required' });
  }

  const applyPath = resolve(CAREER_OPS_PATH, 'modes', 'apply.md');
  const cvPath = resolve(CAREER_OPS_PATH, 'cv.md');
  const applyMode = existsSync(applyPath) ? readFileSync(applyPath, 'utf-8') : '';
  const cv = existsSync(cvPath) ? readFileSync(cvPath, 'utf-8') : '';

  const report = getReport(app.id);
  const reportText = report?.content || '';

  const client = new OpenAI({ apiKey });

  const systemPrompt = `${applyMode}\n\nIMPORTANT: Output in English. Return JSON with shape:
{
  "answers": [
    { "question": "...", "answer": "...", "char_count": 123, "notes": "..." }
  ]
}
Each answer should be tailored to the role, draw on the CV and evaluation report, and be professional. Include suggested character count (most platforms cap at 1000-2000 chars).`;

  const userPrompt = `Company: ${app.company}
Role: ${app.role}
Archetype: ${app.archetype || 'N/A'}

CV:
${cv.substring(0, 3000)}

Evaluation report:
${reportText.substring(0, 3000)}

Application questions to answer:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Generate tailored answers for each question.`;

  try {
    const response = await client.chat.completions.create({
      model: getSetting('AI_MODEL') || 'gpt-4o',
      temperature: 0.3,
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

// POST /api/apply/:applicationId/retone — regenerate a single answer with a different tone
// body: { question: string, answer: string, tone: 'professional' | 'casual' | 'enthusiastic' }
router.post('/:applicationId/retone', async (req, res) => {
  const app = getApplication(req.params.applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const apiKey = getSetting('OPENAI_API_KEY');
  if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

  const { question, answer, tone } = req.body || {};
  if (!question || !answer || !tone) {
    return res.status(400).json({ error: 'question, answer, and tone are required' });
  }

  const validTones = ['professional', 'casual', 'enthusiastic'];
  if (!validTones.includes(tone)) {
    return res.status(400).json({ error: `tone must be one of: ${validTones.join(', ')}` });
  }

  const client = new OpenAI({ apiKey });

  const toneDescriptions = {
    professional: 'formal and polished, confident but measured, focused on impact and results',
    casual: 'conversational and warm, natural and approachable, first-person without jargon',
    enthusiastic: 'energetic and passionate, shows genuine excitement about the role and company',
  };

  try {
    const response = await client.chat.completions.create({
      model: getSetting('AI_MODEL') || 'gpt-4o',
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a professional job application writer. Rewrite application answers to match a requested tone while preserving all key content and specific details. Output JSON with shape: { "answer": "...", "char_count": 123, "notes": "..." }`,
        },
        {
          role: 'user',
          content: `Company: ${app.company}
Role: ${app.role}

Question: ${question}

Original answer:
${answer}

Rewrite this answer with a ${tone} tone: ${toneDescriptions[tone]}.
Keep all specific achievements, metrics, and key points intact. Match approximate length.`,
        },
      ],
    });
    const data = JSON.parse(response.choices[0].message.content);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
