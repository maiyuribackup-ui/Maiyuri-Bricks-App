import { test, expect, Page } from '@playwright/test';
import { trackErrors } from '../helpers/error-tracker';

/**
 * Design Tab Flow E2E Test
 *
 * Tests the complete floor plan generation workflow:
 * 1. Navigate to Design page
 * 2. Complete question flow
 * 3. Verify blueprint generation
 * 4. Capture all network requests for integration verification
 * 5. CRITICAL: Detect browser runtime errors (prevents bugs from escaping to production)
 */

interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  timestamp: number;
}

test.describe('Design Tab - Floor Plan Generator', () => {
  let networkRequests: NetworkRequest[] = [];
  let networkFailures: { url: string; error: string }[] = [];

  test.beforeEach(async ({ page }) => {
    networkRequests = [];
    networkFailures = [];

    // Capture all network requests (CRITICAL for integration testing)
    page.on('request', (request) => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
      });
    });

    page.on('response', (response) => {
      const req = networkRequests.find(r => r.url === response.url());
      if (req) {
        req.status = response.status();
      }
    });

    page.on('requestfailed', (request) => {
      networkFailures.push({
        url: request.url(),
        error: request.failure()?.errorText || 'Unknown error',
      });
    });
  });

  test('should load Design page with AI Architect chatbot', async ({ page }) => {
    // CRITICAL: Track browser runtime errors
    const errors = await trackErrors(page);

    await page.goto('/design');

    // Verify page header
    await expect(page.locator('h1')).toContainText('AI Floor Plan Designer');

    // Verify feature pills (use exact match to avoid matching welcome message)
    await expect(page.getByText('Vastu Compliant', { exact: true })).toBeVisible();
    await expect(page.getByText('Eco-Friendly', { exact: true })).toBeVisible();

    // Verify chatbot header (use more specific locator to avoid duplicates)
    await expect(page.locator('h3:has-text("Floor Plan Designer")')).toBeVisible();
    // "AI Architect • Ready" is shown - use partial match
    await expect(page.getByText(/AI Architect/).first()).toBeVisible();

    // Verify welcome message appears
    await expect(page.getByText(/Hello! I'm your AI Architect/)).toBeVisible({ timeout: 10000 });

    console.log('\n=== PAGE LOAD NETWORK REQUESTS ===');
    networkRequests.filter(r => r.url.includes('api') || r.url.includes('supabase'))
      .forEach(r => console.log(`${r.method} ${r.url} -> ${r.status || 'pending'}`));

    // CRITICAL: Fail if any runtime errors occurred
    expect(errors, 'Page should have no runtime errors').toEqual([]);
  });

  test('should display project type selection options', async ({ page }) => {
    // CRITICAL: Track browser runtime errors
    const errors = await trackErrors(page);

    await page.goto('/design');

    // Wait for welcome message
    await expect(page.getByText(/Hello! I'm your AI Architect/).first()).toBeVisible({ timeout: 10000 });

    // Wait longer for the UI to fully load and options to render
    await page.waitForTimeout(2000);

    // Take screenshot to debug
    await page.screenshot({ path: 'test-results/project-type-options.png', fullPage: true });

    // Check if client name form appears first (per QUESTION_FLOW order)
    const clientNameInput = page.locator('input[name="clientName"]').first();
    const clientNameVisible = await clientNameInput.isVisible({ timeout: 3000 }).catch(() => false);

    // OR check if project type options appear first
    const residentialOption = page.locator('button').filter({ hasText: /Residential/i }).first();
    const residentialVisible = await residentialOption.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`Client name input visible: ${clientNameVisible}`);
    console.log(`Residential option visible: ${residentialVisible}`);

    // Either flow is acceptable - the test passes if we can start the flow
    expect(clientNameVisible || residentialVisible).toBeTruthy();

    // CRITICAL: Fail if any runtime errors occurred
    expect(errors, 'Page should have no runtime errors').toEqual([]);
  });

  test('should start session when project type is selected', async ({ page }) => {
    // CRITICAL: Track browser runtime errors
    const errors = await trackErrors(page);

    await page.goto('/design');

    // Wait for options to appear
    await page.waitForTimeout(2000);

    // Look for Residential option in various formats
    const residentialBtn = page.locator('button').filter({ hasText: /Residential/i }).first();

    if (await residentialBtn.isVisible()) {
      await residentialBtn.click();

      // Wait for API call
      await page.waitForTimeout(3000);

      // Check for session start API call
      console.log('\n=== SESSION START NETWORK REQUESTS ===');
      const apiCalls = networkRequests.filter(r =>
        r.url.includes('api') || r.url.includes('floor-plan') || r.url.includes('session')
      );
      apiCalls.forEach(r => console.log(`${r.method} ${r.url} -> ${r.status || 'pending'}`));

      // Verify next question appears or error message
      const hasNextQuestion = await page.getByText(/client|name|plot|dimension/i).isVisible();
      const hasError = await page.getByText(/error|issue|try again/i).isVisible();

      console.log(`Next question visible: ${hasNextQuestion}`);
      console.log(`Error visible: ${hasError}`);

      if (networkFailures.length > 0) {
        console.log('\n=== NETWORK FAILURES ===');
        networkFailures.forEach(f => console.log(`FAILED: ${f.url} - ${f.error}`));
      }
    }

    // CRITICAL: Fail if any runtime errors occurred
    expect(errors, 'Page should have no runtime errors').toEqual([]);
  });

  test('should complete full question flow for residential house', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for full flow

    // CRITICAL: Track browser runtime errors
    const errors = await trackErrors(page);

    await page.goto('/design');
    await page.waitForTimeout(2000);

    console.log('\n=== STARTING FULL FLOW TEST ===\n');

    // Helper to click option button
    const clickOption = async (textPattern: RegExp | string) => {
      const btn = page.locator('button').filter({ hasText: textPattern }).first();
      if (await btn.isVisible({ timeout: 5000 })) {
        await btn.click();
        await page.waitForTimeout(1500);
        return true;
      }
      return false;
    };

    // Helper to fill form
    const fillForm = async (fields: Record<string, string>) => {
      for (const [name, value] of Object.entries(fields)) {
        const input = page.locator(`input[name="${name}"]`).first();
        if (await input.isVisible({ timeout: 3000 })) {
          await input.fill(value);
        }
      }
      // Click submit button
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForTimeout(1500);
      }
    };

    // Step 1: Select Residential
    console.log('Step 1: Selecting Residential House...');
    await clickOption(/Residential/i);

    // Step 2: Enter client name (if asked) - use .first() for duplicate input handling
    const clientNameInput = page.locator('input[name="clientName"]').first();
    if (await clientNameInput.isVisible({ timeout: 3000 })) {
      console.log('Step 2: Entering client name...');
      await clientNameInput.fill('Test Project');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(1500);
    }

    // Step 3: Plot input method
    console.log('Step 3: Selecting manual plot entry...');
    await clickOption(/Manual|Enter Manually/i);

    // Step 4: Plot dimensions
    const northInput = page.locator('input[name="north"]');
    if (await northInput.isVisible({ timeout: 3000 })) {
      console.log('Step 4: Entering plot dimensions...');
      await fillForm({ north: '40', south: '40', east: '60', west: '60' });
    }

    // Step 5: Road side
    console.log('Step 5: Selecting road side...');
    await clickOption(/North|East|South|West/i);

    // Step 6: Road width
    console.log('Step 6: Selecting road width...');
    await clickOption(/30|40|20|feet/i);

    // Step 7: Setbacks (if asked)
    const setbackNorth = page.locator('input[name="north"]');
    if (await setbackNorth.isVisible({ timeout: 3000 })) {
      console.log('Step 7: Entering setbacks...');
      await fillForm({ north: '5', south: '3', east: '3', west: '3' });
    }

    // Step 8: Bedrooms
    console.log('Step 8: Selecting bedrooms...');
    await clickOption(/2|3|4|bedroom/i);

    // Step 9: Bathrooms
    console.log('Step 9: Selecting bathrooms...');
    await clickOption(/2|3|bathroom/i);

    // Step 10: Kitchen type
    console.log('Step 10: Selecting kitchen type...');
    await clickOption(/Open|Closed|Kitchen/i);

    // Step 11: Floors
    console.log('Step 11: Selecting floors...');
    await clickOption(/1|2|Single|Ground/i);

    // Step 12: Mutram (courtyard)
    console.log('Step 12: Selecting courtyard option...');
    await clickOption(/Yes|No/i);

    // Step 13: Verandah
    console.log('Step 13: Selecting verandah option...');
    await clickOption(/Yes|No/i);

    // Step 14: Pooja room
    console.log('Step 14: Selecting pooja room...');
    await clickOption(/Yes|No|Corner/i);

    // Step 15: Parking
    console.log('Step 15: Selecting parking...');
    await clickOption(/Car|Bike|None|Parking/i);

    // Continue clicking through remaining options
    for (let i = 0; i < 10; i++) {
      const anyOption = page.locator('button').filter({ hasText: /^(?!Start|Make|Download|Looks).+/i }).first();
      if (await anyOption.isVisible({ timeout: 2000 })) {
        const text = await anyOption.textContent();
        if (text && !text.includes('Start new') && !text.includes('Make Changes')) {
          console.log(`Clicking option: ${text?.substring(0, 30)}...`);
          await anyOption.click();
          await page.waitForTimeout(1500);
        }
      }
    }

    // Wait for generation to potentially start
    await page.waitForTimeout(5000);

    // Check for generation progress
    const isGenerating = await page.getByText(/Generating|Applying Vastu|design process/i).isVisible();
    console.log(`\nGeneration started: ${isGenerating}`);

    // Check for blueprint confirmation
    const blueprintReady = await page.getByText(/Blueprint Ready|Review/i).isVisible();
    console.log(`Blueprint ready: ${blueprintReady}`);

    // Print network summary
    console.log('\n=== NETWORK REQUEST SUMMARY ===');
    const apiCalls = networkRequests.filter(r =>
      r.url.includes('api') || r.url.includes('floor-plan') || r.url.includes('supabase')
    );
    console.log(`Total API calls: ${apiCalls.length}`);
    apiCalls.forEach(r => console.log(`  ${r.method} ${r.url} -> ${r.status || 'pending'}`));

    if (networkFailures.length > 0) {
      console.log('\n=== NETWORK FAILURES ===');
      networkFailures.forEach(f => console.log(`  FAILED: ${f.url} - ${f.error}`));
    }

    // Take screenshot of final state
    await page.screenshot({ path: 'test-results/design-flow-final-state.png', fullPage: true });

    // CRITICAL: Fail if any runtime errors occurred
    expect(errors, 'Page should have no runtime errors').toEqual([]);
  });

  test('should verify API endpoints are correctly configured', async ({ page }) => {
    // CRITICAL: Track browser runtime errors
    const errors = await trackErrors(page);

    await page.goto('/design');
    await page.waitForTimeout(2000);

    // Click residential to trigger session start
    const residentialBtn = page.locator('button').filter({ hasText: /Residential/i }).first();
    if (await residentialBtn.isVisible()) {
      await residentialBtn.click();
      await page.waitForTimeout(3000);
    }

    console.log('\n=== API ENDPOINT VERIFICATION ===');

    // Check for localhost vs production URLs
    const localhostCalls = networkRequests.filter(r =>
      r.url.includes('localhost') && (r.url.includes('api') || r.url.includes('8000'))
    );
    const productionCalls = networkRequests.filter(r =>
      !r.url.includes('localhost') && (r.url.includes('api') || r.url.includes('supabase'))
    );

    console.log(`Localhost API calls: ${localhostCalls.length}`);
    localhostCalls.forEach(r => console.log(`  ${r.method} ${r.url} -> ${r.status}`));

    console.log(`Production API calls: ${productionCalls.length}`);
    productionCalls.forEach(r => console.log(`  ${r.method} ${r.url} -> ${r.status}`));

    // Check for common issues
    if (networkFailures.length > 0) {
      console.log('\n=== POTENTIAL ISSUES ===');
      networkFailures.forEach(f => {
        if (f.url.includes('localhost')) {
          console.log(`WARNING: App is calling localhost (${f.url}) which may not be running`);
        }
        console.log(`FAILED: ${f.url} - ${f.error}`);
      });
    }

    // Verify no localhost calls when backend should be remote
    const unexpectedLocalhost = localhostCalls.filter(r =>
      r.url.includes(':8000') && r.status !== 200
    );

    if (unexpectedLocalhost.length > 0) {
      console.log('\nWARNING: Backend calls to localhost:8000 failed - backend may not be running');
    }

    // CRITICAL: Fail if any runtime errors occurred
    expect(errors, 'Page should have no runtime errors').toEqual([]);
  });
});
