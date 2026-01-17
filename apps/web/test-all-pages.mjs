import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'https://maiyuri-bricks-app.vercel.app';

if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
  console.error('Error: E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required');
  process.exit(1);
}

const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

async function testAllPages() {
  console.log('🚀 Starting comprehensive page test...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const results = [];

  try {
    // 1. LOGIN PAGE
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1️⃣  LOGIN PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const loginLogo = await page.locator('img[alt="Maiyuri Bricks"]').isVisible();
    const loginTitle = await page.locator('h1:has-text("Maiyuri Bricks")').isVisible();
    const signInBtn = await page.getByRole('button', { name: 'Sign in' }).isVisible();

    console.log(`   Logo: ${loginLogo ? '✅' : '❌'}`);
    console.log(`   Title: ${loginTitle ? '✅' : '❌'}`);
    console.log(`   Sign In Button: ${signInBtn ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-1-login.png' });
    results.push({ page: 'Login', status: loginLogo && loginTitle ? '✅ PASS' : '❌ FAIL' });

    // LOGIN
    console.log('\n   Logging in...');
    await page.getByLabel('Email address').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard**', { timeout: 20000 });
    console.log('   ✅ Logged in successfully\n');

    // 2. DASHBOARD PAGE
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('2️⃣  DASHBOARD PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.waitForLoadState('networkidle');

    const dashLogo = await page.locator('img[alt="Maiyuri Bricks"]').first().isVisible();
    const dashTitle = await page.locator('h1:has-text("Dashboard")').isVisible();
    const sidebarNav = await page.locator('nav').first().isVisible();

    console.log(`   Sidebar Logo: ${dashLogo ? '✅' : '❌'}`);
    console.log(`   Dashboard Title: ${dashTitle ? '✅' : '❌'}`);
    console.log(`   Navigation: ${sidebarNav ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-2-dashboard.png', fullPage: true });
    results.push({ page: 'Dashboard', status: dashTitle ? '✅ PASS' : '❌ FAIL' });

    // 3. LEADS PAGE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('3️⃣  LEADS PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.click('a:has-text("Leads")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const leadsTitle = await page.locator('h1:has-text("Leads")').isVisible();
    const leadsTable = await page.locator('table').isVisible().catch(() => false);
    const newLeadBtn = await page.locator('button:has-text("New Lead"), a:has-text("New Lead")').first().isVisible().catch(() => false);

    console.log(`   Leads Title: ${leadsTitle ? '✅' : '❌'}`);
    console.log(`   Leads Table/List: ${leadsTable ? '✅' : '❌'}`);
    console.log(`   New Lead Button: ${newLeadBtn ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-3-leads.png', fullPage: true });
    results.push({ page: 'Leads', status: leadsTitle ? '✅ PASS' : '❌ FAIL' });

    // 4. KNOWLEDGE PAGE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('4️⃣  KNOWLEDGE PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.click('a:has-text("Knowledge")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const knowledgeTitle = await page.locator('h1:has-text("Knowledge")').isVisible();
    const knowledgeContent = await page.locator('main').isVisible();

    console.log(`   Knowledge Title: ${knowledgeTitle ? '✅' : '❌'}`);
    console.log(`   Content Area: ${knowledgeContent ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-4-knowledge.png', fullPage: true });
    results.push({ page: 'Knowledge', status: knowledgeTitle ? '✅ PASS' : '❌ FAIL' });

    // 5. TASKS PAGE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('5️⃣  TASKS PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.click('a:has-text("Tasks")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const tasksTitle = await page.locator('h1:has-text("Tasks")').isVisible();
    const tasksContent = await page.locator('main').isVisible();

    console.log(`   Tasks Title: ${tasksTitle ? '✅' : '❌'}`);
    console.log(`   Content Area: ${tasksContent ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-5-tasks.png', fullPage: true });
    results.push({ page: 'Tasks', status: tasksTitle ? '✅ PASS' : '❌ FAIL' });

    // 6. COACHING PAGE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('6️⃣  COACHING PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.click('a:has-text("Coaching")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const coachingTitle = await page.locator('h1:has-text("Coaching")').isVisible();
    const coachingContent = await page.locator('main').isVisible();

    console.log(`   Coaching Title: ${coachingTitle ? '✅' : '❌'}`);
    console.log(`   Content Area: ${coachingContent ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-6-coaching.png', fullPage: true });
    results.push({ page: 'Coaching', status: coachingTitle ? '✅ PASS' : '❌ FAIL' });

    // 7. KPI PAGE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('7️⃣  KPI PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.click('a:has-text("KPI")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const kpiTitle = await page.locator('h1:has-text("KPI")').isVisible();
    const kpiContent = await page.locator('main').isVisible();

    console.log(`   KPI Title: ${kpiTitle ? '✅' : '❌'}`);
    console.log(`   Content Area: ${kpiContent ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-7-kpi.png', fullPage: true });
    results.push({ page: 'KPI', status: kpiTitle ? '✅ PASS' : '❌ FAIL' });

    // 8. SETTINGS PAGE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('8️⃣  SETTINGS PAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.click('a:has-text("Settings")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const settingsTitle = await page.locator('h1:has-text("Settings")').isVisible();
    const settingsContent = await page.locator('main').isVisible();

    console.log(`   Settings Title: ${settingsTitle ? '✅' : '❌'}`);
    console.log(`   Content Area: ${settingsContent ? '✅' : '❌'}`);
    await page.screenshot({ path: 'test-results/page-8-settings.png', fullPage: true });
    results.push({ page: 'Settings', status: settingsTitle ? '✅ PASS' : '❌ FAIL' });

    // SUMMARY
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    results.forEach(r => console.log(`   ${r.page}: ${r.status}`));

    const passed = results.filter(r => r.status.includes('PASS')).length;
    const total = results.length;
    console.log(`\n   Total: ${passed}/${total} pages passed`);
    console.log('\n✅ All page screenshots saved to test-results/');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: 'test-results/error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testAllPages();
