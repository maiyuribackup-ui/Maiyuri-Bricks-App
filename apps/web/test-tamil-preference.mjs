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

async function testTamilPreference() {
  console.log('Testing Tamil Language Preference Functionality');
  console.log('='.repeat(50));
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const results = [];

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
    results.push({ test: 'Login', status: 'PASS' });

    // PHASE 2: NAVIGATE TO SETTINGS
    console.log('');
    console.log('PHASE 2: NAVIGATE TO SETTINGS');
    console.log('-'.repeat(40));
    await page.click('a:has-text("Settings")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const settingsTitle = await page.locator('h1:has-text("Settings")').isVisible();
    console.log(`   Settings page loaded: ${settingsTitle ? 'PASS' : 'FAIL'}`);
    results.push({ test: 'Settings page loads', status: settingsTitle ? 'PASS' : 'FAIL' });
    await page.screenshot({ path: 'test-results/tamil-1-settings-page.png', fullPage: true });

    // PHASE 3: CHECK CURRENT LANGUAGE SETTING
    console.log('');
    console.log('PHASE 3: CHECK LANGUAGE DROPDOWN');
    console.log('-'.repeat(40));

    // Wait for profile form to load
    await page.waitForSelector('select', { timeout: 10000 });

    // Find the language dropdown
    const languageDropdown = page.locator('select').first();
    const currentValue = await languageDropdown.inputValue();
    console.log(`   Current language preference: ${currentValue === 'en' ? 'English' : 'Tamil'}`);
    results.push({ test: 'Language dropdown found', status: 'PASS' });

    // PHASE 4: CHANGE TO TAMIL
    console.log('');
    console.log('PHASE 4: CHANGE LANGUAGE TO TAMIL');
    console.log('-'.repeat(40));

    // Select Tamil
    await languageDropdown.selectOption('ta');
    await page.waitForTimeout(500);

    const newValue = await languageDropdown.inputValue();
    const tamilSelected = newValue === 'ta';
    console.log(`   Tamil selected: ${tamilSelected ? 'PASS' : 'FAIL'}`);
    results.push({ test: 'Tamil option selected', status: tamilSelected ? 'PASS' : 'FAIL' });

    await page.screenshot({ path: 'test-results/tamil-2-tamil-selected.png', fullPage: true });

    // PHASE 5: SAVE CHANGES
    console.log('');
    console.log('PHASE 5: SAVE CHANGES');
    console.log('-'.repeat(40));

    const saveButton = page.getByRole('button', { name: /Save Changes/i });
    await saveButton.click();

    // Wait for save confirmation
    await page.waitForTimeout(2000);

    // Check for success message
    const savedMessage = await page.locator('text=Saved successfully').isVisible().catch(() => false);
    console.log(`   Save confirmation: ${savedMessage ? 'PASS' : 'Checking...'}`);

    await page.screenshot({ path: 'test-results/tamil-3-saved.png', fullPage: true });
    results.push({ test: 'Settings saved', status: savedMessage ? 'PASS' : 'CHECK' });

    // PHASE 6: VERIFY PERSISTENCE - REFRESH PAGE
    console.log('');
    console.log('PHASE 6: VERIFY PERSISTENCE');
    console.log('-'.repeat(40));

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check if Tamil is still selected
    const refreshedDropdown = page.locator('select').first();
    const persistedValue = await refreshedDropdown.inputValue();
    const persisted = persistedValue === 'ta';
    console.log(`   Tamil persisted after refresh: ${persisted ? 'PASS' : 'FAIL'}`);
    results.push({ test: 'Language preference persisted', status: persisted ? 'PASS' : 'FAIL' });

    await page.screenshot({ path: 'test-results/tamil-4-persisted.png', fullPage: true });

    // PHASE 7: TEST AI FEATURES WITH TAMIL
    console.log('');
    console.log('PHASE 7: TEST COACHING PAGE (AI Content)');
    console.log('-'.repeat(40));

    await page.click('a:has-text("Coaching")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const coachingLoaded = await page.locator('h1:has-text("Coaching")').isVisible();
    console.log(`   Coaching page loaded: ${coachingLoaded ? 'PASS' : 'FAIL'}`);
    results.push({ test: 'Coaching page loads', status: coachingLoaded ? 'PASS' : 'FAIL' });

    await page.screenshot({ path: 'test-results/tamil-5-coaching.png', fullPage: true });

    // Check if any Tamil text is visible (looking for common Tamil characters)
    const pageContent = await page.content();
    const hasTamilChars = /[\u0B80-\u0BFF]/.test(pageContent);
    console.log(`   Tamil characters in page: ${hasTamilChars ? 'YES (Expected for AI content)' : 'No Tamil content yet'}`);

    // PHASE 8: CHECK LEADS PAGE AI ANALYSIS
    console.log('');
    console.log('PHASE 8: CHECK LEADS PAGE');
    console.log('-'.repeat(40));

    await page.click('a:has-text("Leads")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const leadsLoaded = await page.locator('h1:has-text("Leads")').isVisible();
    console.log(`   Leads page loaded: ${leadsLoaded ? 'PASS' : 'FAIL'}`);
    results.push({ test: 'Leads page loads', status: leadsLoaded ? 'PASS' : 'FAIL' });

    await page.screenshot({ path: 'test-results/tamil-6-leads.png', fullPage: true });

    // PHASE 9: RESET TO ENGLISH (Cleanup)
    console.log('');
    console.log('PHASE 9: RESET TO ENGLISH');
    console.log('-'.repeat(40));

    await page.click('a:has-text("Settings")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const resetDropdown = page.locator('select').first();
    await resetDropdown.selectOption('en');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Save Changes/i }).click();
    await page.waitForTimeout(2000);

    const resetValue = await resetDropdown.inputValue();
    const resetSuccess = resetValue === 'en';
    console.log(`   Reset to English: ${resetSuccess ? 'PASS' : 'FAIL'}`);
    results.push({ test: 'Reset to English', status: resetSuccess ? 'PASS' : 'FAIL' });

    await page.screenshot({ path: 'test-results/tamil-7-reset.png', fullPage: true });

    // SUMMARY
    console.log('');
    console.log('='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const check = results.filter(r => r.status === 'CHECK').length;

    results.forEach(r => {
      const icon = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'CHECK';
      console.log(`   ${icon}: ${r.test}`);
    });

    console.log('');
    console.log(`Total: ${passed} passed, ${failed} failed, ${check} needs verification`);
    console.log(`Success Rate: ${Math.round((passed / results.length) * 100)}%`);
    console.log('');
    console.log('Screenshots saved to test-results/tamil-*.png');

  } catch (error) {
    console.error('');
    console.error('TEST FAILED:', error.message);
    await page.screenshot({ path: 'test-results/tamil-error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testTamilPreference();
