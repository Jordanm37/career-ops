import { Router } from 'express';
import { getApplication, getSetting } from '../db.mjs';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import OpenAI from 'openai';

const router = Router();
const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..', '..');

// POST /api/deep/:applicationId — runs deep company research
router.post('/:applicationId', async (req, res) => {
  const app = getApplication(req.params.applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const apiKey = getSetting('OPENAI_API_KEY');
  if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

  const deepPath = resolve(CAREER_OPS_PATH, 'modes', 'deep.md');
  const cvPath = resolve(CAREER_OPS_PATH, 'cv.md');
  const deepMode = existsSync(deepPath) ? readFileSync(deepPath, 'utf-8') : '';
  const cv = existsSync(cvPath) ? readFileSync(cvPath, 'utf-8') : '';

  const client = new OpenAI({ apiKey });

  // Set up SSE for streaming
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const systemContent = [
    deepMode,
    '',
    'IMPORTANT: Output in English. Be factual, concise, and grounded in real information.',
  ]
    .filter(Boolean)
    .join('\n');

  const userContent = `Research company "${app.company}" for someone applying to the role "${app.role}".

Candidate CV excerpt:
${cv.substring(0, 2000)}

Produce a deep research report covering:
1. AI strategy and product direction
2. Recent engineering moves (last 6 months): hires, releases, funding, acquisitions
3. Engineering culture signals (blogs, talks, principles)
4. Likely challenges the candidate would face in the role
5. Top competitors and differentiation
6. Candidate angle — where they should position themselves
7. 5 smart questions for the interview

Format as clean markdown with sections. Be factual and concise.`;

  // Try with web_search_preview tool first; fall back to plain streaming if unsupported
  try {
    let stream;
    try {
      stream = await client.chat.completions.create({
        model: getSetting('AI_MODEL') || 'gpt-4o',
        stream: true,
        tools: [{ type: 'web_search_preview' }],
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
      });
    } catch (toolErr) {
      // web_search_preview not supported by this model/account — retry without tools
      if (toolErr.status === 400 || toolErr.code === 'unknown_parameter' || /tool/i.test(toolErr.message)) {
        stream = await client.chat.completions.create({
          model: getSetting('AI_MODEL') || 'gpt-4o',
          stream: true,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
          ],
        });
      } else {
        throw toolErr;
      }
    }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Deep research error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

export default router;
