#!/usr/bin/env node

/**
 * import.mjs — Import applications.md + reports/ into SQLite
 *
 * Ports the parsing logic from dashboard/internal/data/career.go
 *
 * Usage:
 *   node web/server/import.mjs [path-to-career-ops]
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { insertApplication, insertReport, checkDuplicate, db } from './db.mjs';

const careerOpsPath = process.argv[2] || resolve(import.meta.dirname, '..', '..');

// Regexes ported from Go
const reScoreValue = /(\d+\.?\d*)\/5/;
const reReportLink = /\[(\d+)\]\(([^)]+)\)/;
const reArchetype = /\*\*Arquetipo(?:\s+detectado)?\*\*\s*\|\s*(.+)/i;
const reArchetypeColon = /\*\*Arquetipo:\*\*\s*(.+)/i;
const reArchetypeEN = /\*\*Archetype(?:\s+detected)?\*\*\s*\|\s*(.+)/i;
const reTlDr = /\*\*TL;DR\*\*\s*\|\s*(.+)/i;
const reTlDrColon = /\*\*TL;DR:\*\*\s*(.+)/i;
const reRemote = /\*\*Remote\*\*\s*\|\s*(.+)/i;
const reComp = /\*\*Comp\*\*\s*\|\s*(.+)/i;
const reReportURL = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/m;

function cleanTableCell(s) {
  return s.replace(/\|/g, '').trim();
}

function parseApplicationsMd(careerOpsPath) {
  let filePath = join(careerOpsPath, 'data', 'applications.md');
  if (!existsSync(filePath)) {
    filePath = join(careerOpsPath, 'applications.md');
    if (!existsSync(filePath)) {
      console.log('No applications.md found. Skipping import.');
      return [];
    }
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const apps = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.startsWith('| #') || trimmed.startsWith('|---') || trimmed.startsWith('# ')) {
      continue;
    }

    // Parse fields — handle both pipe and tab-separated
    let fields;
    if (trimmed.includes('\t')) {
      const stripped = trimmed.replace(/^\|/, '').trim();
      fields = stripped.split('\t').map(f => f.replace(/\|/g, '').trim());
    } else {
      fields = trimmed.split('|').map(f => f.trim()).filter((_, i, arr) => i > 0 && i < arr.length - (arr[arr.length - 1] === '' ? 1 : 0));
    }

    if (fields.length < 8) continue;

    const app = {
      date: fields[1] || '',
      company: fields[2] || '',
      role: fields[3] || '',
      score: null,
      score_raw: fields[4] || '',
      status: fields[5] || 'Evaluated',
      has_pdf: fields[6]?.includes('\u2705') ? 1 : 0,
      report_path: null,
      notes: fields.length > 8 ? fields[8] : '',
      job_url: null,
      archetype: null,
      tldr: null,
      remote: null,
      comp_estimate: null,
    };

    // Parse score
    const scoreMatch = reScoreValue.exec(fields[4]);
    if (scoreMatch) app.score = parseFloat(scoreMatch[1]);

    // Parse report link
    const reportMatch = reReportLink.exec(fields[7]);
    if (reportMatch) app.report_path = reportMatch[2];

    apps.push(app);
  }

  return apps;
}

function loadReportSummary(careerOpsPath, reportPath) {
  const fullPath = join(careerOpsPath, reportPath);
  if (!existsSync(fullPath)) return {};

  const content = readFileSync(fullPath, 'utf-8');
  const header = content.substring(0, 1500);
  const result = {};

  // Archetype
  let m = reArchetype.exec(header) || reArchetypeColon.exec(header) || reArchetypeEN.exec(header);
  if (m) result.archetype = cleanTableCell(m[1]);

  // TL;DR
  m = reTlDr.exec(header) || reTlDrColon.exec(header);
  if (m) {
    result.tldr = cleanTableCell(m[1]);
    if (result.tldr.length > 120) result.tldr = result.tldr.substring(0, 117) + '...';
  }

  // Remote
  m = reRemote.exec(header);
  if (m) result.remote = cleanTableCell(m[1]);

  // Comp
  m = reComp.exec(header);
  if (m) result.comp_estimate = cleanTableCell(m[1]);

  // Job URL
  m = reReportURL.exec(header);
  if (m) result.job_url = m[1];

  return result;
}

function runImport() {
  console.log(`Importing from: ${careerOpsPath}`);

  const apps = parseApplicationsMd(careerOpsPath);
  if (apps.length === 0) {
    console.log('No applications found to import.');
    return;
  }

  console.log(`Found ${apps.length} applications`);

  const insertMany = db.transaction((apps) => {
    let imported = 0;
    let skipped = 0;

    for (const app of apps) {
      // Check for duplicate
      const existing = checkDuplicate(app.company, app.role);
      if (existing) {
        skipped++;
        continue;
      }

      // Enrich from report if available
      if (app.report_path) {
        const summary = loadReportSummary(careerOpsPath, app.report_path);
        Object.assign(app, summary);
      }

      const result = insertApplication(app);
      const appId = result.lastInsertRowid;

      // Import full report content if available
      if (app.report_path) {
        const fullPath = join(careerOpsPath, app.report_path);
        if (existsSync(fullPath)) {
          const reportContent = readFileSync(fullPath, 'utf-8');
          insertReport(appId, reportContent);
        }
      }

      imported++;
    }

    return { imported, skipped };
  });

  const { imported, skipped } = insertMany(apps);
  console.log(`Import complete: ${imported} imported, ${skipped} skipped (duplicates)`);

  // Also import any reports not linked to applications
  const reportsDir = join(careerOpsPath, 'reports');
  if (existsSync(reportsDir)) {
    const reportFiles = readdirSync(reportsDir).filter(f => f.endsWith('.md'));
    console.log(`Found ${reportFiles.length} report files in reports/`);
  }
}

runImport();
