const { chromium } = require('playwright');
const fs = require('fs');

const PROD_URL = 'https://maiyuri-bricks-app.vercel.app';

async function runProductionTest() {
  console.log('='.repeat(60));
  console.log('PRODUCTION DOWNLOAD TEST');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  let projectTypeSelected = false;

  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      apiCalls.push({ method: req.method(), url: req.url() });
    }
  });

  try {
    console.log('\n[1/5] Navigating to design page...');
    await page.goto(PROD_URL + '/design', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('    Done');

    console.log('\n[2/5] Starting residential house design...');
    // Handle initial client name form if present
    const clientNameInput = page.locator('input[name="clientName"]').first();
    if (await clientNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientNameInput.fill('Test Client');
      const continueBtn = page.locator('button', { hasText: /continue/i }).first();
      await continueBtn.click();
      await page.waitForTimeout(1500);
      console.log('    Submitted client name');
    }

    const residentialBtn = page.locator('text=Residential House').first();
    await residentialBtn.waitFor({ state: 'visible', timeout: 10000 });
    await residentialBtn.click();
    await page.waitForTimeout(2000);
    projectTypeSelected = true;
    console.log('    Selected Residential House');

    console.log('\n[3/5] Answering design questions...');
    let questionsAnswered = 0;

    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1500);

      // Check for generation started
      const generating = await page.locator('text=Generating').isVisible({ timeout: 500 }).catch(() => false);
      if (generating) {
        console.log('    Generation started');
        break;
      }

      // Check for download buttons
      const dlBtn = await page.locator('button:has-text("Download PNG")').isVisible({ timeout: 500 }).catch(() => false);
      if (dlBtn) {
        console.log('    Design already complete');
        break;
      }

      // Try clicking options
      const options = page.locator('button').filter({
        hasText: /(Residential|Compound|Commercial|Upload|Manually|North|South|East|West|feet|Bedroom|Bathroom|Kitchen|Floor|Ground|G\+1|G\+2|Yes|No|Open|Closed)/i
      });
      const optCount = await options.count();

      if (optCount > 0) {
        const optionTexts = [];
        for (let j = 0; j < optCount; j++) {
          const opt = options.nth(j);
          const visible = await opt.isVisible({ timeout: 200 }).catch(() => false);
          if (!visible) continue;
          const txt = (await opt.textContent().catch(() => '')).trim();
          optionTexts.push({ index: j, text: txt });
        }

        const preferredOrder = [
          'Enter Manually',
          'Upload Survey',
          'Yes',
          'No',
          'North',
          'East',
          'South',
          'West',
          '20 feet',
          '12 feet',
          '30 feet',
          '40+',
          '2 Bedrooms',
          '3 Bedrooms',
          '2 Bathrooms',
          'Closed Kitchen',
          'Open Kitchen',
          'Ground + 1',
          'Ground Floor Only',
          'Ground + 2',
        ];

        let chosen = optionTexts.find((o) => {
          if (!o.text) return false;
          if (projectTypeSelected && /Residential House|Compound Wall|Commercial Building/i.test(o.text)) {
            return false;
          }
          return preferredOrder.some((pref) => o.text.includes(pref));
        }) || optionTexts.find((o) => {
          if (!o.text) return false;
          if (projectTypeSelected && /Residential House|Compound Wall|Commercial Building/i.test(o.text)) {
            return false;
          }
          return true;
        });

        if (chosen) {
          const opt = options.nth(chosen.index);
          await opt.click().catch(() => {});
          questionsAnswered++;
          console.log('    Answered: ' + chosen.text.substring(0, 25));
        }
      }

      // Try form inputs (client name / plot dimensions / setbacks)
      const textInputs = page.locator('input[type="text"], input[type="number"]');
      const inputCount = await textInputs.count();
      if (inputCount > 0) {
        for (let j = 0; j < inputCount; j++) {
          const input = textInputs.nth(j);
          const visible = await input.isVisible({ timeout: 200 }).catch(() => false);
          if (!visible) continue;
          const name = await input.getAttribute('name');
          const value = name === 'clientName' ? 'Test Client' : '40';
          await input.fill(value);
        }
        const continueBtn = page.locator('button', { hasText: /continue/i }).first();
        if (await continueBtn.isVisible({ timeout: 200 }).catch(() => false)) {
          await continueBtn.click();
          questionsAnswered++;
          console.log('    Submitted form inputs');
        }
      }
    }
    console.log('    Total questions answered: ' + questionsAnswered);

    console.log('\n[4/5] Waiting for generation (max 6 min)...');
    let complete = false;
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(3000);

      const dlBtns = await page.locator('button:has-text("Download PNG")').count();
      if (dlBtns > 0) {
        complete = true;
        console.log('    Generation complete!');
        break;
      }

      if (i % 20 === 0) {
        console.log('    Still waiting... (' + (i * 3) + 's)');
      }
    }

    if (!complete) {
      console.log('    Generation not complete in time');
      await page.screenshot({ path: '/tmp/prod-test-timeout.png', fullPage: true });
    }

    console.log('\n[5/5] Testing downloads...');
    const downloadButtons = page.locator('button:has-text("Download PNG")');
    const btnCount = await downloadButtons.count();
    console.log('    Found ' + btnCount + ' download button(s)');

    const results = [];

    for (let i = 0; i < btnCount; i++) {
      const btn = downloadButtons.nth(i);
      const visible = await btn.isVisible({ timeout: 1000 }).catch(() => false);

      if (visible) {
        console.log('    Clicking button ' + (i + 1) + '...');

        const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await btn.click();

        const download = await downloadPromise;
        if (download) {
          const filename = download.suggestedFilename();
          const downloadPath = '/tmp/' + filename;
          await download.saveAs(downloadPath);

          const stats = fs.statSync(downloadPath);
          const size = stats.size;

          // Check PNG signature
          let isPng = false;
          if (size > 8) {
            const header = fs.readFileSync(downloadPath).slice(0, 8);
            const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            isPng = header.equals(pngSig);
          }

          results.push({ filename, size, isPng });
          console.log('      File: ' + filename);
          console.log('      Size: ' + size + ' bytes');
          console.log('      Valid PNG: ' + (isPng ? 'YES' : 'NO'));
        } else {
          results.push({ filename: 'N/A', size: 0, isPng: false, error: 'No download' });
          console.log('      No download triggered');
        }
      }
    }

    await page.screenshot({ path: '/tmp/prod-test-final.png', fullPage: true });

    console.log('\n' + '='.repeat(60));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log('Downloads tested: ' + results.length);

    results.forEach((r, i) => {
      console.log((i + 1) + '. ' + r.filename + ' - ' + r.size + ' bytes - PNG: ' + (r.isPng ? 'YES' : 'NO'));
    });

    const allValid = results.length > 0 && results.every(r => r.isPng && r.size > 100);
    console.log('\nOVERALL: ' + (allValid ? 'PASS - All downloads valid' : 'NEEDS ATTENTION'));
    console.log('API calls: ' + apiCalls.length);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/prod-test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

runProductionTest();
