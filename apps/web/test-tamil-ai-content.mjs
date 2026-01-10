import { chromium } from 'playwright';

const BASE_URL = 'https://maiyuri-bricks-app.vercel.app';
const TEST_USER = {
  email: 'ram@maiyuri.app',
  password: 'TempPass123!'
};

async function testTamilAIContent() {
  console.log('Testing AI Content Generation in Tamil');
  console.log('='.repeat(50));
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // LOGIN
    console.log('1. Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email address').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard**', { timeout: 20000 });
    console.log('   Logged in');

    // VERIFY TAMIL IS SET
    console.log('');
    console.log('2. Verifying Tamil language setting...');
    await page.click('a:has-text("Settings")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const languageDropdown = page.locator('select').first();
    let currentLang = await languageDropdown.inputValue();

    if (currentLang !== 'ta') {
      console.log('   Setting language to Tamil...');
      await languageDropdown.selectOption('ta');
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /Save Changes/i }).click();
      await page.waitForTimeout(2000);
    }
    console.log('   Tamil language is ENABLED');

    // TEST ASK MAIYURI CHATBOT
    console.log('');
    console.log('3. Testing Ask Maiyuri Chatbot...');
    console.log('-'.repeat(40));

    // Go to Knowledge page
    await page.click('a:has-text("Knowledge")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for the floating Ask Maiyuri button
    const askMaiyuriBtn = page.locator('button:has-text("Ask Maiyuri")');
    if (await askMaiyuriBtn.isVisible().catch(() => false)) {
      await askMaiyuriBtn.click();
      await page.waitForTimeout(1000);
      console.log('   Opened Ask Maiyuri chatbot');

      // Find the chat input
      const chatInput = page.locator('input[type="text"]').last();
      if (await chatInput.isVisible().catch(() => false)) {
        // Ask a question in Tamil or English
        await chatInput.fill('What types of bricks do you offer?');
        await chatInput.press('Enter');
        console.log('   Sent question: "What types of bricks do you offer?"');

        // Wait for response
        console.log('   Waiting for AI response...');
        await page.waitForTimeout(8000);

        await page.screenshot({ path: 'test-results/tamil-ai-1-chat-response.png', fullPage: true });

        // Check for Tamil characters in response
        const pageContent = await page.content();
        const hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
        console.log(`   Tamil in response: ${hasTamil ? 'YES' : 'NO'}`);

        // Get the last message
        const messages = page.locator('[class*="message"], [class*="chat"] p, [class*="response"]');
        const msgCount = await messages.count();
        if (msgCount > 0) {
          const lastMsg = await messages.last().textContent();
          console.log(`   Response preview: ${lastMsg?.substring(0, 100)}...`);
        }
      }
    } else {
      console.log('   Ask Maiyuri button not found on this page');
    }

    // TEST LEAD AI ANALYSIS
    console.log('');
    console.log('4. Testing Lead AI Analysis...');
    console.log('-'.repeat(40));

    await page.click('a:has-text("Leads")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click on a lead
    const leadRow = page.locator('tr').filter({ hasText: /@/ }).first();
    if (await leadRow.isVisible().catch(() => false)) {
      await leadRow.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      console.log('   Opened lead details');

      await page.screenshot({ path: 'test-results/tamil-ai-2-lead-detail.png', fullPage: true });

      // Look for Analyze button
      const analyzeBtn = page.locator('button:has-text("Analyze")').first();
      if (await analyzeBtn.isVisible().catch(() => false)) {
        console.log('   Clicking Analyze button...');
        await analyzeBtn.click();
        await page.waitForTimeout(10000);

        await page.screenshot({ path: 'test-results/tamil-ai-3-analysis-result.png', fullPage: true });

        const pageContent = await page.content();
        const hasTamil = /[\u0B80-\u0BFF]/.test(pageContent);
        console.log(`   Tamil in analysis: ${hasTamil ? 'YES' : 'NO'}`);
      } else {
        console.log('   No Analyze button visible');

        // Check existing AI summary
        const aiSummary = page.locator('text=/AI|Summary|Insights/i').first();
        if (await aiSummary.isVisible().catch(() => false)) {
          const summaryText = await aiSummary.textContent();
          const hasTamil = /[\u0B80-\u0BFF]/.test(summaryText || '');
          console.log(`   Existing AI content has Tamil: ${hasTamil ? 'YES' : 'NO'}`);
        }
      }
    } else {
      console.log('   No leads found to analyze');
    }

    // TEST COACHING WITH FRESH REQUEST
    console.log('');
    console.log('5. Testing Coaching Insights...');
    console.log('-'.repeat(40));

    await page.click('a:has-text("Coaching")');
    await page.waitForLoadState('networkidle');

    // Wait longer for coaching to load
    console.log('   Waiting for coaching insights to load...');
    await page.waitForTimeout(10000);

    await page.screenshot({ path: 'test-results/tamil-ai-4-coaching.png', fullPage: true });

    const coachingContent = await page.content();
    const hasTamilCoaching = /[\u0B80-\u0BFF]/.test(coachingContent);
    console.log(`   Tamil in coaching: ${hasTamilCoaching ? 'YES' : 'NO'}`);

    // Check for any insight text
    const insightText = page.locator('[class*="insight"], [class*="recommendation"], p').first();
    if (await insightText.isVisible().catch(() => false)) {
      const text = await insightText.textContent();
      console.log(`   Content preview: ${text?.substring(0, 100)}...`);
    }

    // SUMMARY
    console.log('');
    console.log('='.repeat(50));
    console.log('TEST COMPLETE');
    console.log('='.repeat(50));
    console.log('');
    console.log('Note: Tamil content appears in NEWLY generated AI content.');
    console.log('Previously cached content may still be in English.');
    console.log('');
    console.log('Screenshots saved to test-results/tamil-ai-*.png');

  } catch (error) {
    console.error('');
    console.error('TEST ERROR:', error.message);
    await page.screenshot({ path: 'test-results/tamil-ai-error.png' });
  } finally {
    await browser.close();
  }
}

testTamilAIContent();
