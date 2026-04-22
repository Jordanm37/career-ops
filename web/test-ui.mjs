import { chromium } from 'playwright';

const URL = 'https://career-ops-production-2a77.up.railway.app';
const SCREENSHOT_PATH = 'C:\\dev\\GitHub\\career-ops\\web\\test-final-ui.png';

const results = [];
const consoleErrors = [];
const pageErrors = [];

function log(test, status, details = '') {
  const entry = { test, status, details };
  results.push(entry);
  console.log(`[${status}] ${test}${details ? ' - ' + details : ''}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function closeAnyModal(page) {
  // Try clicking backdrop, escape, and any close buttons
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await sleep(250);
  }
  // Click any visible X close buttons that are NOT the banner's dismiss
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || '').trim();
      const al = (b.getAttribute('aria-label') || '').toLowerCase();
      return (t === '×' || t === 'X' || t === 'Close' || al.includes('close')) && b.offsetParent !== null;
    });
    // Don't close the banner — only close buttons inside modals with z-50 overlays
    for (const b of closeBtns) {
      let parent = b.parentElement;
      let depth = 0;
      while (parent && depth < 10) {
        const cls = parent.className || '';
        if (typeof cls === 'string' && (cls.includes('fixed inset-0') || cls.includes('z-50'))) {
          b.click();
          return;
        }
        parent = parent.parentElement;
        depth++;
      }
    }
  });
  await sleep(400);
}

async function dismissBanner(page) {
  // The CV sync banner has a dismissible X — click it to get it out of the way for testing
  const dismissed = await page.evaluate(() => {
    // Look for banner with "CV sync" text and find its close/dismiss button
    const banners = Array.from(document.querySelectorAll('div')).filter(d => {
      const t = (d.textContent || '').toLowerCase();
      return t.includes('cv sync') && d.offsetParent !== null;
    });
    // Find the smallest/tightest one
    banners.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0));
    for (const banner of banners) {
      const xBtn = Array.from(banner.querySelectorAll('button')).find(b => {
        const t = (b.innerText || '').trim();
        return t === '×' || t === 'X' || t === '✕' || t === '✖';
      });
      if (xBtn) {
        xBtn.click();
        return true;
      }
    }
    return false;
  });
  await sleep(600);
  return dismissed;
}

async function clickByText(page, text, opts = {}) {
  // Force-click via JS to bypass overlay issues (the banner backdrop causes problems)
  return await page.evaluate((t) => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    const target = btns.find(b => {
      const label = (b.innerText || b.title || b.getAttribute('aria-label') || '').trim();
      return label.toLowerCase().includes(t.toLowerCase()) && b.offsetParent !== null;
    });
    if (target) { target.click(); return target.innerText; }
    return null;
  }, text);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  try {
    // --- Test 1: Page loads clean ---
    console.log('\n=== Test 1: Page loads clean ===');
    const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2500);
    const status = resp?.status();
    const bodyText = await page.evaluate(() => document.body?.innerText?.length || 0);
    const hasReact = await page.evaluate(() => !!document.querySelector('#root')?.children?.length);
    if (status === 200 && bodyText > 0 && hasReact) {
      log('1. Page loads clean', 'PASS', `status=${status} bodyLen=${bodyText} react=${hasReact} consoleErrors=${consoleErrors.length}`);
    } else {
      log('1. Page loads clean', 'FAIL', `status=${status} bodyLen=${bodyText} react=${hasReact}`);
    }

    // --- Test 3 (before 2 so we can dismiss): CV Sync Banner ---
    console.log('\n=== Test 3: CV Sync Banner ===');
    const bannerInfo = await page.evaluate(() => {
      const banners = Array.from(document.querySelectorAll('div')).filter(d => {
        const t = (d.textContent || '').toLowerCase();
        return (t.includes('cv sync') || t.includes('cv not') || t.includes('profile not')) && d.offsetParent !== null;
      });
      if (!banners.length) return { present: false };
      banners.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0));
      const el = banners[0];
      const buttons = Array.from(el.querySelectorAll('button')).map(b => (b.innerText || '').trim());
      const hasClose = buttons.some(t => t === '×' || t === 'X' || t === '✕');
      // Try expand click on the banner text
      return { present: true, text: (el.textContent || '').slice(0, 200), hasCloseBtn: hasClose, buttons };
    });
    if (!bannerInfo.present) {
      log('3. CV Sync Banner', 'PASS', 'Banner absent (all OK)');
    } else {
      // Try expanding
      const expandClicked = await page.evaluate(() => {
        const banners = Array.from(document.querySelectorAll('div')).filter(d => {
          const t = (d.textContent || '').toLowerCase();
          return t.includes('cv sync') && d.offsetParent !== null;
        });
        banners.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0));
        const el = banners[0];
        const clickable = Array.from(el.querySelectorAll('button, [role="button"], span, div')).find(c => {
          const t = (c.innerText || '').toLowerCase();
          return t.includes('cv sync issues') || t.includes('click to');
        });
        if (clickable) { clickable.click(); return true; }
        return false;
      });
      await sleep(600);
      const expandedContent = await page.evaluate(() => {
        const banners = Array.from(document.querySelectorAll('div')).filter(d => {
          const t = (d.textContent || '').toLowerCase();
          return t.includes('cv sync') && d.offsetParent !== null;
        });
        banners.sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0));
        return banners[0]?.textContent?.length || 0;
      });
      log('3. CV Sync Banner', bannerInfo.hasCloseBtn ? 'PASS' : 'PARTIAL',
        `visible hasCloseBtn=${bannerInfo.hasCloseBtn} expandable=${expandClicked} expandedContentLen=${expandedContent}`);
    }

    // Dismiss banner to unblock subsequent tests
    const bannerDismissed = await dismissBanner(page);
    console.log(`[info] banner dismissed: ${bannerDismissed}`);

    // --- Test 2: Header buttons ---
    console.log('\n=== Test 2: Header buttons ===');
    const headerAudit = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, a')).filter(e => e.offsetParent !== null);
      const labels = all.map(el => (el.innerText || el.title || el.getAttribute('aria-label') || '').trim()).filter(Boolean);
      const hasSettings = labels.some(l => l.includes('⚙') || l.toLowerCase() === 'settings' || l.includes('Settings'));
      const hasProfile = labels.some(l => l.toLowerCase().includes('profile'));
      const hasScan = labels.some(l => l.toLowerCase().includes('scan jobs'));
      const hasQueue = labels.some(l => l.toLowerCase() === 'queue' || l.toLowerCase().startsWith('queue'));
      const hasEvaluate = labels.some(l => l.toLowerCase().includes('evaluate'));
      const hasGithub = !!Array.from(document.querySelectorAll('a')).find(a => a.href.includes('github.com'));
      return { hasSettings, hasProfile, hasScan, hasQueue, hasEvaluate, hasGithub, sample: labels.slice(0, 30) };
    });
    const pass2 = headerAudit.hasSettings && headerAudit.hasProfile && headerAudit.hasScan && headerAudit.hasQueue && headerAudit.hasEvaluate && headerAudit.hasGithub;
    log('2. Header buttons', pass2 ? 'PASS' : 'PARTIAL',
      `settings=${headerAudit.hasSettings} profile=${headerAudit.hasProfile} scan=${headerAudit.hasScan} queue=${headerAudit.hasQueue} evaluate=${headerAudit.hasEvaluate} github=${headerAudit.hasGithub}`);
    if (!pass2) console.log('  header labels sample:', headerAudit.sample);

    // --- Test 4: Profile button ---
    console.log('\n=== Test 4: Profile button ===');
    try {
      const label = await clickByText(page, 'profile');
      await sleep(1800);
      const modal = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const hasProfileSetup = bodyText.includes('Profile Setup');
        const inputs = Array.from(document.querySelectorAll('input')).map(i => ({ value: i.value, type: i.type, placeholder: i.placeholder }));
        const panosInInput = inputs.some(i => (i.value || '').toLowerCase().includes('panos'));
        const panosInText = bodyText.toLowerCase().includes('panos');
        // Detect which step is active: on Personal step, text includes "pre-filled your details" or fields like "Full Name"
        const onPersonalStep = bodyText.includes('Full Name') || bodyText.includes('pre-filled your details');
        const onCvStep = bodyText.toLowerCase().includes('drag') && bodyText.toLowerCase().includes('pdf') ||
                         bodyText.toLowerCase().includes('upload your cv');
        return { hasProfileSetup, panosInInput, panosInText, onPersonalStep, onCvStep, inputCount: inputs.length };
      });
      const pass4 = modal.hasProfileSetup && modal.panosInInput && modal.onPersonalStep && !modal.onCvStep;
      log('4. Profile button', pass4 ? 'PASS' : 'PARTIAL',
        `clickedLabel="${label}" modalOpen=${modal.hasProfileSetup} panosPrefilled=${modal.panosInInput} onPersonal=${modal.onPersonalStep} onCv=${modal.onCvStep} inputCount=${modal.inputCount}`);
      await page.screenshot({ path: 'C:\\dev\\GitHub\\career-ops\\web\\test-profile-modal.png' });
      await closeAnyModal(page);
    } catch (e) {
      log('4. Profile button', 'FAIL', e.message);
    }

    // --- Test 5: Scan Jobs ---
    console.log('\n=== Test 5: Scan Jobs ===');
    try {
      const label = await clickByText(page, 'scan jobs');
      await sleep(1500);
      const expected = ['AI', 'Aerospace', 'Australia', 'Automation', 'Automotive', 'Enterprise SaaS', 'Europe', 'Europe - DACH', 'Hardware', 'Industrial', 'Medical', 'Robotics'];
      const chips = await page.evaluate((exp) => {
        const all = document.body.innerText;
        return exp.map(e => ({ name: e, found: all.includes(e) }));
      }, expected);
      const foundCount = chips.filter(c => c.found).length;
      log('5a. Scan Jobs - chips', foundCount === 12 ? 'PASS' : 'PARTIAL',
        `${foundCount}/12 found. clickedLabel="${label}". Missing: ${chips.filter(c => !c.found).map(c=>c.name).join(', ') || '(none)'}`);

      const mgrOpened = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.toLowerCase().includes('manage companies'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      await sleep(1500);
      const companiesModal = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('companies') && (text.includes('add company') || text.includes('add') || text.includes('delete') || text.includes('edit'));
      });
      log('5b. Manage Companies', (mgrOpened && companiesModal) ? 'PASS' : 'FAIL',
        `btnClicked=${mgrOpened} companiesModalOpen=${companiesModal}`);
      await closeAnyModal(page);
      await closeAnyModal(page);
    } catch (e) {
      log('5. Scan Jobs', 'FAIL', e.message);
    }

    // --- Test 6: Queue button ---
    console.log('\n=== Test 6: Queue button ===');
    try {
      const label = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => {
          const t = (b.innerText || '').trim().toLowerCase();
          return t === 'queue';
        });
        if (btn) { btn.click(); return btn.innerText; }
        return null;
      });
      await sleep(1500);
      const queueModal = await page.evaluate(() => {
        const textarea = !!document.querySelector('textarea');
        const btns = Array.from(document.querySelectorAll('button')).map(b => b.innerText?.trim() || '');
        const hasAddBtn = btns.some(t => t.toLowerCase().includes('add urls'));
        const hasProcessNext = btns.some(t => t.toLowerCase().includes('process next'));
        const hasProcessAll = btns.some(t => t.toLowerCase().includes('process all'));
        return { hasTextarea: textarea, hasAddBtn, hasProcessNext, hasProcessAll, btnsSample: btns.filter(b => b).slice(0, 20) };
      });
      const pass6 = queueModal.hasTextarea && queueModal.hasAddBtn && queueModal.hasProcessNext && queueModal.hasProcessAll;
      log('6. Queue button', pass6 ? 'PASS' : 'PARTIAL',
        `clickedLabel="${label}" textarea=${queueModal.hasTextarea} addBtn=${queueModal.hasAddBtn} procNext=${queueModal.hasProcessNext} procAll=${queueModal.hasProcessAll}`);
      if (!pass6) console.log('  buttons sample:', queueModal.btnsSample);
      await closeAnyModal(page);
    } catch (e) {
      log('6. Queue button', 'FAIL', e.message);
    }

    // --- Test 7: + Evaluate ---
    console.log('\n=== Test 7: + Evaluate ===');
    try {
      const label = await clickByText(page, 'evaluate');
      await sleep(1500);
      const evalModal = await page.evaluate(() => {
        const textarea = !!document.querySelector('textarea');
        const inputs = Array.from(document.querySelectorAll('input')).map(i => i.type);
        const urlInput = inputs.includes('url') || inputs.includes('text');
        return { hasTextarea: textarea, hasUrlInput: urlInput, inputTypes: inputs };
      });
      log('7. + Evaluate', (evalModal.hasTextarea && evalModal.hasUrlInput) ? 'PASS' : 'PARTIAL',
        `clickedLabel="${label}" textarea=${evalModal.hasTextarea} urlInput=${evalModal.hasUrlInput}`);
      await closeAnyModal(page);
    } catch (e) {
      log('7. + Evaluate', 'FAIL', e.message);
    }

    // --- Test 8: Click pipeline row ---
    console.log('\n=== Test 8: Pipeline row ===');
    try {
      const clicked = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const first = rows.find(r => r.offsetParent !== null && r.querySelectorAll('td').length > 1);
        if (first) { first.click(); return true; }
        const divRows = Array.from(document.querySelectorAll('[class*="row" i]')).filter(r => r.offsetParent !== null && r.getBoundingClientRect().height < 150 && r.getBoundingClientRect().height > 30);
        if (divRows.length > 1) { divRows[1].click(); return true; }
        return false;
      });
      await sleep(2000);

      const previewInfo = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasLi: text.includes('LinkedIn Message'),
          hasDeep: text.includes('Deep Research'),
          hasAnswer: text.includes('Answer Questions'),
          clicked: true
        };
      });

      if (!clicked) {
        log('8. Pipeline row', 'SKIP', 'No rows found in pipeline');
      } else if (previewInfo.hasLi && previewInfo.hasDeep && previewInfo.hasAnswer) {
        log('8a. ReportPreview', 'PASS', `actions: LinkedIn=${previewInfo.hasLi} DeepResearch=${previewInfo.hasDeep} Answer=${previewInfo.hasAnswer}`);
        const liClicked = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.includes('LinkedIn Message'));
          if (btn) { btn.click(); return true; }
          return false;
        });
        await sleep(2500);
        const contactoOpen = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          return text.includes('linkedin') && (text.includes('message') || text.includes('contact') || text.includes('loading') || text.includes('generating') || text.includes('sending'));
        });
        log('8b. LinkedIn Message modal (ContactoModal)', (liClicked && contactoOpen) ? 'PASS' : 'PARTIAL',
          `clicked=${liClicked} modalOpen=${contactoOpen}`);
        await closeAnyModal(page);
        await closeAnyModal(page);
      } else {
        log('8. Pipeline row', 'PARTIAL', `clicked=${clicked} actions=${JSON.stringify(previewInfo)}`);
      }
    } catch (e) {
      log('8. Pipeline row', 'FAIL', e.message);
    }

    // --- Test 9: Settings button ---
    console.log('\n=== Test 9: Settings button ===');
    try {
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a')).filter(b => b.offsetParent !== null);
        const gear = btns.find(b => {
          const t = (b.innerText || b.title || b.getAttribute('aria-label') || '').trim();
          return t.includes('⚙') || t === '⚙️' || t.toLowerCase() === 'settings';
        });
        if (gear) { gear.click(); return gear.innerText || gear.title || gear.getAttribute('aria-label'); }
        return null;
      });
      await sleep(1500);
      const settingsInfo = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          openai: text.includes('OpenAI API Key'),
          adzunaId: text.includes('Adzuna App ID'),
          adzunaKey: text.includes('Adzuna API Key'),
          model: text.includes('OpenAI Model'),
          envSource: /env/i.test(text) && /set/i.test(text)
        };
      });
      const ok = settingsInfo.openai && settingsInfo.adzunaId && settingsInfo.adzunaKey && settingsInfo.model;
      log('9. Settings', ok ? 'PASS' : 'PARTIAL',
        `clicked="${clicked}" openai=${settingsInfo.openai} adzunaId=${settingsInfo.adzunaId} adzunaKey=${settingsInfo.adzunaKey} model=${settingsInfo.model} envIndicator=${settingsInfo.envSource}`);
      await closeAnyModal(page);
    } catch (e) {
      log('9. Settings', 'FAIL', e.message);
    }

    // --- Test 10: Guide popup ---
    console.log('\n=== Test 10: Guide popup ===');
    try {
      const opened = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const guide = els.find(b => {
          const t = (b.innerText || b.title || b.getAttribute('aria-label') || '').trim();
          return t === '?' || t.toLowerCase().includes('guide') || t.startsWith('?') || t.includes('❓');
        });
        if (guide) { guide.click(); return guide.innerText || 'clicked'; }
        return null;
      });
      await sleep(1500);
      const sectionCount = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('h1, h2, h3, h4, [class*="section" i]'));
        return all.filter(h => h.offsetParent !== null).length;
      });
      const minimized = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const minBtn = btns.find(b => {
          const t = (b.innerText || '').trim();
          const al = (b.getAttribute('aria-label') || '').toLowerCase();
          return t === '−' || t === '-' || t === '–' || al.includes('minimize') || al.includes('collapse');
        });
        if (minBtn) { minBtn.click(); return true; }
        return false;
      });
      await sleep(800);
      const reexpand = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const expBtn = btns.find(b => {
          const t = (b.innerText || '').trim();
          const al = (b.getAttribute('aria-label') || '').toLowerCase();
          return t === '+' || al.includes('expand');
        });
        if (expBtn) { expBtn.click(); return true; }
        return false;
      });
      await sleep(500);
      log('10. Guide popup', opened ? 'PASS' : 'FAIL',
        `opened="${opened}" sectionsVisible=${sectionCount} minimized=${minimized} reexpanded=${reexpand}`);
      await closeAnyModal(page);
    } catch (e) {
      log('10. Guide popup', 'FAIL', e.message);
    }

    // --- Test 11: Final screenshot ---
    console.log('\n=== Test 11: Final screenshot ===');
    try {
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(200); }
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
      log('11. Final screenshot', 'PASS', `saved to ${SCREENSHOT_PATH}`);
    } catch (e) {
      log('11. Final screenshot', 'FAIL', e.message);
    }

  } catch (err) {
    console.error('FATAL:', err);
    log('FATAL', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n\n========== SUMMARY ==========');
  for (const r of results) {
    console.log(`[${r.status}] ${r.test}${r.details ? ' :: ' + r.details : ''}`);
  }
  console.log('\n---- Console Errors ----');
  if (consoleErrors.length === 0) console.log('(none)');
  else consoleErrors.forEach(e => console.log('  ', e));
  console.log('\n---- Page Errors ----');
  if (pageErrors.length === 0) console.log('(none)');
  else pageErrors.forEach(e => console.log('  ', e));
})();
