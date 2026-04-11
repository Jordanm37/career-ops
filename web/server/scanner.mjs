import { chromium } from 'playwright';
import { loadPortals, filterTitle } from './portals.mjs';
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

  const { titleFilter, trackedCompanies } = loadPortals();
  const runResult = insertScanRun('running');
  const runId = Number(runResult.lastInsertRowid);

  currentScan = {
    id: runId,
    status: 'running',
    progress: [],
    stats: { level1: 0, level2: 0, discovered: 0, filtered: 0, duplicates: 0, queued: 0 },
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

    // Separate companies by scan method
    const greenhouseCompanies = trackedCompanies.filter(c => c.api);
    const playwrightCompanies = trackedCompanies.filter(c => !c.api && c.careers_url);

    // Level 2: Greenhouse API (fast, do first)
    emit({ type: 'phase', text: 'Level 2: Greenhouse API scan' });
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

async function scanWithPlaywright(context, company) {
  const page = await context.newPage();
  const jobs = [];

  try {
    await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait for job listings to load (SPA)
    await page.waitForTimeout(3000);

    const url = company.careers_url;

    if (url.includes('jobs.ashbyhq.com')) {
      // Ashby pattern
      const listings = await page.$$eval('[data-testid="job-list"] a, a[href*="/jobs/"]', els =>
        els.filter(el => el.href && el.href.includes('/jobs/')).map(el => ({
          title: el.textContent?.trim() || '',
          url: el.href,
        }))
      );
      for (const l of listings) {
        if (l.title && l.url) jobs.push({ ...l, company: company.name, portal: 'Ashby', source: 'playwright' });
      }
    } else if (url.includes('jobs.lever.co')) {
      // Lever pattern
      const listings = await page.$$eval('.posting', els =>
        els.map(el => ({
          title: el.querySelector('.posting-title h5, .posting-name')?.textContent?.trim() || '',
          url: el.querySelector('a.posting-title, a[href*="/jobs/"]')?.href || el.querySelector('a')?.href || '',
        }))
      );
      for (const l of listings) {
        if (l.title && l.url) jobs.push({ ...l, company: company.name, portal: 'Lever', source: 'playwright' });
      }
    } else if (url.includes('greenhouse.io')) {
      // Greenhouse board page (HTML, not API)
      const listings = await page.$$eval('.opening a, [class*="job"] a', els =>
        els.map(el => ({
          title: el.textContent?.trim() || '',
          url: el.href,
        }))
      );
      for (const l of listings) {
        if (l.title && l.url) jobs.push({ ...l, company: company.name, portal: 'Greenhouse', source: 'playwright' });
      }
    } else {
      // Generic fallback — look for job-like links
      const listings = await page.$$eval('a', els =>
        els.filter(el => {
          const href = el.href || '';
          const text = el.textContent || '';
          return (href.includes('/job') || href.includes('/career') || href.includes('/position') || href.includes('/opening'))
            && text.trim().length > 3 && text.trim().length < 200;
        }).map(el => ({
          title: el.textContent?.trim() || '',
          url: el.href,
        }))
      );
      for (const l of listings) {
        if (l.title && l.url) jobs.push({ ...l, company: company.name, portal: 'Custom', source: 'playwright' });
      }
    }
  } catch (err) {
    // Timeout or navigation error — skip this company
    throw err;
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
