const { chromium } = require('playwright');
const fs = require('fs');

async function test() {
  console.log('Starting simple production test...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate
    console.log('1. Loading page...');
    await page.goto('https://maiyuri-bricks-app.vercel.app/design', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Screenshot current state
    await page.screenshot({ path: '/tmp/prod-state-1.png', fullPage: true });
    console.log('   Screenshot saved: /tmp/prod-state-1.png');

    // Check page content
    const content = await page.content();
    console.log('   Page loaded, checking for buttons...');

    // Find all buttons
    const buttons = await page.locator('button').all();
    console.log('   Found ' + buttons.length + ' buttons');

    // List visible buttons
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const btn = buttons[i];
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        const text = await btn.textContent().catch(() => '');
        console.log('   - Button: ' + text.substring(0, 40));
      }
    }

    // Try to find project type selection
    const projectTypes = await page.locator('div:has-text("Residential"), button:has-text("Residential")').all();
    console.log('\n2. Project type elements: ' + projectTypes.length);

    // Click on anything that looks like residential
    const clickTargets = [
      'text=Residential House',
      'text=Residential',
      'button >> text=Residential',
      '[data-testid*="residential"]',
      'div.cursor-pointer:has-text("Residential")'
    ];

    for (const target of clickTargets) {
      const elem = page.locator(target).first();
      const visible = await elem.isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        console.log('   Found clickable: ' + target);
        await elem.click();
        await page.waitForTimeout(2000);
        break;
      }
    }

    await page.screenshot({ path: '/tmp/prod-state-2.png', fullPage: true });
    console.log('   Screenshot saved: /tmp/prod-state-2.png');

    // Check for download buttons (may be from previous session)
    console.log('\n3. Checking for download buttons...');
    const dlButtons = page.locator('button:has-text("Download")');
    const dlCount = await dlButtons.count();
    console.log('   Download buttons found: ' + dlCount);

    if (dlCount > 0) {
      console.log('\n4. Testing download...');
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await dlButtons.first().click();
      const download = await downloadPromise;

      if (download) {
        const filename = download.suggestedFilename();
        await download.saveAs('/tmp/' + filename);
        const stats = fs.statSync('/tmp/' + filename);
        console.log('   Downloaded: ' + filename);
        console.log('   Size: ' + stats.size + ' bytes');
        console.log('   RESULT: ' + (stats.size > 100 ? 'VALID FILE' : 'EMPTY FILE'));
      } else {
        console.log('   No download triggered');
      }
    } else {
      console.log('   No download buttons - need to complete design flow first');
    }

  } catch (e) {
    console.error('Error: ' + e.message);
    await page.screenshot({ path: '/tmp/prod-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\nTest complete.');
  }
}

test();
