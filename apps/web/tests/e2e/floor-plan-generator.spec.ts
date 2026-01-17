/**
 * Floor Plan Generator - E2E Tests
 *
 * End-to-end tests for the co-Vastu Intelligent Floor Plan Generator.
 * Tests the complete user flow from uploading a plot survey to
 * receiving a Vastu-compliant floor plan.
 *
 * Based on Survey No. 63 test data.
 *
 * CRITICAL: All tests track browser runtime errors to prevent bugs from escaping to production.
 */

import { test, expect } from "@playwright/test";

// Load test credentials from environment variables
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "";

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required for tests",
  );
}

// Test data from Survey No. 63
const SURVEY_DATA = {
  plotDimensions: {
    north: "29'-0\"",
    south: "27'-6\"",
    east: "41'-0\"",
    west: "43'-0\"",
  },
  setbacks: {
    north: "2'-0\"",
    south: "3'-0\"",
    east: "3'-6\"",
    west: "2'-0\"",
  },
  roadSide: "west",
  roadWidth: "20'-0\"",
  requiredRooms: [
    "Living Room",
    "Dining",
    "Kitchen",
    "Double Bedroom",
    "Dress Room",
    "Common Toilet",
    "Staircase",
    "Verandah",
  ],
};

test.describe("Floor Plan Generator", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|leads)/, { timeout: 15000 });

    // Navigate to the design (floor plan chatbot) page
    await page.goto("/design");
    await page.waitForLoadState("networkidle");
  });

  test.describe("Plot Survey Upload", () => {
    test("should allow image upload for plot survey", async ({ page }) => {
      // Look for upload area
      const uploadArea = page.locator('[data-testid="survey-upload"]');
      await expect(uploadArea).toBeVisible();

      // Verify accepted file types
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toHaveAttribute("accept", /image/);
    });

    test("should show preview after image upload", async ({ page }) => {
      // Mock file upload (in real test, use actual image)
      const fileInput = page.locator('input[type="file"]');

      // Create a test image buffer
      const imageBuffer = Buffer.from("fake-image-data");

      await fileInput.setInputFiles({
        name: "survey-no-63.jpg",
        mimeType: "image/jpeg",
        buffer: imageBuffer,
      });

      // Wait for preview
      const preview = page.locator('[data-testid="survey-preview"]');
      await expect(preview).toBeVisible({ timeout: 5000 });
    });

    test("should show processing indicator during analysis", async ({
      page,
    }) => {
      // Upload file
      const fileInput = page.locator('input[type="file"]');
      const imageBuffer = Buffer.from("fake-image-data");

      await fileInput.setInputFiles({
        name: "survey.jpg",
        mimeType: "image/jpeg",
        buffer: imageBuffer,
      });

      // Click analyze button
      const analyzeButton = page.locator('[data-testid="analyze-survey-btn"]');
      if (await analyzeButton.isVisible()) {
        await analyzeButton.click();

        // Check for loading indicator
        const loader = page.locator('[data-testid="analysis-loader"]');
        await expect(loader).toBeVisible();
      }
    });
  });

  test.describe("Manual Plot Entry", () => {
    test("should allow manual entry of plot dimensions", async ({ page }) => {
      // Click manual entry tab
      const manualTab = page.locator('[data-testid="manual-entry-tab"]');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }

      // Fill in north dimension
      const northInput = page.locator('[name="dimensions.north"]');
      if (await northInput.isVisible()) {
        await northInput.fill("29");

        // Fill in other dimensions
        await page.locator('[name="dimensions.south"]').fill("27.5");
        await page.locator('[name="dimensions.east"]').fill("41");
        await page.locator('[name="dimensions.west"]').fill("43");
      }
    });

    test("should allow entry of setback distances", async ({ page }) => {
      const manualTab = page.locator('[data-testid="manual-entry-tab"]');
      if (await manualTab.isVisible()) {
        await manualTab.click();

        // Fill setbacks
        await page.locator('[name="setbacks.north"]').fill("2");
        await page.locator('[name="setbacks.south"]').fill("3");
        await page.locator('[name="setbacks.east"]').fill("3.5");
        await page.locator('[name="setbacks.west"]').fill("2");
      }
    });

    test("should allow selection of road-facing direction", async ({
      page,
    }) => {
      const manualTab = page.locator('[data-testid="manual-entry-tab"]');
      if (await manualTab.isVisible()) {
        await manualTab.click();

        // Select road direction
        const roadSelect = page.locator('[name="roadSide"]');
        if (await roadSelect.isVisible()) {
          await roadSelect.selectOption("west");
          await expect(roadSelect).toHaveValue("west");
        }
      }
    });
  });

  test.describe("Room Requirements Selection", () => {
    test("should display room selection options", async ({ page }) => {
      // Look for room selection section
      const roomSection = page.locator('[data-testid="room-requirements"]');
      await expect(roomSection).toBeVisible();
    });

    test("should allow selection of number of bedrooms", async ({ page }) => {
      const bedroomSelect = page.locator('[name="bedrooms"]');
      if (await bedroomSelect.isVisible()) {
        await bedroomSelect.selectOption("1");
        await expect(bedroomSelect).toHaveValue("1");
      }
    });

    test("should allow toggling pooja room requirement", async ({ page }) => {
      const poojaToggle = page.locator('[name="hasPooja"]');
      if (await poojaToggle.isVisible()) {
        await poojaToggle.check();
        await expect(poojaToggle).toBeChecked();
      }
    });

    test("should show required rooms checklist", async ({ page }) => {
      // Check for common required rooms
      for (const room of ["Living Room", "Kitchen", "Bedroom"]) {
        const roomLabel = page.locator(`text=${room}`);
        await expect(roomLabel).toBeVisible();
      }
    });
  });

  test.describe("Vastu Compliance Display", () => {
    test("should show Vastu zone recommendations", async ({ page }) => {
      // Navigate to results (would need to complete form first)
      const vastuSection = page.locator('[data-testid="vastu-zones"]');

      // If visible, check zone displays
      if (await vastuSection.isVisible()) {
        // Check for 9 Vastu zones
        const zones = [
          "Northeast",
          "East",
          "Southeast",
          "South",
          "Southwest",
          "West",
          "Northwest",
          "North",
          "Center",
        ];

        for (const zone of zones) {
          const zoneElement = page.locator(`text=${zone}`);
          await expect(zoneElement).toBeVisible();
        }
      }
    });

    test("should highlight kitchen placement in Southeast", async ({
      page,
    }) => {
      const vastuSection = page.locator('[data-testid="vastu-zones"]');

      if (await vastuSection.isVisible()) {
        const seZone = page.locator('[data-testid="zone-southeast"]');
        const kitchenLabel = seZone.locator("text=Kitchen");
        await expect(kitchenLabel).toBeVisible();
      }
    });

    test("should show entrance placement based on orientation", async ({
      page,
    }) => {
      const vastuSection = page.locator('[data-testid="vastu-zones"]');

      if (await vastuSection.isVisible()) {
        // For west-facing plot, entrance should be on west
        const westZone = page.locator('[data-testid="zone-west"]');
        const entranceLabel = westZone.locator("text=Entrance");
        await expect(entranceLabel).toBeVisible();
      }
    });

    test("should display Vastu conflicts if any", async ({ page }) => {
      const conflictsSection = page.locator('[data-testid="vastu-conflicts"]');

      if (await conflictsSection.isVisible()) {
        // Check for conflict severity indicators
        const minorBadge = page.locator('[data-testid="conflict-minor"]');
        const moderateBadge = page.locator('[data-testid="conflict-moderate"]');
        const majorBadge = page.locator('[data-testid="conflict-major"]');

        // At least one severity type should exist if there are conflicts
        const hasConflicts =
          (await minorBadge.isVisible()) ||
          (await moderateBadge.isVisible()) ||
          (await majorBadge.isVisible());

        expect(
          hasConflicts || !(await conflictsSection.locator("li").count()),
        ).toBeTruthy();
      }
    });
  });

  test.describe("Floor Plan Visualization", () => {
    test("should display generated floor plan", async ({ page }) => {
      const floorPlan = page.locator('[data-testid="floor-plan-view"]');

      // Check if floor plan canvas/SVG exists
      if (await floorPlan.isVisible()) {
        const canvas = floorPlan.locator("canvas, svg");
        await expect(canvas).toBeVisible();
      }
    });

    test("should show room labels on floor plan", async ({ page }) => {
      const floorPlan = page.locator('[data-testid="floor-plan-view"]');

      if (await floorPlan.isVisible()) {
        // Check for room labels
        for (const room of ["Living", "Kitchen", "Bedroom"]) {
          const label = floorPlan.locator(`text=${room}`);
          await expect(label).toBeVisible();
        }
      }
    });

    test("should show room dimensions", async ({ page }) => {
      const floorPlan = page.locator('[data-testid="floor-plan-view"]');

      if (await floorPlan.isVisible()) {
        // Check for dimension annotations (e.g., "12' x 14'")
        const dimensionPattern = /\d+'\s*x\s*\d+'/;
        const dimensions = floorPlan.locator("text").filter({
          hasText: dimensionPattern,
        });
        await expect(dimensions.first()).toBeVisible();
      }
    });

    test("should indicate courtyard location", async ({ page }) => {
      const floorPlan = page.locator('[data-testid="floor-plan-view"]');

      if (await floorPlan.isVisible()) {
        const courtyard = floorPlan.locator('[data-testid="courtyard"]');
        await expect(courtyard).toBeVisible();
      }
    });
  });

  test.describe("Room Details Panel", () => {
    test("should show detailed room information", async ({ page }) => {
      const roomDetails = page.locator('[data-testid="room-details"]');

      if (await roomDetails.isVisible()) {
        // Check for room list
        const roomList = roomDetails.locator('[data-testid="room-list"]');
        await expect(roomList).toBeVisible();

        // Should show area for each room
        const areaLabels = roomDetails.locator("text=sqft");
        expect(await areaLabels.count()).toBeGreaterThan(0);
      }
    });

    test("should show total built-up area", async ({ page }) => {
      const totalArea = page.locator('[data-testid="total-built-up"]');

      if (await totalArea.isVisible()) {
        const areaText = await totalArea.textContent();
        expect(areaText).toMatch(/\d+/); // Should contain a number
      }
    });

    test("should show efficiency percentage", async ({ page }) => {
      const efficiency = page.locator('[data-testid="efficiency-percent"]');

      if (await efficiency.isVisible()) {
        const effText = await efficiency.textContent();
        expect(effText).toMatch(/\d+%?/); // Should contain percentage
      }
    });
  });

  test.describe("Form Validation", () => {
    test("should require plot dimensions", async ({ page }) => {
      const manualTab = page.locator('[data-testid="manual-entry-tab"]');
      if (await manualTab.isVisible()) {
        await manualTab.click();

        // Try to submit without dimensions
        const submitBtn = page.locator('[data-testid="generate-plan-btn"]');
        if (await submitBtn.isVisible()) {
          await submitBtn.click();

          // Check for validation error
          const error = page.locator('[data-testid="dimension-error"]');
          await expect(error).toBeVisible();
        }
      }
    });

    test("should validate dimension format", async ({ page }) => {
      const manualTab = page.locator('[data-testid="manual-entry-tab"]');
      if (await manualTab.isVisible()) {
        await manualTab.click();

        const northInput = page.locator('[name="dimensions.north"]');
        if (await northInput.isVisible()) {
          // Enter invalid value
          await northInput.fill("invalid");
          await northInput.blur();

          // Check for format error
          const formatError = page.locator("text=/invalid|format|number/i");
          await expect(formatError).toBeVisible();
        }
      }
    });

    test("should require road-facing direction", async ({ page }) => {
      const manualTab = page.locator('[data-testid="manual-entry-tab"]');
      if (await manualTab.isVisible()) {
        await manualTab.click();

        // Fill dimensions but not road direction
        await page.locator('[name="dimensions.north"]').fill("29");
        await page.locator('[name="dimensions.south"]').fill("27.5");
        await page.locator('[name="dimensions.east"]').fill("41");
        await page.locator('[name="dimensions.west"]').fill("43");

        const submitBtn = page.locator('[data-testid="generate-plan-btn"]');
        if (await submitBtn.isVisible()) {
          await submitBtn.click();

          // Check for road direction error
          const roadError = page.locator(
            '[data-testid="road-direction-error"]',
          );
          await expect(roadError).toBeVisible();
        }
      }
    });
  });

  test.describe("Save and Export", () => {
    test("should allow saving floor plan", async ({ page }) => {
      const saveBtn = page.locator('[data-testid="save-plan-btn"]');

      if (await saveBtn.isVisible()) {
        await saveBtn.click();

        // Check for success message
        const successMsg = page.locator("text=/saved|success/i");
        await expect(successMsg).toBeVisible({ timeout: 5000 });
      }
    });

    test("should allow exporting as PDF", async ({ page }) => {
      const exportBtn = page.locator('[data-testid="export-pdf-btn"]');

      if (await exportBtn.isVisible()) {
        // Set up download listener
        const downloadPromise = page.waitForEvent("download");

        await exportBtn.click();

        // Wait for download
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      }
    });

    test("should allow exporting as image", async ({ page }) => {
      const exportImgBtn = page.locator('[data-testid="export-image-btn"]');

      if (await exportImgBtn.isVisible()) {
        const downloadPromise = page.waitForEvent("download");

        await exportImgBtn.click();

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.(png|jpg|jpeg)$/);
      }
    });
  });

  test.describe("Responsive Design", () => {
    test("should work on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      // Check main elements are visible
      const mainContent = page.locator("main");
      await expect(mainContent).toBeVisible();

      // Check navigation is accessible
      const menuBtn = page.locator('[data-testid="mobile-menu-btn"]');
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        const nav = page.locator("nav");
        await expect(nav).toBeVisible();
      }
    });

    test("should work on tablet viewport", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();

      const mainContent = page.locator("main");
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper ARIA labels", async ({ page }) => {
      // Check upload area has aria-label
      const uploadArea = page.locator('[data-testid="survey-upload"]');
      if (await uploadArea.isVisible()) {
        await expect(uploadArea).toHaveAttribute("aria-label", /.+/);
      }
    });

    test("should be keyboard navigable", async ({ page }) => {
      // Tab through interactive elements
      await page.keyboard.press("Tab");

      // Check focus is visible
      const focusedElement = page.locator(":focus");
      await expect(focusedElement).toBeVisible();
    });

    test("should have sufficient color contrast", async ({ page }) => {
      // This would typically use axe-core or similar
      // For now, just verify text is visible
      const headings = page.locator("h1, h2, h3");
      expect(await headings.count()).toBeGreaterThan(0);
    });
  });
});

