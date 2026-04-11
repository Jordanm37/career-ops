#!/usr/bin/env node

/**
 * batch-openai.mjs — Batch evaluation using OpenAI API
 *
 * Replaces `claude -p` headless workers with direct OpenAI API calls.
 * Reads batch-input.tsv, evaluates each offer, generates reports + tracker TSVs.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node batch/batch-openai.mjs [--parallel=3] [--model=gpt-5]
 *
 * Requires: openai package (npm install openai)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import OpenAI from 'openai';

const PROJECT_DIR = resolve(import.meta.dirname, '..');
const BATCH_DIR = resolve(import.meta.dirname);

// Parse CLI args
const args = process.argv.slice(2);
const parallel = parseInt(args.find(a => a.startsWith('--parallel='))?.split('=')[1] || '3');
const model = args.find(a => a.startsWith('--model='))?.split('=')[1] || process.env.AI_MODEL || 'gpt-4o';

function loadFile(path) {
  if (existsSync(path)) return readFileSync(path, 'utf-8');
  return '';
}

async function evaluateOffer(client, { id, url, notes }, systemPrompt, cv, articleDigest) {
  const date = new Date().toISOString().split('T')[0];

  // Find next report number
  const reportsDir = join(PROJECT_DIR, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const existing = existsSync(reportsDir)
    ? readdirSync(reportsDir).filter(f => f.endsWith('.md'))
    : [];
  const maxNum = existing.reduce((max, f) => {
    const m = f.match(/^(\d+)/);
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, 0);
  const reportNum = String(maxNum + 1).padStart(3, '0');

  console.log(`[${id}] Evaluating: ${notes || url}`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            '## Candidate CV',
            cv,
            articleDigest ? `\n## Proof Points\n${articleDigest}` : '',
            '',
            '## Job Description to Evaluate',
            `URL: ${url}`,
            notes ? `Context: ${notes}` : '',
            '',
            'Generate a complete evaluation report in markdown format with blocks A-F.',
            'Include **Score:** X.X/5, **URL:**, **Archetype**, **TL;DR**, **Remote**, **Comp** fields.',
          ].join('\n'),
        },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;

    // Extract company/role from report
    const titleMatch = content.match(/^#\s*(?:Evaluation|Evaluaci[oó]n):\s*(.+?)\s*[-\u2014]\s*(.+)/m);
    const company = titleMatch ? titleMatch[1].trim() : 'Unknown';
    const role = titleMatch ? titleMatch[2].trim() : 'Unknown';
    const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Extract score
    const scoreMatch = content.match(/(\d+\.?\d*)\/5/);
    const score = scoreMatch ? scoreMatch[1] : '0.0';

    // Save report
    const reportFile = `${reportNum}-${companySlug}-${date}.md`;
    writeFileSync(join(reportsDir, reportFile), content);

    // Save tracker TSV
    const additionsDir = join(BATCH_DIR, 'tracker-additions');
    mkdirSync(additionsDir, { recursive: true });
    const tsvLine = [reportNum, date, company, role, 'Evaluated', `${score}/5`, '\u274C', `[${reportNum}](reports/${reportFile})`, 'batch-openai'].join('\t');
    writeFileSync(join(additionsDir, `${id}-${companySlug}.tsv`), tsvLine + '\n');

    console.log(`[${id}] Done: ${company} - ${role} (${score}/5) -> ${reportFile}`);
    return { id, success: true, reportFile, score };
  } catch (err) {
    console.error(`[${id}] Failed: ${err.message}`);
    return { id, success: false, error: err.message };
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Read batch input
  const inputPath = join(BATCH_DIR, 'batch-input.tsv');
  if (!existsSync(inputPath)) {
    console.error(`Error: ${inputPath} not found. Create it with columns: id, url, source, notes`);
    process.exit(1);
  }

  const lines = readFileSync(inputPath, 'utf-8').split('\n').filter(l => l.trim());
  const header = lines[0];
  const entries = lines.slice(1).map(line => {
    const [id, url, source, ...rest] = line.split('\t');
    return { id, url, notes: rest.join('\t') };
  }).filter(e => e.url);

  if (entries.length === 0) {
    console.log('No entries to process');
    return;
  }

  console.log(`Processing ${entries.length} offers with ${parallel} parallel workers using ${model}`);

  // Load prompts
  const shared = loadFile(join(PROJECT_DIR, 'modes', '_shared.md'));
  const oferta = loadFile(join(PROJECT_DIR, 'modes', 'oferta.md'));
  const profile = loadFile(join(PROJECT_DIR, 'modes', '_profile.md'));
  const systemPrompt = [
    'You are an AI job evaluation assistant.',
    shared, profile, oferta,
  ].join('\n\n');

  const cv = loadFile(join(PROJECT_DIR, 'cv.md'));
  const articleDigest = loadFile(join(PROJECT_DIR, 'article-digest.md'));

  const client = new OpenAI({ apiKey });

  // Process in parallel batches
  const results = [];
  for (let i = 0; i < entries.length; i += parallel) {
    const batch = entries.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map(entry => evaluateOffer(client, entry, systemPrompt, cv, articleDigest))
    );
    results.push(...batchResults);
  }

  // Summary
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`\nBatch complete: ${succeeded} succeeded, ${failed} failed`);

  if (succeeded > 0) {
    console.log('\nRun merge to update tracker:');
    console.log('  node merge-tracker.mjs');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
