import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'https://maiyuri-bricks-app.vercel.app';

if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
  console.error('Error: E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required');
  process.exit(1);
}

const TEST_USER = {
  email: process.env.E2E_TEST_EMAIL,
  password: process.env.E2E_TEST_PASSWORD
};

async function testWithTamilEnabled() {
  console.log('Testing App with Tamil Language Enabled');
  console.log('='.repeat(50));
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // PHASE 1: LOGIN
    console.log('PHASE 1: LOGIN');
    console.log('-'.repeat(40));
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Email address').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard**', { timeout: 20000 });
    console.log('   Logged in successfully');

    // PHASE 2: SET TAMIL LANGUAGE
    console.log('');
    console.log('PHASE 2: ENABLE TAMIL LANGUAGE');
    console.log('-'.repeat(40));
    await page.click('a:has-text("Settings")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const languageDropdown = page.locator('select').first();
    const currentValue = await languageDropdown.inputValue();
    console.log(`   Current language: ${currentValue === 'en' ? 'English' : 'Tamil'}`);

    if (currentValue !== 'ta') {
      await languageDropdown.selectOption('ta');
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /Save Changes/i }).click();
      await page.waitForTimeout(2000);
      console.log('   Tamil language enabled and saved');
    } else {
      console.log('   Tamil already enabled');
    }

    await page.screenshot({ path: 'test-results/tamil-test-1-settings.png', fullPage: true });

    // PHASE 3: TEST DASHBOARD
    console.log('');
    console.log('PHASE 3: DASHBOARD');
    console.log('-'.repeat(40));
    await page.click('a:has-text("Dashboard")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('   Dashboard loaded');
    await page.screenshot({ path: 'test-results/tamil-test-2-dashboard.png', fullPage: true });

    // Check for Tamil content
    let pageContent = await page.content();
    let hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
    console.log(`   Tamil content visible: ${hasTamil ? 'YES' : 'No'}`);

    // PHASE 4: TEST LEADS PAGE
    console.log('');
    console.log('PHASE 4: LEADS PAGE');
    console.log('-'.repeat(40));
    await page.click('a:has-text("Leads")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('   Leads page loaded');
    await page.screenshot({ path: 'test-results/tamil-test-3-leads.png', fullPage: true });

    // Click on first lead to see AI analysis
    const leadRows = page.locator('tr').filter({ hasText: /@/ });
    const leadCount = await leadRows.count();
    console.log(`   Found ${leadCount} leads`);

    if (leadCount > 0) {
      await leadRows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      console.log('   Opened first lead details');
      await page.screenshot({ path: 'test-results/tamil-test-4-lead-detail.png', fullPage: true });

      // Check for AI analysis content
      pageContent = await page.content();
      hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
      console.log(`   Tamil in lead details: ${hasTamil ? 'YES' : 'No'}`);

      // Try to trigger AI analysis if button exists
      const analyzeBtn = page.locator('button:has-text("Analyze"), button:has-text("Generate")').first();
      if (await analyzeBtn.isVisible().catch(() => false)) {
        console.log('   Triggering AI analysis...');
        await analyzeBtn.click();
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'test-results/tamil-test-5-ai-analysis.png', fullPage: true });

        pageContent = await page.content();
        hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
        console.log(`   Tamil in AI analysis: ${hasTamil ? 'YES' : 'No'}`);
      }
    }

    // PHASE 5: TEST COACHING PAGE
    console.log('');
    console.log('PHASE 5: COACHING PAGE');
    console.log('-'.repeat(40));
    await page.click('a:has-text("Coaching")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('   Coaching page loaded');
    await page.screenshot({ path: 'test-results/tamil-test-6-coaching.png', fullPage: true });

    pageContent = await page.content();
    hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
    console.log(`   Tamil in coaching: ${hasTamil ? 'YES' : 'No'}`);

    // PHASE 6: TEST KPI PAGE
    console.log('');
    console.log('PHASE 6: KPI PAGE');
    console.log('-'.repeat(40));
    await page.click('a:has-text("KPI")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('   KPI page loaded');
    await page.screenshot({ path: 'test-results/tamil-test-7-kpi.png', fullPage: true });

    pageContent = await page.content();
    hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
    console.log(`   Tamil in KPI: ${hasTamil ? 'YES' : 'No'}`);

    // PHASE 7: TEST KNOWLEDGE/ASK MAIYURI
    console.log('');
    console.log('PHASE 7: KNOWLEDGE PAGE');
    console.log('-'.repeat(40));
    await page.click('a:has-text("Knowledge")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('   Knowledge page loaded');
    await page.screenshot({ path: 'test-results/tamil-test-8-knowledge.png', fullPage: true });

    // Try Ask Maiyuri chatbot
    const askMaiyuriBtn = page.locator('button:has-text("Ask Maiyuri")');
    if (await askMaiyuriBtn.isVisible().catch(() => false)) {
      console.log('   Opening Ask Maiyuri...');
      await askMaiyuriBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/tamil-test-9-ask-maiyuri.png', fullPage: true });

      // Ask a question
      const chatInput = page.locator('input[placeholder*="Ask"]').first();
      if (await chatInput.isVisible().catch(() => false)) {
        await chatInput.fill('What types of bricks do you offer?');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'test-results/tamil-test-10-chat-response.png', fullPage: true });

        pageContent = await page.content();
        hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
        console.log(`   Tamil in chat response: ${hasTamil ? 'YES' : 'No'}`);
      }
    }

    // SUMMARY
    console.log('');
    console.log('='.repeat(50));
    console.log('TEST COMPLETE');
    console.log('='.repeat(50));
    console.log('');
    console.log('Tamil language is now ENABLED for this account.');
    console.log('AI-generated content will be displayed in Tamil.');
    console.log('');
    console.log('Screenshots saved to test-results/tamil-test-*.png');

  } catch (error) {
    console.error('');
    console.error('TEST ERROR:', error.message);
    await page.screenshot({ path: 'test-results/tamil-test-error.png' });
  } finally {
    await browser.close();
  }
}

testWithTamilEnabled();
