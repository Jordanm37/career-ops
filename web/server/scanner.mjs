import { chromium } from 'playwright';
import { loadPortals, filterTitle } from './portals.mjs';
import { webSearchJobs } from './search.mjs';
import {
  insertScanRun, updateScanRun, insertDiscoveredJob,
  insertScanHistory, checkScanHistoryUrl, checkDiscoveredUrl,
  checkDuplicate,
} from './db.mjs';

let currentScan = null; // { id, status, progress, log }

export function getScanStatus() {
  return currentScan;
}

export async function startScan(options = {}, onProgress) {
  if (currentScan?.status === 'running') {
    throw new Error('Scan already in progress');
  }

  const { titleFilter, trackedCompanies: allCompanies, searchQueries } = loadPortals();
  const trackedCompanies = Array.isArray(options.categories) && options.categories.length > 0
    ? allCompanies.filter(c => options.categories.includes(c.category))
    : allCompanies;
  const runResult = insertScanRun('running');
  const runId = Number(runResult.lastInsertRowid);

  currentScan = {
    id: runId,
    status: 'running',
    progress: [],
    stats: { level1: 0, level2: 0, level3: 0, discovered: 0, filtered: 0, duplicates: 0, queued: 0 },
  };

  const emit = (msg) => {
    currentScan.progress.push(msg);
    if (onProgress) onProgress(msg);
  };

  try {
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    } catch (e) {
      emit({ type: 'warn', text: 'Playwright not available, skipping Level 1. Using API-only mode.' });
      browser = null;
    }

    // Partition companies by scan strategy
    // scan_method: 'websearch' skips API/Playwright (handled by Level 3)
    const greenhouseCompanies = trackedCompanies.filter(c =>
      c.scan_method !== 'websearch' && c.api && c.api.includes('greenhouse')
    );
    const ashbyCompanies = trackedCompanies.filter(c =>
      c.scan_method !== 'websearch' && !c.api && c.careers_url?.includes('jobs.ashbyhq.com')
    );
    const leverCompanies = trackedCompanies.filter(c =>
      c.scan_method !== 'websearch' && !c.api && c.careers_url?.includes('jobs.lever.co')
    );
    const playwrightCompanies = trackedCompanies.filter(c =>
      !c.api && c.careers_url
      && !c.careers_url.includes('jobs.ashbyhq.com')
      && !c.careers_url.includes('jobs.lever.co')
      && c.scan_method !== 'websearch'
    );

    // Level 2a: Greenhouse API
    emit({ type: 'phase', text: 'Level 2a: Greenhouse API scan' });
    for (const company of greenhouseCompanies) {
      try {
        emit({ type: 'info', text: `API: ${company.name}` });
        const jobs = await scanGreenhouseAPI(company);
        for (const job of jobs) {
          processDiscoveredJob(job, runId, titleFilter, currentScan.stats, emit);
        }
        currentScan.stats.level2 += jobs.length;
      } catch (err) {
        emit({ type: 'error', text: `API error ${company.name}: ${err.message}` });
      }
    }

    // Level 2b: Ashby API
    emit({ type: 'phase', text: 'Level 2b: Ashby API scan' });
    for (const company of ashbyCompanies) {
      try {
        emit({ type: 'info', text: `Ashby: ${company.name}` });
        const jobs = await scanAshbyAPI(company);
        for (const job of jobs) processDiscoveredJob(job, runId, titleFilter, currentScan.stats, emit);
        currentScan.stats.level2 += jobs.length;
      } catch (err) {
        emit({ type: 'error', text: `Ashby error ${company.name}: ${err.message}` });
      }
    }

    // Level 2c: Lever API
    emit({ type: 'phase', text: 'Level 2c: Lever API scan' });
    for (const company of leverCompanies) {
      try {
        emit({ type: 'info', text: `Lever: ${company.name}` });
        const jobs = await scanLeverAPI(company);
        for (const job of jobs) processDiscoveredJob(job, runId, titleFilter, currentScan.stats, emit);
        currentScan.stats.level2 += jobs.length;
      } catch (err) {
        emit({ type: 'error', text: `Lever error ${company.name}: ${err.message}` });
      }
    }

    // Level 1: Playwright (slower, need browser)
    if (browser) {
      emit({ type: 'phase', text: 'Level 1: Playwright portal scan' });
      const context = await browser.newContext();

      for (const company of playwrightCompanies) {
        try {
          emit({ type: 'info', text: `Crawl: ${company.name}` });
          const jobs = await scanWithPlaywright(context, company);
          for (const job of jobs) {
            processDiscoveredJob(job, runId, titleFilter, currentScan.stats, emit);
          }
          currentScan.stats.level1 += jobs.length;
        } catch (err) {
          emit({ type: 'error', text: `Crawl error ${company.name}: ${err.message}` });
        }
      }

      await context.close();
      await browser.close();
    }

    // Level 3: WebSearch (profile-driven queries) — runs if Adzuna or OpenAI key is present
    const hasSearchKey = process.env.ADZUNA_APP_ID || process.env.OPENAI_API_KEY;
    if (hasSearchKey && searchQueries.length > 0) {
      emit({ type: 'phase', text: 'Level 3: WebSearch discovery' });
      // Cap queries to avoid runaway cost; prioritize profile-driven queries
      const prioritized = [...searchQueries].sort((a, b) => (b.profileDriven ? 1 : 0) - (a.profileDriven ? 1 : 0));
      const maxQueries = Math.min(prioritized.length, 10);
      for (let i = 0; i < maxQueries; i++) {
        const q = prioritized[i];
        try {
          emit({ type: 'info', text: `Search: ${q.name}` });
          const jobs = await webSearchJobs(q.query, 10, { country: 'au' });
          for (const job of jobs) processDiscoveredJob(job, runId, titleFilter, currentScan.stats, emit);
          currentScan.stats.level3 += jobs.length;
        } catch (err) {
          emit({ type: 'error', text: `Search error ${q.name}: ${err.message}` });
        }
      }
    }

    // Update run stats
    currentScan.status = 'completed';
    updateScanRun(runId, {
      status: 'completed',
      level1_count: currentScan.stats.level1,
      level2_count: currentScan.stats.level2,
      discovered: currentScan.stats.discovered,
      filtered: currentScan.stats.filtered,
      duplicates: currentScan.stats.duplicates,
      queued: currentScan.stats.queued,
      error: null,
    });
    emit({ type: 'done', text: `Scan complete: ${currentScan.stats.discovered} new jobs found` });

  } catch (err) {
    currentScan.status = 'failed';
    updateScanRun(runId, {
      status: 'failed',
      level1_count: 0, level2_count: 0,
      discovered: 0, filtered: 0, duplicates: 0, queued: 0,
      error: err.message,
    });
    emit({ type: 'error', text: `Scan failed: ${err.message}` });
  }

  return currentScan;
}

