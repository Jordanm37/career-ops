import { Router } from 'express';
import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { insertApplication, insertReport, getDiscoveredJob, updateDiscoveredJobStatus } from '../db.mjs';

const router = Router();

const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..', '..');

function loadFileIfExists(path) {
  if (existsSync(path)) return readFileSync(path, 'utf-8');
  return '';
}

function buildSystemPrompt() {
  const shared = loadFileIfExists(resolve(CAREER_OPS_PATH, 'modes', '_shared.md'));
  const oferta = loadFileIfExists(resolve(CAREER_OPS_PATH, 'modes', 'oferta.md'));
  const profile = loadFileIfExists(resolve(CAREER_OPS_PATH, 'modes', '_profile.md'));

  return [
    'You are an AI job evaluation assistant. Evaluate job offers using a structured A-F scoring system.',
    'Output your evaluation as a markdown report.',
    '',
    '## Scoring & Archetype Context',
    shared,
    '',
    '## User Profile',
    profile,
    '',
    '## Evaluation Instructions',
    oferta,
    '\n\nIMPORTANT: Output the entire report in English — all headings, tables, bullet points, tracker notes, and status values MUST be in English regardless of any Spanish text in the instructions above.',
  ].join('\n');
}

function parseReportFields(content) {
  const result = { score: null, archetype: null, tldr: null, remote: null, comp_estimate: null };

  const scoreMatch = content.match(/\*\*Score:\*\*\s*(\d+\.?\d*)\/5/i) || content.match(/(\d+\.?\d*)\/5/);
  if (scoreMatch) result.score = parseFloat(scoreMatch[1]);

  const archetypeMatch = content.match(/\*\*Archetype[^*]*\*\*[:\s|]*(.+)/i) || content.match(/\*\*Arquetipo[^*]*\*\*[:\s|]*(.+)/i);
  if (archetypeMatch) result.archetype = archetypeMatch[1].replace(/\|/g, '').trim();

  const tldrMatch = content.match(/\*\*TL;DR[^*]*\*\*[:\s|]*(.+)/i);
  if (tldrMatch) result.tldr = tldrMatch[1].replace(/\|/g, '').trim();

  const remoteMatch = content.match(/\*\*Remote\*\*[:\s|]*(.+)/i);
  if (remoteMatch) result.remote = remoteMatch[1].replace(/\|/g, '').trim();

  const compMatch = content.match(/\*\*Comp\*\*[:\s|]*(.+)/i);
  if (compMatch) result.comp_estimate = compMatch[1].replace(/\|/g, '').trim();

  // Try to extract company and role from report header
  const titleMatch = content.match(/^#\s*(?:Evaluation|Evaluaci[oó]n):\s*(.+?)\s*[-\u2014]\s*(.+)/m);
  if (titleMatch) {
    result.company = titleMatch[1].trim();
    result.role = titleMatch[2].trim();
  }

  return result;
}

// POST /api/evaluate
router.post('/', async (req, res) => {
  const { jd_text, jd_url, company, role } = req.body;

  if (!jd_text && !jd_url) {
    return res.status(400).json({ error: 'Provide jd_text or jd_url' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  try {
    const client = new OpenAI({ apiKey });
    const systemPrompt = buildSystemPrompt();
    const cv = loadFileIfExists(resolve(CAREER_OPS_PATH, 'cv.md'));
    const articleDigest = loadFileIfExists(resolve(CAREER_OPS_PATH, 'article-digest.md'));

    const userContent = [
      '## Candidate CV',
      cv,
      articleDigest ? `\n## Proof Points\n${articleDigest}` : '',
      '',
      '## Job Description to Evaluate',
      jd_url ? `URL: ${jd_url}\n` : '',
      jd_text || '(See URL above)',
      '',
      'Generate a complete evaluation report in markdown format with blocks A-F, a score out of 5, and all required fields.',
      `Company: ${company || '(detect from JD)'}`,
      `Role: ${role || '(detect from JD)'}`,
    ].join('\n');

    // Stream the response for real-time feedback
    const stream = await client.chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      stream: true,
    });

    // Set up SSE for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullContent = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
    }

    // Parse the completed report
    const fields = parseReportFields(fullContent);
    const today = new Date().toISOString().split('T')[0];

    const app = {
      date: today,
      company: company || fields.company || 'Unknown',
      role: role || fields.role || 'Unknown',
      score: fields.score,
      score_raw: fields.score ? `${fields.score}/5` : null,
      status: 'Evaluated',
      has_pdf: 0,
      report_path: null,
      notes: fields.tldr || '',
      job_url: jd_url || null,
      archetype: fields.archetype,
      tldr: fields.tldr,
      remote: fields.remote,
      comp_estimate: fields.comp_estimate,
    };

    const result = insertApplication(app);
    const appId = result.lastInsertRowid;
    insertReport(appId, fullContent);

    res.write(`data: ${JSON.stringify({ type: 'done', application_id: appId, ...fields })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Evaluation error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/evaluate/from-discovered/:id
// Fetches the discovered job by ID and runs it through the same evaluation flow.
router.post('/from-discovered/:id', async (req, res) => {
  const job = getDiscoveredJob(Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Discovered job not found' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  try {
    const client = new OpenAI({ apiKey });
    const systemPrompt = buildSystemPrompt();
    const cv = loadFileIfExists(resolve(CAREER_OPS_PATH, 'cv.md'));
    const articleDigest = loadFileIfExists(resolve(CAREER_OPS_PATH, 'article-digest.md'));

    const userContent = [
      '## Candidate CV',
      cv,
      articleDigest ? `\n## Proof Points\n${articleDigest}` : '',
      '',
      '## Job Description to Evaluate',
      `URL: ${job.url}\n`,
      '(See URL above)',
      '',
      'Generate a complete evaluation report in markdown format with blocks A-F, a score out of 5, and all required fields.',
      `Company: ${job.company}`,
      `Role: ${job.title}`,
    ].join('\n');

    const stream = await client.chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullContent = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
    }

    const fields = parseReportFields(fullContent);
    const today = new Date().toISOString().split('T')[0];

    const app = {
      date: today,
      company: job.company || fields.company || 'Unknown',
      role: job.title || fields.role || 'Unknown',
      score: fields.score,
      score_raw: fields.score ? `${fields.score}/5` : null,
      status: 'Evaluated',
      has_pdf: 0,
      report_path: null,
      notes: fields.tldr || '',
      job_url: job.url || null,
      archetype: fields.archetype,
      tldr: fields.tldr,
      remote: fields.remote,
      comp_estimate: fields.comp_estimate,
    };

    const result = insertApplication(app);
    const appId = result.lastInsertRowid;
    insertReport(appId, fullContent);

    updateDiscoveredJobStatus(job.id, 'evaluated');

    res.write(`data: ${JSON.stringify({ type: 'done', application_id: appId, ...fields })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Evaluation error (from-discovered):', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
