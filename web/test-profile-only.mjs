import { chromium } from 'playwright';

const URL = 'https://career-ops-production-2a77.up.railway.app';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2500));

  // Dismiss banner
  await page.evaluate(() => {
    const banners = Array.from(document.querySelectorAll('div')).filter(d => {
      const t = (d.textContent || '').toLowerCase();
      return t.includes('cv sync') && d.offsetParent !== null;
    });
    banners.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0));
    for (const banner of banners) {
      const xBtn = Array.from(banner.querySelectorAll('button')).find(b => {
        const t = (b.innerText || '').trim();
        return t === '×' || t === 'X' || t === '✕';
      });
      if (xBtn) { xBtn.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // Click Setup Profile
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('profile'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Dump full body text + any visible overlays
  const info = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('div')).filter(d => {
      const cls = typeof d.className === 'string' ? d.className : '';
      return (cls.includes('fixed') || cls.includes('z-50')) && d.offsetParent !== null;
    });
    return {
      bodyTextSample: document.body.innerText.slice(0, 2000),
      overlayCount: overlays.length,
      overlayTexts: overlays.slice(0, 5).map(o => (o.innerText || '').slice(0, 400)),
      allInputs: Array.from(document.querySelectorAll('input')).map(i => ({ name: i.name, value: i.value, type: i.type, placeholder: i.placeholder })).slice(0, 20),
      panosMention: document.body.innerText.toLowerCase().includes('panos')
    };
  });

  console.log('Body sample:', info.bodyTextSample);
  console.log('\n--- Overlay count:', info.overlayCount);
  info.overlayTexts.forEach((t, i) => console.log(`\n--- Overlay ${i}:`, t));
  console.log('\n--- Inputs:', JSON.stringify(info.allInputs, null, 2));
  console.log('\n--- "panos" mentioned:', info.panosMention);

  await page.screenshot({ path: 'C:\\dev\\GitHub\\career-ops\\web\\test-profile-debug.png', fullPage: true });

  await browser.close();
})();
