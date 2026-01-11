/**
 * Survey No. 63 - Image Validation Script
 *
 * This script validates the generated floor plan image against
 * the original input requirements using vision AI.
 *
 * This is the CORRECT validation approach - validating the actual
 * IMAGE OUTPUT, not just the prompt text.
 */

import { validateFloorPlanImage, generateValidationReport } from '../src/agents/planning/validators/image-validation';
import * as fs from 'fs';
import * as path from 'path';

// Survey No. 63 - Original Input Requirements (from handwritten sketch)
const SURVEY_63_REQUIREMENTS = {
  surveyNo: '63',
  dimensions: {
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
  road: {
    side: 'West',
    width: "20'-0\"",
  },
  rooms: [
    { name: 'Living Room', size: "12'×12'" },
    { name: 'Dining', size: "10'×10'" },
    { name: 'Kitchen', size: "8'×10'" },
    { name: 'Bedroom 1', size: "10'×12'" }, // "Double Bedroom" = 2 separate bedrooms
    { name: 'Bedroom 2', size: "10'×10'" }, // Second bedroom
    { name: 'Common Toilet', size: "5'×7'" },
    { name: 'Staircase', size: "4'×8'" },
    { name: 'Verandah', size: "4'×18'" },
    { name: 'Mutram', size: "8'×8'" }, // 4 pillars, open all sides, water feature
  ],
};

async function main() {
  console.log('═'.repeat(70));
  console.log('   SURVEY NO. 63 - IMAGE VALIDATION');
  console.log('   (Validating actual image output, not prompt text)');
  console.log('═'.repeat(70));
  console.log();

  // Get the most recent generated image
  const outputDir = path.join(process.cwd(), 'output');
  const files = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('survey-63-3d-isometric-') && f.endsWith('.png'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('❌ No survey-63 images found in output directory');
    process.exit(1);
  }

  const latestImage = files[0];
  const imagePath = path.join(outputDir, latestImage);

  console.log('📷 Image to validate:', latestImage);
  console.log('   Path:', imagePath);
  console.log();

  console.log('📋 INPUT REQUIREMENTS:');
  console.log('   Survey No:', SURVEY_63_REQUIREMENTS.surveyNo);
  console.log('   Dimensions:');
  console.log(`     North: ${SURVEY_63_REQUIREMENTS.dimensions.north}`);
  console.log(`     South: ${SURVEY_63_REQUIREMENTS.dimensions.south}`);
  console.log(`     East: ${SURVEY_63_REQUIREMENTS.dimensions.east}`);
  console.log(`     West: ${SURVEY_63_REQUIREMENTS.dimensions.west}`);
  console.log('   Road:', `${SURVEY_63_REQUIREMENTS.road.width} on ${SURVEY_63_REQUIREMENTS.road.side}`);
  console.log('   Rooms:');
  SURVEY_63_REQUIREMENTS.rooms.forEach(r => {
    console.log(`     • ${r.name}: ${r.size}`);
  });
  console.log();

  console.log('🔍 VALIDATING IMAGE...');
  console.log('   (Using vision AI to analyze actual rendered output)');
  console.log();

  try {
    const result = await validateFloorPlanImage({
      imagePath,
      originalRequirements: SURVEY_63_REQUIREMENTS,
    });

    // Display results
    const statusEmoji = result.status === 'PASS' ? '✅' : result.status === 'PARTIAL' ? '⚠️' : '❌';
    console.log(`${statusEmoji} VALIDATION RESULT: ${result.status}`);
    console.log();
    console.log('📊 SUMMARY:');
    console.log(`   Total Tests: ${result.totalTests}`);
    console.log(`   Passed: ${result.passedTests}`);
    console.log(`   Failed: ${result.failedTests}`);
    console.log(`   Score: ${result.score}%`);
    console.log();

    if (result.errors.length > 0) {
      console.log('❌ ERRORS:');
      result.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. [${error.severity.toUpperCase()}] ${error.category}`);
        console.log(`      Expected: ${error.expected}`);
        console.log(`      Actual: ${error.actual}`);
        console.log(`      ${error.description}`);
        console.log();
      });
    }

    if (result.warnings.length > 0) {
      console.log('⚠️ WARNINGS:');
      result.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning.category}: ${warning.description}`);
        console.log(`      Recommendation: ${warning.recommendation}`);
        console.log();
      });
    }

    // Generate and save report
    const report = generateValidationReport(result);
    const reportPath = path.join(outputDir, `survey-63-image-validation-${Date.now()}.md`);
    fs.writeFileSync(reportPath, report);
    console.log(`📝 Report saved: ${reportPath}`);

  } catch (error) {
    console.error('❌ VALIDATION ERROR:', error);
    process.exit(1);
  }

  console.log();
  console.log('═'.repeat(70));
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
