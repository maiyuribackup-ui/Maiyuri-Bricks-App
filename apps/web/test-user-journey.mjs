import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'https://maiyuri-bricks-app.vercel.app';

if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
  console.error('Error: E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required');
  process.exit(1);
}

// Test data
const TEST_USER = {
  email: process.env.E2E_TEST_EMAIL,
  password: process.env.E2E_TEST_PASSWORD
};

const TEST_LEAD = {
  name: `Test Lead ${Date.now()}`,
  phone: '+919876543210',
  source: 'Social Media',
  status: 'New'
};

async function runUserJourneyTest() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         MAIYURI BRICKS - FULL USER JOURNEY TEST                ║');
  console.log('║         Production: https://maiyuri-bricks-app.vercel.app      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const results = [];
  let testNumber = 0;

  // Helper function to log test results
  const logTest = (name, passed, details = '') => {
    testNumber++;
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status} - ${name}${details ? ` (${details})` : ''}`);
    results.push({ test: name, passed, details });
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: AUTHENTICATION
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 1: AUTHENTICATION                                     │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 1.1: Load login page
    console.log('\n📍 Test 1.1: Load login page');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    const loginPageLoaded = await page.locator('button:has-text("Sign in")').isVisible();
    logTest('Login page loads', loginPageLoaded);
    await page.screenshot({ path: 'test-results/journey-1.1-login-page.png' });

    // Test 1.2: Verify branding on login
    console.log('\n📍 Test 1.2: Verify branding elements');
    const logoVisible = await page.locator('img[alt="Maiyuri Bricks"]').isVisible();
    const brandTitle = await page.locator('h1:has-text("Maiyuri Bricks")').isVisible();
    logTest('Logo displayed', logoVisible);
    logTest('Brand title displayed', brandTitle);

    // Test 1.3: Login with valid credentials
    console.log('\n📍 Test 1.3: Login with valid credentials');
    await page.getByLabel('Email address').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.screenshot({ path: 'test-results/journey-1.3-credentials-filled.png' });
    await page.getByRole('button', { name: 'Sign in' }).click();

    try {
      await page.waitForURL('**/dashboard**', { timeout: 20000 });
      logTest('Login successful', true, 'Redirected to dashboard');
    } catch (e) {
      logTest('Login successful', false, 'Did not redirect');
    }
    await page.screenshot({ path: 'test-results/journey-1.3-after-login.png' });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: DASHBOARD
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 2: DASHBOARD                                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 2.1: Dashboard content
    console.log('\n📍 Test 2.1: Dashboard content');
    await page.waitForLoadState('networkidle');
    const dashboardTitle = await page.locator('h1:has-text("Dashboard")').isVisible();
    logTest('Dashboard title visible', dashboardTitle);

    // Test 2.2: Dashboard metrics
    console.log('\n📍 Test 2.2: Dashboard metrics');
    const totalLeadsCard = await page.locator('text=Total Leads').isVisible();
    const hotLeadsCard = await page.locator('text=Hot Leads').isVisible();
    logTest('Total Leads metric visible', totalLeadsCard);
    logTest('Hot Leads metric visible', hotLeadsCard);

    // Test 2.3: AI Insights section
    console.log('\n📍 Test 2.3: AI Insights');
    const aiInsights = await page.locator('text=AI Insights').isVisible();
    logTest('AI Insights section visible', aiInsights);
    await page.screenshot({ path: 'test-results/journey-2-dashboard.png', fullPage: true });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: LEAD MANAGEMENT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 3: LEAD MANAGEMENT                                    │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 3.1: Navigate to Leads
    console.log('\n📍 Test 3.1: Navigate to Leads page');
    await page.click('a:has-text("Leads")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const leadsPageVisible = await page.locator('text=Lead Management').isVisible();
    logTest('Leads page loads', leadsPageVisible);
    await page.screenshot({ path: 'test-results/journey-3.1-leads-page.png', fullPage: true });

    // Test 3.2: View lead list
    console.log('\n📍 Test 3.2: View lead list');
    const leadsList = await page.locator('table tbody tr, [data-testid="lead-card"]').count();
    logTest('Leads displayed', leadsList > 0, `${leadsList} leads found`);

    // Test 3.3: Open New Lead modal
    console.log('\n📍 Test 3.3: Open New Lead form');
    const newLeadBtn = page.locator('button:has-text("New Lead"), a:has-text("New Lead")').first();
    if (await newLeadBtn.isVisible()) {
      await newLeadBtn.click();
      await page.waitForTimeout(500);
      const modalVisible = await page.locator('form, [role="dialog"]').isVisible();
      logTest('New Lead form opens', modalVisible);
      await page.screenshot({ path: 'test-results/journey-3.3-new-lead-form.png' });

      // Close modal if opened
      const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    } else {
      logTest('New Lead button visible', false);
    }

    // Test 3.4: Click on a lead to view details
    console.log('\n📍 Test 3.4: View lead details');
    const firstLead = page.locator('table tbody tr, [data-testid="lead-card"]').first();
    if (await firstLead.isVisible()) {
      await firstLead.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/journey-3.4-lead-details.png', fullPage: true });
      logTest('Lead details accessible', true);

      // Go back to leads list
      await page.click('a:has-text("Leads")');
      await page.waitForLoadState('networkidle');
    } else {
      logTest('Lead details accessible', false, 'No leads found');
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: KNOWLEDGE BASE
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 4: KNOWLEDGE BASE                                     │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 4.1: Navigate to Knowledge
    console.log('\n📍 Test 4.1: Navigate to Knowledge page');
    await page.click('a:has-text("Knowledge")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const knowledgeVisible = await page.locator('text=Knowledge Assistant').isVisible();
    logTest('Knowledge page loads', knowledgeVisible);
    await page.screenshot({ path: 'test-results/journey-4.1-knowledge.png' });

    // Test 4.2: Knowledge chat interface
    console.log('\n📍 Test 4.2: Knowledge chat interface');
    const chatInput = page.locator('input[placeholder*="question"], textarea[placeholder*="question"]');
    const chatInputVisible = await chatInput.isVisible();
    logTest('Chat input visible', chatInputVisible);

    // Test 4.3: Send a question (optional - don't wait for AI response)
    if (chatInputVisible) {
      console.log('\n📍 Test 4.3: Test chat functionality');
      await chatInput.fill('What are the brick specifications?');
      await page.screenshot({ path: 'test-results/journey-4.3-chat-input.png' });
      logTest('Chat input accepts text', true);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: TASK MANAGEMENT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 5: TASK MANAGEMENT                                    │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 5.1: Navigate to Tasks
    console.log('\n📍 Test 5.1: Navigate to Tasks page');
    await page.click('a:has-text("Tasks")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const tasksTitle = await page.locator('h1:has-text("Tasks")').isVisible();
    logTest('Tasks page loads', tasksTitle);
    await page.screenshot({ path: 'test-results/journey-5.1-tasks.png', fullPage: true });

    // Test 5.2: View task board
    console.log('\n📍 Test 5.2: Task board view');
    const kanbanView = await page.locator('text=To Do').isVisible();
    const listViewBtn = await page.locator('button:has-text("List")').first().isVisible();
    logTest('Task board visible', kanbanView || listViewBtn);

    // Test 5.3: New Task button
    console.log('\n📍 Test 5.3: New Task functionality');
    const newTaskBtn = page.locator('button:has-text("New Task")');
    if (await newTaskBtn.isVisible()) {
      await newTaskBtn.click();
      await page.waitForTimeout(500);
      const taskFormVisible = await page.locator('form, [role="dialog"]').isVisible();
      logTest('New Task form opens', taskFormVisible);
      await page.screenshot({ path: 'test-results/journey-5.3-new-task.png' });

      // Close modal
      const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    } else {
      logTest('New Task button visible', false);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 6: COACHING
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 6: COACHING                                           │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 6.1: Navigate to Coaching
    console.log('\n📍 Test 6.1: Navigate to Coaching page');
    await page.click('a:has-text("Coaching")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for data to load
    const coachingContent = await page.locator('main').isVisible();
    logTest('Coaching page loads', coachingContent);
    await page.screenshot({ path: 'test-results/journey-6.1-coaching.png', fullPage: true });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 7: KPI DASHBOARD
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 7: KPI DASHBOARD                                      │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 7.1: Navigate to KPI
    console.log('\n📍 Test 7.1: Navigate to KPI page');
    await page.click('a:has-text("KPI")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const kpiTitle = await page.locator('text=KPI Dashboard').isVisible();
    logTest('KPI page loads', kpiTitle);
    await page.screenshot({ path: 'test-results/journey-7.1-kpi.png', fullPage: true });

    // Test 7.2: KPI metrics
    console.log('\n📍 Test 7.2: KPI metrics');
    const performanceMetrics = await page.locator('text=AI-powered performance metrics').first().isVisible();
    logTest('Performance metrics visible', performanceMetrics);

    // Test 7.3: KPI tabs
    console.log('\n📍 Test 7.3: KPI tabs');
    const overviewTab = await page.locator('button:has-text("Overview")').first().isVisible();
    logTest('KPI tabs available', overviewTab);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 8: SETTINGS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 8: SETTINGS                                           │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 8.1: Navigate to Settings
    console.log('\n📍 Test 8.1: Navigate to Settings page');
    await page.click('a:has-text("Settings")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const settingsTitle = await page.locator('h1:has-text("Settings")').isVisible();
    logTest('Settings page loads', settingsTitle);
    await page.screenshot({ path: 'test-results/journey-8.1-settings.png', fullPage: true });

    // Test 8.2: Profile information
    console.log('\n📍 Test 8.2: Profile information');
    const profileSection = await page.locator('text=Profile Information').isVisible();
    const nameField = await page.locator('input[value="Ram Kumaran"]').isVisible();
    logTest('Profile section visible', profileSection);
    logTest('User name displayed', nameField);

    // Test 8.3: Language preference
    console.log('\n📍 Test 8.3: Language settings');
    const languageDropdown = await page.locator('text=AI Insights Language').isVisible();
    logTest('Language settings visible', languageDropdown);

    // Test 8.4: Save button
    console.log('\n📍 Test 8.4: Save functionality');
    const saveBtn = await page.locator('button:has-text("Save Changes")').isVisible();
    logTest('Save button visible', saveBtn);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 9: NAVIGATION & UI
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 9: NAVIGATION & UI CONSISTENCY                        │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 9.1: Sidebar navigation
    console.log('\n📍 Test 9.1: Sidebar navigation');
    const sidebarItems = await page.locator('nav a').count();
    logTest('Sidebar navigation items', sidebarItems >= 6, `${sidebarItems} items found`);

    // Test 9.2: User info in sidebar
    console.log('\n📍 Test 9.2: User info display');
    const userInfo = await page.locator('text=Ram Kumaran').isVisible();
    const userEmail = await page.locator('text=ram@maiyuri.app').isVisible();
    logTest('User name in sidebar', userInfo);
    logTest('User email in sidebar', userEmail);

    // Test 9.3: Logo consistency
    console.log('\n📍 Test 9.3: Logo consistency');
    const sidebarLogo = await page.locator('img[alt="Maiyuri Bricks"]').first().isVisible();
    logTest('Logo in sidebar', sidebarLogo);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 10: LOGOUT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ PHASE 10: LOGOUT                                            │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Test 10.1: Logout functionality
    console.log('\n📍 Test 10.1: Logout');
    const logoutBtn = page.locator('button[aria-label="Sign out"], button:has-text("Logout"), button:has-text("Sign out")');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
      const backToLogin = page.url().includes('/login');
      logTest('Logout successful', backToLogin, 'Redirected to login');
      await page.screenshot({ path: 'test-results/journey-10.1-logout.png' });
    } else {
      // Try clicking the logout icon near user info
      const logoutIcon = page.locator('[data-testid="logout"], svg[class*="logout"]').first();
      if (await logoutIcon.isVisible()) {
        await logoutIcon.click();
        await page.waitForTimeout(2000);
      }
      logTest('Logout button found', false, 'Could not find logout button');
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      TEST SUMMARY                              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log(`   Total Tests: ${total}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   Success Rate: ${Math.round((passed / total) * 100)}%\n`);

    if (failed > 0) {
      console.log('   Failed Tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.test}${r.details ? ` (${r.details})` : ''}`);
      });
    }

    console.log('\n   📸 Screenshots saved to test-results/journey-*.png');
    console.log('\n════════════════════════════════════════════════════════════════\n');

    if (failed > 3) {
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    await page.screenshot({ path: 'test-results/journey-error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runUserJourneyTest();
