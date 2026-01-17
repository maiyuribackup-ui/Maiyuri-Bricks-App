import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'https://maiyuri-bricks-app.vercel.app';

if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
  console.error('Error: E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required');
  process.exit(1);
}

const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

async function testLogin() {
  console.log('🚀 Starting login test with new branding...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Go to login page
    console.log('1️⃣ Navigating to login page...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // 2. Check for logo
    console.log('2️⃣ Checking for logo...');
    const logo = page.locator('img[alt="Maiyuri Bricks"]');
    const logoVisible = await logo.isVisible({ timeout: 5000 });
    console.log(`   Logo visible: ${logoVisible ? '✅ YES' : '❌ NO'}`);

    // 3. Check page title
    const title = await page.locator('h1').textContent();
    console.log(`   Title: ${title}`);

    // 4. Check tagline
    const tagline = await page.locator('text=AI-Powered Lead Management').isVisible();
    console.log(`   Tagline visible: ${tagline ? '✅ YES' : '❌ NO'}`);

    // 5. Fill login form
    console.log('\n3️⃣ Filling login form...');
    await page.getByLabel('Email address').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);

    // 6. Take screenshot before login
    await page.screenshot({ path: 'test-results/branding-before-login.png' });
    console.log('   Screenshot saved: branding-before-login.png');

    // 7. Click login
    console.log('\n4️⃣ Clicking Sign in button...');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // 8. Wait for redirect
    console.log('5️⃣ Waiting for redirect to dashboard...');
    await page.waitForURL('**/dashboard**', { timeout: 20000 });
    console.log('   ✅ Successfully redirected to dashboard!');

    // 9. Check dashboard logo
    console.log('\n6️⃣ Checking dashboard branding...');
    await page.waitForLoadState('networkidle');
    const dashboardLogo = page.locator('img[alt="Maiyuri Bricks"]').first();
    const dashboardLogoVisible = await dashboardLogo.isVisible({ timeout: 5000 });
    console.log(`   Dashboard logo visible: ${dashboardLogoVisible ? '✅ YES' : '❌ NO'}`);

    // 10. Take screenshot of dashboard
    await page.screenshot({ path: 'test-results/branding-dashboard.png', fullPage: true });
    console.log('   Screenshot saved: branding-dashboard.png');

    console.log('\n✅ LOGIN TEST PASSED - Branding verified on both login and dashboard!');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: 'test-results/branding-error.png' });
    console.log('   Error screenshot saved: branding-error.png');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testLogin();
