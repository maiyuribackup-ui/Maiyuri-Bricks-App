/**
 * Generate All 3D Views - Survey No. 63
 *
 * Generates three photorealistic 3D views using Gemini Pro:
 * 1. Floor Plan (isometric)
 * 2. Courtyard (mutram)
 * 3. Exterior (facade)
 *
 * Usage: bun run scripts/generate-all-3d-views.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generate3DIsometricFloorPlan,
  generate3DCourtyardView,
  generate3DExteriorView,
} from '../src/cloudcore/services/ai/gemini';

// Survey No. 63 specifications
const SURVEY_63 = {
  plot: {
    north: 29,
    south: 27.5,
    east: 41,
    west: 43,
  },
  setbacks: {
    north: 2,
    south: 3,
    east: 3.5,
    west: 2,
  },
  road: {
    side: 'west' as const,
    width: 20,
  },
  orientation: 'north',
  rooms: [
    { name: 'Verandah', width: 4, depth: 20, zone: 'outdoor' },
    { name: 'Living Room', width: 12, depth: 14, zone: 'public' },
    { name: 'Dining Room', width: 10, depth: 10, zone: 'public' },
    { name: 'Kitchen', width: 8, depth: 10, zone: 'service' },
    { name: 'Open-to-Sky Courtyard', width: 8, depth: 8, zone: 'eco' },
    { name: 'Double Bedroom', width: 12, depth: 12, zone: 'private' },
    { name: 'Dress Room', width: 6, depth: 8, zone: 'private' },
    { name: 'Common Toilet', width: 5, depth: 7, zone: 'service' },
    { name: 'Staircase', width: 4, depth: 10, zone: 'circulation' },
  ],
  ecoFeatures: [
    'Traditional mutram (open-to-sky courtyard)',
    'Shaded veranda in the front',
    'Naturally ventilated and well-lit rooms',
    'Rainwater recharge pit in courtyard',
    'Spacious design with future expansion possible',
  ],
};

async function generateAllViews() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('   SURVEY NO. 63 - ALL 3D VIEWS GENERATOR');
  console.log('   Using Gemini Pro (Nano Banana Pro) - 4K Output');
  console.log('═'.repeat(70));
  console.log('');

  const outputDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const results: { view: string; success: boolean; path?: string; error?: string }[] = [];

  // ============================================
  // View 1: 3D Isometric Floor Plan
  // ============================================

  console.log('🏠 GENERATING VIEW 1: 3D ISOMETRIC FLOOR PLAN');
  console.log('─'.repeat(50));
  console.log('   Generating photorealistic floor plan...');

  const floorPlanStart = Date.now();
  const floorPlanResult = await generate3DIsometricFloorPlan({
    title: 'ECO-FRIENDLY COURTYARD HOUSE',
    plotDimensions: SURVEY_63.plot,
    setbacks: SURVEY_63.setbacks,
    rooms: SURVEY_63.rooms,
    roadSide: SURVEY_63.road.side,
    roadWidth: SURVEY_63.road.width,
    orientation: SURVEY_63.orientation,
    ecoFeatures: SURVEY_63.ecoFeatures,
  });

  if (floorPlanResult.success && floorPlanResult.data?.images.length) {
    const outputPath = path.join(outputDir, `survey-63-floor-plan-${timestamp}.png`);
    const buffer = Buffer.from(floorPlanResult.data.images[0].base64Data, 'base64');
    fs.writeFileSync(outputPath, buffer);
    console.log(`   ✅ Generated in ${Date.now() - floorPlanStart}ms`);
    console.log(`   📁 Saved: ${outputPath}`);
    console.log(`   📐 Size: ${Math.round(buffer.length / 1024)} KB`);
    results.push({ view: 'Floor Plan', success: true, path: outputPath });
  } else {
    console.log(`   ❌ Failed: ${floorPlanResult.error?.message}`);
    results.push({ view: 'Floor Plan', success: false, error: floorPlanResult.error?.message });
  }
  console.log('');

  // ============================================
  // View 2: 3D Courtyard View
  // ============================================

  console.log('🌿 GENERATING VIEW 2: 3D COURTYARD (MUTRAM)');
  console.log('─'.repeat(50));
  console.log('   Generating photorealistic courtyard view...');

  const courtyardStart = Date.now();
  const courtyardResult = await generate3DCourtyardView({
    courtyardSize: { width: 8, depth: 8 },
    surroundingRooms: [
      { name: 'Living Room', side: 'west' },
      { name: 'Dining Room', side: 'south' },
      { name: 'Double Bedroom', side: 'north' },
      { name: 'Kitchen', side: 'east' },
    ],
    features: [
      'Tulsi (holy basil) plant in ornate brass pot at center',
      'Terracotta tile flooring with geometric pattern',
      'Rainwater collection pit with decorative stone grate',
      'Wooden pillared corridors on all four sides',
      'Brass oil lamps (vilakku) in wall niches',
      'Traditional swing (oonjal) in one corner',
    ],
    style: 'Traditional Tamil Nadu Brahmin agraharam style with eco-friendly elements',
  });

  if (courtyardResult.success && courtyardResult.data?.images.length) {
    const outputPath = path.join(outputDir, `survey-63-courtyard-${timestamp}.png`);
    const buffer = Buffer.from(courtyardResult.data.images[0].base64Data, 'base64');
    fs.writeFileSync(outputPath, buffer);
    console.log(`   ✅ Generated in ${Date.now() - courtyardStart}ms`);
    console.log(`   📁 Saved: ${outputPath}`);
    console.log(`   📐 Size: ${Math.round(buffer.length / 1024)} KB`);
    results.push({ view: 'Courtyard', success: true, path: outputPath });
  } else {
    console.log(`   ❌ Failed: ${courtyardResult.error?.message}`);
    results.push({ view: 'Courtyard', success: false, error: courtyardResult.error?.message });
  }
  console.log('');

  // ============================================
  // View 3: 3D Exterior View
  // ============================================

  console.log('🏡 GENERATING VIEW 3: 3D EXTERIOR FACADE');
  console.log('─'.repeat(50));
  console.log('   Generating photorealistic exterior view...');

  const exteriorStart = Date.now();
  const exteriorResult = await generate3DExteriorView({
    plotWidth: SURVEY_63.plot.north,
    plotDepth: SURVEY_63.plot.west,
    floors: 2,
    facingDirection: SURVEY_63.orientation,
    roadSide: SURVEY_63.road.side,
    roadWidth: SURVEY_63.road.width,
    hasVerandah: true,
    verandahWidth: 4,
    roofType: 'Sloped Mangalore tile roof',
    wallFinish: 'Lime-washed walls',
    features: [
      'Sloped Mangalore tile roof in terracotta red',
      'Lime-washed exterior walls in warm cream color',
      'Traditional carved wooden main door with brass hardware',
      'Wooden window frames with decorative iron grilles',
      'Front verandah (thinnai) with carved wooden pillars',
      'Low compound wall with ornate iron gate',
      'Coconut palm and flowering garden',
      'Traditional kolam at entrance',
    ],
  });

  if (exteriorResult.success && exteriorResult.data?.images.length) {
    const outputPath = path.join(outputDir, `survey-63-exterior-${timestamp}.png`);
    const buffer = Buffer.from(exteriorResult.data.images[0].base64Data, 'base64');
    fs.writeFileSync(outputPath, buffer);
    console.log(`   ✅ Generated in ${Date.now() - exteriorStart}ms`);
    console.log(`   📁 Saved: ${outputPath}`);
    console.log(`   📐 Size: ${Math.round(buffer.length / 1024)} KB`);
    results.push({ view: 'Exterior', success: true, path: outputPath });
  } else {
    console.log(`   ❌ Failed: ${exteriorResult.error?.message}`);
    results.push({ view: 'Exterior', success: false, error: exteriorResult.error?.message });
  }
  console.log('');

  // ============================================
  // Summary
  // ============================================

  console.log('═'.repeat(70));
  console.log('   GENERATION COMPLETE');
  console.log('═'.repeat(70));
  console.log('');
  console.log('📊 RESULTS:');
  results.forEach((r, i) => {
    const icon = r.success ? '✅' : '❌';
    console.log(`   ${i + 1}. ${icon} ${r.view}`);
    if (r.path) {
      console.log(`      ${r.path}`);
    }
    if (r.error) {
      console.log(`      Error: ${r.error}`);
    }
  });
  console.log('');

  const successCount = results.filter(r => r.success).length;
  console.log(`   Total: ${successCount}/${results.length} views generated successfully`);
  console.log('');

  return results;
}

// Run
generateAllViews()
  .then((results) => {
    const allSuccess = results.every(r => r.success);
    console.log(allSuccess ? '✅ All views generated!' : '⚠️ Some views failed');
    process.exit(allSuccess ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