function processDiscoveredJob(job, runId, titleFilter, stats, emit) {
  // Check duplicates
  if (checkScanHistoryUrl(job.url) || checkDiscoveredUrl(job.url)) {
    stats.duplicates++;
    return;
  }
  // Also check existing applications by company+role
  // (checkDuplicateApplication is exported from db.mjs — it checks company + role)
  // We'll just check URL-based dedup for now

  // Title filter
  const { pass, seniority } = filterTitle(job.title, titleFilter);
  if (!pass) {
    stats.filtered++;
    insertScanHistory(job.url, job.portal || job.company, job.title, job.company, 'skipped_title');
    return;
  }

  // Add to discovered
  stats.discovered++;
  insertDiscoveredJob(runId, job.url, job.title, job.company, job.portal || job.company, job.source, seniority ? 1 : 0);
  insertScanHistory(job.url, job.portal || job.company, job.title, job.company, 'added');
  emit({ type: 'found', text: `${job.company} — ${job.title}`, url: job.url });
}

async function scanGreenhouseAPI(company) {
  const res = await fetch(company.api);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(job => ({
    title: job.title,
    url: job.absolute_url,
    company: company.name,
    portal: 'Greenhouse API',
    source: 'greenhouse_api',
  }));
}

async function scanAshbyAPI(company) {
  const slug = new URL(company.careers_url).pathname.replace(/^\//, '');
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) throw new Error(`Ashby HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).filter(j => j.isListed !== false).map(j => ({
    title: j.title,
    url: j.jobUrl,
    company: company.name,
    portal: 'Ashby API',
    source: 'ashby_api',
  }));
}

async function scanLeverAPI(company) {
  const slug = new URL(company.careers_url).pathname.replace(/^\//, '').replace(/\/$/, '');
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) throw new Error(`Lever HTTP ${res.status}`);
  const data = await res.json();
  return (data || []).map(j => ({
    title: j.text,
    url: j.hostedUrl,
    company: company.name,
    portal: 'Lever API',
    source: 'lever_api',
  }));
}

async function scanWithPlaywright(context, company) {
  const page = await context.newPage();
  const jobs = [];
  const url = company.careers_url;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    if (url.includes('greenhouse.io')) {
      await page.waitForSelector('tr.job-post, .opening', { timeout: 10000 }).catch(() => {});
      const listings = await page.$$eval(
        'tr.job-post a[href*="/jobs/"], .opening a[href*="/jobs/"]',
        els => els.map(el => ({ title: el.textContent?.trim() || '', url: el.href }))
      );
      for (const l of listings) {
        if (l.title && l.url) jobs.push({ ...l, company: company.name, portal: 'Greenhouse', source: 'playwright' });
      }
    } else {
      // Generic fallback — tighter link filter, wait for network idle
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const listings = await page.$$eval('a', els =>
        els.filter(el => {
          const href = el.href || '';
          const text = (el.textContent || '').trim();
          return href.startsWith('http')
            && (href.match(/\/jobs?\/[a-z0-9-]{3,}/i) || href.match(/\/careers?\/[a-z0-9-]{5,}/i))
            && text.length > 5 && text.length < 150
            && !/^(careers?|jobs?|open roles?|apply|view all)$/i.test(text);
        }).map(el => ({ title: el.textContent?.trim() || '', url: el.href }))
      );
      for (const l of listings) {
        if (l.title && l.url) jobs.push({ ...l, company: company.name, portal: 'Custom', source: 'playwright' });
      }
    }
  } finally {
    await page.close();
  }

  return jobs;
}

export function cancelScan() {
  if (currentScan?.status === 'running') {
    currentScan.status = 'cancelled';
  }
}
