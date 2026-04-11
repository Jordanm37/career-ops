import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_URL || resolve(__dirname, '..', 'data', 'career-ops.db');

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    score REAL,
    score_raw TEXT,
    status TEXT NOT NULL DEFAULT 'Evaluated',
    has_pdf INTEGER DEFAULT 0,
    report_path TEXT,
    notes TEXT,
    job_url TEXT,
    archetype TEXT,
    tldr TEXT,
    remote TEXT,
    comp_estimate TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_applications_score ON applications(score);
  CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company);
`);

// Prepared statements
const stmts = {
  listApplications: db.prepare(`
    SELECT * FROM applications ORDER BY id DESC
  `),

  getApplication: db.prepare(`
    SELECT * FROM applications WHERE id = ?
  `),

  updateStatus: db.prepare(`
    UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?
  `),

  updateNotes: db.prepare(`
    UPDATE applications SET notes = ?, updated_at = datetime('now') WHERE id = ?
  `),

  insertApplication: db.prepare(`
    INSERT INTO applications (date, company, role, score, score_raw, status, has_pdf, report_path, notes, job_url, archetype, tldr, remote, comp_estimate)
    VALUES (@date, @company, @role, @score, @score_raw, @status, @has_pdf, @report_path, @notes, @job_url, @archetype, @tldr, @remote, @comp_estimate)
  `),

  getReport: db.prepare(`
    SELECT * FROM reports WHERE application_id = ?
  `),

  insertReport: db.prepare(`
    INSERT INTO reports (application_id, content) VALUES (?, ?)
  `),

  getMetrics: db.prepare(`
    SELECT
      COUNT(*) as total,
      AVG(CASE WHEN score > 0 THEN score END) as avg_score,
      MAX(score) as top_score,
      SUM(CASE WHEN has_pdf = 1 THEN 1 ELSE 0 END) as with_pdf
    FROM applications
  `),

  getStatusCounts: db.prepare(`
    SELECT status, COUNT(*) as count FROM applications GROUP BY status
  `),

  checkDuplicate: db.prepare(`
    SELECT id FROM applications WHERE company = ? AND role = ?
  `),
};

// Normalize status to canonical form (ported from Go)
export function normalizeStatus(raw) {
  let s = raw.replace(/\*\*/g, '').trim().toLowerCase();
  // Strip trailing date
  const dateIdx = s.indexOf(' 202');
  if (dateIdx > 0) s = s.substring(0, dateIdx).trim();

  if (s.includes('no aplicar') || s.includes('no_aplicar') || s === 'skip' || s.includes('geo blocker')) return 'skip';
  if (s.includes('interview') || s.includes('entrevista')) return 'interview';
  if (s === 'offer' || s.includes('oferta')) return 'offer';
  if (s.includes('responded') || s.includes('respondido')) return 'responded';
  if (s.includes('applied') || s.includes('aplicado') || s === 'enviada' || s === 'aplicada' || s === 'sent') return 'applied';
  if (s.includes('rejected') || s.includes('rechazado') || s === 'rechazada') return 'rejected';
  if (s.includes('discarded') || s.includes('descartado') || s === 'descartada' || s === 'cerrada' || s === 'cancelada' || s.startsWith('duplicado') || s.startsWith('dup')) return 'discarded';
  if (s.includes('evaluated') || s.includes('evaluada') || s === 'condicional' || s === 'hold' || s === 'monitor' || s === 'evaluar' || s === 'verificar') return 'evaluated';
  return s;
}

export function listApplications({ filter, sort, order } = {}) {
  let apps = stmts.listApplications.all();

  // Normalize statuses for filtering
  if (filter && filter !== 'all') {
    if (filter === 'top') {
      apps = apps.filter(a => a.score >= 4.0 && normalizeStatus(a.status) !== 'skip');
    } else {
      apps = apps.filter(a => normalizeStatus(a.status) === filter);
    }
  }

  // Sort
  const dir = order === 'asc' ? 1 : -1;
  switch (sort) {
    case 'score':
      apps.sort((a, b) => ((b.score || 0) - (a.score || 0)) * dir);
      break;
    case 'date':
      apps.sort((a, b) => (b.date > a.date ? 1 : -1) * dir);
      break;
    case 'company':
      apps.sort((a, b) => a.company.localeCompare(b.company) * dir);
      break;
    case 'status':
      apps.sort((a, b) => (statusPriority(a.status) - statusPriority(b.status)) * dir);
      break;
    default:
      apps.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  return apps;
}

function statusPriority(status) {
  const priorities = { interview: 0, offer: 1, responded: 2, applied: 3, evaluated: 4, skip: 5, rejected: 6, discarded: 7 };
  return priorities[normalizeStatus(status)] ?? 8;
}

export function getApplication(id) {
  return stmts.getApplication.get(id);
}

export function updateApplicationStatus(id, status) {
  return stmts.updateStatus.run(status, id);
}

export function updateApplicationNotes(id, notes) {
  return stmts.updateNotes.run(notes, id);
}

export function insertApplication(app) {
  return stmts.insertApplication.run(app);
}

export function getReport(applicationId) {
  return stmts.getReport.get(applicationId);
}

export function insertReport(applicationId, content) {
  return stmts.insertReport.run(applicationId, content);
}

export function getMetrics() {
  const summary = stmts.getMetrics.get();
  const statusRows = stmts.getStatusCounts.all();
  const byStatus = {};
  for (const row of statusRows) {
    const norm = normalizeStatus(row.status);
    byStatus[norm] = (byStatus[norm] || 0) + row.count;
  }
  return { ...summary, byStatus };
}

export function checkDuplicate(company, role) {
  return stmts.checkDuplicate.get(company, role);
}

export { db };