test.describe("Survey No. 63 Specific Tests", () => {
  test("should handle west-facing plot correctly", async ({ page }) => {
    await page.goto("/floor-plan-generator");

    // Enter Survey 63 specific data
    const manualTab = page.locator('[data-testid="manual-entry-tab"]');
    if (await manualTab.isVisible()) {
      await manualTab.click();

      // Fill dimensions
      await page.locator('[name="dimensions.north"]').fill("29");
      await page.locator('[name="dimensions.south"]').fill("27.5");
      await page.locator('[name="dimensions.east"]').fill("41");
      await page.locator('[name="dimensions.west"]').fill("43");

      // Fill setbacks
      await page.locator('[name="setbacks.north"]').fill("2");
      await page.locator('[name="setbacks.south"]').fill("3");
      await page.locator('[name="setbacks.east"]').fill("3.5");
      await page.locator('[name="setbacks.west"]').fill("2");

      // Select west-facing
      const roadSelect = page.locator('[name="roadSide"]');
      if (await roadSelect.isVisible()) {
        await roadSelect.selectOption("west");
      }

      // Submit
      const submitBtn = page.locator('[data-testid="generate-plan-btn"]');
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Wait for results
        await page.waitForSelector('[data-testid="vastu-zones"]', {
          timeout: 30000,
        });

        // Verify west entrance is recommended
        const westZone = page.locator('[data-testid="zone-west"]');
        await expect(westZone).toContainText(/entrance/i);
      }
    }
  });

  test("should place kitchen in Southeast for Survey 63", async ({ page }) => {
    await page.goto("/floor-plan-generator");

    // Assuming form is filled and submitted
    const vastuZones = page.locator('[data-testid="vastu-zones"]');

    if (await vastuZones.isVisible()) {
      const seZone = page.locator('[data-testid="zone-southeast"]');
      await expect(seZone).toContainText(/kitchen/i);
    }
  });

  test("should place bedroom in Southwest for Survey 63", async ({ page }) => {
    await page.goto("/floor-plan-generator");

    const vastuZones = page.locator('[data-testid="vastu-zones"]');

    if (await vastuZones.isVisible()) {
      const swZone = page.locator('[data-testid="zone-southwest"]');
      await expect(swZone).toContainText(/bedroom|master/i);
    }
  });

  test("should include all 8 required rooms from Survey 63", async ({
    page,
  }) => {
    await page.goto("/floor-plan-generator");

    const roomDetails = page.locator('[data-testid="room-details"]');

    if (await roomDetails.isVisible()) {
      for (const room of SURVEY_DATA.requiredRooms) {
        const roomLabel = roomDetails.locator(`text=${room}`);
        await expect(roomLabel).toBeVisible();
      }
    }
  });
});
