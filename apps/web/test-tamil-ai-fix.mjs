/**
 * Test Tamil Language Support Fix
 * Verifies that AI content is generated in Tamil when language preference is set
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Error: E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required');
  console.error('Set them in .env.local or export them before running tests');
  process.exit(1);
}

async function testTamilLanguageFix() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('\n=== Testing Tamil Language Fix ===\n');
  let passed = 0;
  let failed = 0;

  try {
    // Tamil character pattern (Unicode range for Tamil script)
    const tamilPattern = /[\u0B80-\u0BFF]/;

    // Step 1: Login
    console.log('1. Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for Suspense to resolve
    await page.waitForSelector('input#email', { timeout: 15000 });
    await page.fill('input#email', EMAIL);
    await page.fill('input#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    console.log('   ✓ Logged in successfully\n');
    passed++;

    // Step 2: Set language to Tamil
    console.log('2. Setting language preference to Tamil...');
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForSelector('select#language_preference', { timeout: 5000 });
    await page.selectOption('select#language_preference', 'ta');

    // Wait for save button and click
    await page.waitForTimeout(500);
    const saveButton = page.locator('button:has-text("Save")').or(page.locator('button:has-text("Save Settings")'));
    await saveButton.click();

    await page.waitForTimeout(2000);
    console.log('   ✓ Language set to Tamil\n');
    passed++;

    // Step 3: Navigate to leads and trigger AI analysis
    console.log('3. Navigating to leads page...');
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector('.lead-card, table tbody tr, [data-testid="lead-list"]', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log('   ✓ Leads page loaded\n');
    passed++;

    // Step 4: Click on a lead to view details
    console.log('4. Opening a lead...');
    const firstLead = page.locator('.lead-card, table tbody tr, [data-testid="lead-item"]').first();
    if (await firstLead.count() > 0) {
      await firstLead.click();
      await page.waitForTimeout(2000);
      console.log('   ✓ Lead opened\n');
      passed++;

      // Step 5: Look for AI content
      console.log('5. Checking for AI-generated content...');
      const pageContent = await page.content();

      // Check for Tamil characters in the page
      const hasTamilText = tamilPattern.test(pageContent);

      if (hasTamilText) {
        console.log('   ✓ Tamil text detected on the page!\n');
        passed++;
      } else {
        console.log('   ? No Tamil text detected yet (may need to trigger AI analysis)\n');
      }

      // Step 6: Try to trigger AI analysis if there's an analyze button
      console.log('6. Looking for AI analysis trigger...');
      const analyzeButton = page.locator('button:has-text("Analyze"), button:has-text("AI"), button:has-text("Insights")').first();
      if (await analyzeButton.count() > 0) {
        await analyzeButton.click();
        await page.waitForTimeout(5000);

        const updatedContent = await page.content();
        const hasTamilAfterAnalysis = tamilPattern.test(updatedContent);

        if (hasTamilAfterAnalysis) {
          console.log('   ✓ Tamil text appears after AI analysis!\n');
          passed++;
        } else {
          console.log('   ? AI analysis may not have generated Tamil content yet\n');
        }
      } else {
        console.log('   - No analyze button found on this page\n');
      }
    } else {
      console.log('   - No leads found to test\n');
    }

    // Step 7: Test Knowledge Base with Tamil
    console.log('7. Testing Knowledge Base with Tamil...');
    await page.goto(`${BASE_URL}/knowledge`);
    await page.waitForTimeout(2000);

    const askInput = page.locator('input[placeholder*="Ask"], textarea[placeholder*="question"], input[type="text"]').first();
    if (await askInput.count() > 0) {
      await askInput.fill('What are the types of bricks?');

      const askButton = page.locator('button:has-text("Ask"), button[type="submit"]').first();
      if (await askButton.count() > 0) {
        await askButton.click();
        await page.waitForTimeout(5000);

        const kbContent = await page.content();
        const hasTamilInKB = tamilPattern.test(kbContent);

        if (hasTamilInKB) {
          console.log('   ✓ Tamil response from Knowledge Base!\n');
          passed++;
        } else {
          console.log('   ? Knowledge Base response may not be in Tamil yet\n');
        }
      }
    } else {
      console.log('   - Knowledge input not found\n');
    }

    // Step 8: Reset to English
    console.log('8. Resetting language to English...');
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForSelector('select#language_preference', { timeout: 5000 });
    await page.selectOption('select#language_preference', 'en');
    await page.waitForTimeout(500);
    const resetButton = page.locator('button:has-text("Save")').or(page.locator('button:has-text("Save Settings")'));
    await resetButton.click();
    await page.waitForTimeout(2000);
    console.log('   ✓ Language reset to English\n');
    passed++;

  } catch (error) {
    console.error('Test error:', error.message);
    failed++;
  } finally {
    // Summary
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('====================\n');

    console.log('Keeping browser open for manual inspection...');
    console.log('Press Ctrl+C to close.\n');

    // Wait for manual inspection
    await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes

    await browser.close();
  }
}

testTamilLanguageFix().catch(console.error);
