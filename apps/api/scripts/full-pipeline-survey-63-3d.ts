/**
 * Full Pipeline Test - Survey No. 63
 *
 * Runs the complete Eco-Vastu Floor Plan Generator pipeline
 * and generates a photorealistic 3D isometric floor plan using
 * Gemini Pro (Nano Banana Pro) model.
 *
 * Output: 4K photorealistic 3D isometric floor plan with:
 * - All rooms labeled with exact dimensions
 * - Plot dimensions and setbacks
 * - Compass rose
 * - Road indication
 * - Eco-friendly features banner
 *
 * Usage: bun run scripts/full-pipeline-survey-63-3d.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createVastuComplianceAgent,
  createEcoDesignAgent,
  createArchitecturalZoningAgent,
  createDimensioningAgent,
  createEngineeringPlanAgent,
  createDesignValidationAgent,
  createVisualizationAgent,
  createFloorPlanImageAgent,
  createDesignContext,
  type DesignContext,
  type Room,
} from '../src/agents/planning';
import { generate3DIsometricFloorPlan, generateProImage } from '../src/cloudcore/services/ai/gemini';

// ============================================
// Survey No. 63 Input Specifications
// ============================================

const SURVEY_63_INPUT = {
  // Plot dimensions (from handwritten sketch)
  plot: {
    north: 29,    // 29'-0"
    south: 27.5,  // 27'-6"
    east: 41,     // 41'-0"
    west: 43,     // 43'-0"
  },

  // Setbacks
  setbacks: {
    north: 2,     // 2'-0"
    south: 3,     // 3'-0"
    east: 3.5,    // 3'-6"
    west: 2,      // 2'-0" (front - road side)
  },

  // Road details
  road: {
    side: 'west' as const,
    width: 20,    // 20'-0" wide road
  },

  // Orientation
  orientation: 'north' as const,

  // Required rooms (from sketch)
  requiredRooms: [
    { name: 'Verandah', type: 'verandah', zone: 'outdoor' },
    { name: 'Living Room', type: 'living', zone: 'public' },
    { name: 'Dining Room', type: 'dining', zone: 'public' },
    { name: 'Kitchen', type: 'kitchen', zone: 'service' },
    { name: 'Double Bedroom', type: 'bedroom', zone: 'private' },
    { name: 'Dress Room', type: 'dressing', zone: 'private' },
    { name: 'Common Toilet', type: 'bathroom', zone: 'service' },
    { name: 'Staircase', type: 'staircase', zone: 'circulation' },
    { name: 'Open-to-Sky Courtyard', type: 'courtyard', zone: 'eco' },
  ],

  // Eco features
  ecoFeatures: [
    'Traditional mutram (open-to-sky courtyard)',
    'Shaded veranda in the front',
    'Naturally ventilated and well-lit rooms',
    'Rainwater recharge pit in courtyard',
    'Spacious design with future expansion possible',
  ],
};

// ============================================
// Validation Function
// ============================================

interface ValidationResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    expected: string;
    actual: string;
  }>;
}

function validateOutput(
  input: typeof SURVEY_63_INPUT,
  generatedRooms: Room[]
): ValidationResult {
  const checks: ValidationResult['checks'] = [];

  // Check 1: All required rooms are generated
  const requiredRoomNames = input.requiredRooms.map(r => r.name.toLowerCase());
  const generatedRoomNames = generatedRooms.map(r => r.name.toLowerCase());

  for (const required of input.requiredRooms) {
    const found = generatedRooms.find(
      g => g.name.toLowerCase().includes(required.name.split(' ')[0].toLowerCase())
    );
    checks.push({
      name: `Room: ${required.name}`,
      passed: !!found,
      expected: required.name,
      actual: found ? `${found.name} (${found.width}'×${found.depth}')` : 'NOT FOUND',
    });
  }

  // Check 2: Total area is reasonable (within buildable envelope)
  const buildableWidth = input.plot.north - input.setbacks.north - input.setbacks.south;
  const buildableDepth = input.plot.west - input.setbacks.west - input.setbacks.east;
  const maxBuildableArea = buildableWidth * buildableDepth;
  const totalGeneratedArea = generatedRooms.reduce((sum, r) => sum + r.areaSqft, 0);

  checks.push({
    name: 'Total Area',
    passed: totalGeneratedArea <= maxBuildableArea * 1.1, // Allow 10% margin
    expected: `≤ ${Math.round(maxBuildableArea)} sqft`,
    actual: `${totalGeneratedArea} sqft`,
  });

  // Check 3: Courtyard exists
  const hasCoutyard = generatedRooms.some(
    r => r.type === 'courtyard' || r.name.toLowerCase().includes('courtyard')
  );
  checks.push({
    name: 'Courtyard (Eco Feature)',
    passed: hasCoutyard,
    expected: 'Present',
    actual: hasCoutyard ? 'Present' : 'Missing',
  });

  // Check 4: Verandah exists (for west-facing entrance)
  const hasVerandah = generatedRooms.some(
    r => r.type === 'verandah' || r.name.toLowerCase().includes('verandah')
  );
  checks.push({
    name: 'Verandah (Entrance)',
    passed: hasVerandah,
    expected: 'Present',
    actual: hasVerandah ? 'Present' : 'Missing',
  });

  // Check 5: Kitchen in service zone
  const kitchen = generatedRooms.find(
    r => r.type === 'kitchen' || r.name.toLowerCase().includes('kitchen')
  );
  checks.push({
    name: 'Kitchen Zone',
    passed: kitchen?.zone === 'service',
    expected: 'service',
    actual: kitchen?.zone || 'N/A',
  });

  // Check 6: Bedroom in private zone
  const bedroom = generatedRooms.find(
    r => r.type === 'bedroom' || r.name.toLowerCase().includes('bedroom')
  );
  checks.push({
    name: 'Bedroom Zone',
    passed: bedroom?.zone === 'private',
    expected: 'private',
    actual: bedroom?.zone || 'N/A',
  });

  const passed = checks.every(c => c.passed);

  return { passed, checks };
}

// ============================================
// Main Pipeline Function
// ============================================

async function runFullPipeline() {
  const startTime = Date.now();

  console.log('');
  console.log('═'.repeat(70));
  console.log('   FULL PIPELINE TEST - SURVEY NO. 63');
  console.log('   Eco-Vastu Intelligent Floor Plan Generator');
  console.log('   Output: 4K Photorealistic 3D Isometric Floor Plan');
  console.log('═'.repeat(70));
  console.log('');

  // ============================================
  // Phase 1: Display Input Specifications
  // ============================================

  console.log('📋 INPUT SPECIFICATIONS:');
  console.log('─'.repeat(50));
  console.log(`   Plot Dimensions:`);
  console.log(`     North: ${SURVEY_63_INPUT.plot.north}'-0"`);
  console.log(`     South: ${SURVEY_63_INPUT.plot.south}'-6"`);
  console.log(`     East:  ${SURVEY_63_INPUT.plot.east}'-0"`);
  console.log(`     West:  ${SURVEY_63_INPUT.plot.west}'-0"`);
  console.log('');
  console.log(`   Setbacks:`);
  console.log(`     North: ${SURVEY_63_INPUT.setbacks.north}'-0"`);
  console.log(`     South: ${SURVEY_63_INPUT.setbacks.south}'-0"`);
  console.log(`     East:  ${SURVEY_63_INPUT.setbacks.east}'-6"`);
  console.log(`     West:  ${SURVEY_63_INPUT.setbacks.west}'-0"`);
  console.log('');
  console.log(`   Road: ${SURVEY_63_INPUT.road.side} side (${SURVEY_63_INPUT.road.width}'-0" width)`);
  console.log(`   Orientation: ${SURVEY_63_INPUT.orientation}-facing`);
  console.log('');
  console.log(`   Required Rooms (${SURVEY_63_INPUT.requiredRooms.length}):`);
  SURVEY_63_INPUT.requiredRooms.forEach((room, i) => {
    console.log(`     ${i + 1}. ${room.name} [${room.zone}]`);
  });
  console.log('');

  // Calculate buildable area
  const buildableWidth = SURVEY_63_INPUT.plot.north - SURVEY_63_INPUT.setbacks.north - SURVEY_63_INPUT.setbacks.south;
  const buildableDepth = SURVEY_63_INPUT.plot.west - SURVEY_63_INPUT.setbacks.west - SURVEY_63_INPUT.setbacks.east;
  console.log(`   Buildable Envelope: ${buildableWidth}' × ${buildableDepth}' = ${Math.round(buildableWidth * buildableDepth)} sqft`);
  console.log('');

  // ============================================
  // Phase 2: Run Planning Agents
  // ============================================

  console.log('🚀 RUNNING PLANNING AGENTS:');
  console.log('─'.repeat(50));

  // Initialize design context
  const context: DesignContext = {
    ...createDesignContext(`survey-63-full-${Date.now()}`),
    plot: {
      width: buildableWidth,
      depth: buildableDepth,
      area: buildableWidth * buildableDepth,
      unit: 'feet',
    },
    setbacks: {
      front: SURVEY_63_INPUT.setbacks.west,
      rear: SURVEY_63_INPUT.setbacks.east,
      left: SURVEY_63_INPUT.setbacks.north,
      right: SURVEY_63_INPUT.setbacks.south,
      unit: 'feet',
    },
    road: SURVEY_63_INPUT.road,
    orientation: SURVEY_63_INPUT.orientation,
    buildableEnvelope: {
      width: buildableWidth,
      depth: buildableDepth,
      area: buildableWidth * buildableDepth,
      maxHeight: 12,
      maxFloors: 2,
      fsi: 1.5,
    },
    requirements: {
      bedrooms: 1,
      bathrooms: 1,
      hasPooja: false,
      hasParking: false,
      hasStore: false,
      hasServantRoom: false,
      floors: 2,
    },
  };

  try {
    // Agent 1: Vastu Compliance
    console.log('   1️⃣  Vastu Compliance Analysis...');
    const vastuAgent = createVastuComplianceAgent();
    const vastuResult = await vastuAgent.execute(
      {
        orientation: SURVEY_63_INPUT.orientation,
        plotDimensions: context.plot!,
        requirements: context.requirements!,
      },
      context
    );

    if (vastuResult.success && vastuResult.data) {
      context.vastuZones = vastuResult.data.recommended_zones;
      console.log('      ✓ Vastu zones computed');
    } else {
      console.log('      ⚠ Using default Vastu zones');
      context.vastuZones = {
        northeast: ['pooja', 'water-elements'],
        southeast: ['kitchen'],
        southwest: ['master-bedroom'],
        northwest: ['bathroom', 'staircase'],
        center: ['courtyard', 'living'],
        east: ['living', 'verandah'],
        west: ['dining', 'staircase'],
      };
    }

    // Agent 2: Eco Design
    console.log('   2️⃣  Eco-Design Strategy...');
    const ecoAgent = createEcoDesignAgent();
    const ecoResult = await ecoAgent.execute(
      {
        buildableEnvelope: context.buildableEnvelope!,
        orientation: SURVEY_63_INPUT.orientation,
        requirements: context.requirements!,
      },
      context
    );

    if (ecoResult.success && ecoResult.data) {
      context.ecoMandatory = ecoResult.data.mandatory_elements;
      context.courtyardSpec = {
        required: ecoResult.data.courtyard.required,
        minArea: ecoResult.data.courtyard.min_area_sqft,
        position: ecoResult.data.courtyard.position,
      };
      console.log('      ✓ Eco elements defined');
    } else {
      console.log('      ⚠ Using default eco elements');
      context.ecoMandatory = ['courtyard', 'veranda', 'cross_ventilation'];
      context.courtyardSpec = { required: true, minArea: 64, position: 'central' };
    }

    // Agent 3: Architectural Zoning
    console.log('   3️⃣  Architectural Zoning...');
    const zoningAgent = createArchitecturalZoningAgent();
    const zoningResult = await zoningAgent.execute(
      {
        requirements: context.requirements!,
        vastuZones: context.vastuZones || {},
        ecoMandatory: context.ecoMandatory || [],
      },
      context
    );

    if (zoningResult.success && zoningResult.data) {
      context.architecturalZones = zoningResult.data.zones;
      context.adjacencyRules = zoningResult.data.adjacency_rules;
      console.log('      ✓ Zones defined');
    } else {
      console.log('      ⚠ Using default zones');
    }

    // Agent 4: Dimensioning
    console.log('   4️⃣  Room Dimensioning...');
    const dimensioningAgent = createDimensioningAgent();
    const dimensioningResult = await dimensioningAgent.execute(
      {
        buildableEnvelope: context.buildableEnvelope!,
        architecturalZones: context.architecturalZones || {
          public: ['Living Room', 'Verandah'],
          semi_private: ['Dining Room', 'Kitchen'],
          private: ['Double Bedroom', 'Dress Room'],
          service: ['Common Toilet', 'Staircase'],
        },
        vastuZones: context.vastuZones || {},
        ecoMandatory: context.ecoMandatory || ['courtyard', 'veranda', 'cross_ventilation'],
        courtyardSpec: context.courtyardSpec || { required: true, minArea: 64, position: 'central' },
        adjacencyRules: context.adjacencyRules || [],
      },
      context
    );

    if (dimensioningResult.success && dimensioningResult.data) {
      context.rooms = dimensioningResult.data.rooms.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type as Room['type'],
        width: r.width,
        depth: r.depth,
        areaSqft: r.area_sqft,
        zone: r.zone as Room['zone'],
        adjacentTo: r.adjacent_to,
      }));
      context.totalBuiltUp = dimensioningResult.data.total_built_up_sqft;
      console.log('      ✓ Rooms dimensioned');
    } else {
      console.log('      ⚠ Using fallback room dimensions');
      // Fallback rooms based on Survey 63 sketch
      context.rooms = [
        { id: 'verandah', name: 'Verandah', type: 'verandah', width: 4, depth: 20, areaSqft: 80, zone: 'outdoor', adjacentTo: ['living-room'] },
        { id: 'living-room', name: 'Living Room', type: 'living', width: 12, depth: 14, areaSqft: 168, zone: 'public', adjacentTo: ['verandah', 'dining-room', 'courtyard'] },
        { id: 'dining-room', name: 'Dining Room', type: 'dining', width: 10, depth: 10, areaSqft: 100, zone: 'public', adjacentTo: ['living-room', 'kitchen', 'courtyard'] },
        { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 8, depth: 10, areaSqft: 80, zone: 'service', adjacentTo: ['dining-room'] },
        { id: 'courtyard', name: 'Open-to-Sky Courtyard', type: 'courtyard', width: 8, depth: 8, areaSqft: 64, zone: 'eco', adjacentTo: ['living-room', 'dining-room', 'bedroom'] },
        { id: 'bedroom', name: 'Double Bedroom', type: 'bedroom', width: 12, depth: 12, areaSqft: 144, zone: 'private', adjacentTo: ['courtyard', 'dress-room'] },
        { id: 'dress-room', name: 'Dress Room', type: 'dressing', width: 6, depth: 8, areaSqft: 48, zone: 'private', adjacentTo: ['bedroom', 'toilet'] },
        { id: 'toilet', name: 'Common Toilet', type: 'bathroom', width: 5, depth: 7, areaSqft: 35, zone: 'service', adjacentTo: ['dress-room'] },
        { id: 'staircase', name: 'Staircase', type: 'staircase', width: 4, depth: 10, areaSqft: 40, zone: 'circulation', adjacentTo: ['living-room'] },
      ];
      context.totalBuiltUp = context.rooms.reduce((sum, r) => sum + r.areaSqft, 0);
    }

    // Agent 5: Engineering Plan
    console.log('   5️⃣  Engineering Plan...');
    const engineeringAgent = createEngineeringPlanAgent();
    const engineeringResult = await engineeringAgent.execute(
      {
        rooms: context.rooms || [],
        structuralStrategy: 'load-bearing',
        floors: 2,
        ecoMandatory: context.ecoMandatory || [],
      },
      context
    );

    if (engineeringResult.success && engineeringResult.data) {
      context.wallSystem = {
        externalThickness: engineeringResult.data.wall_system.external_thickness_inches,
        internalThickness: engineeringResult.data.wall_system.internal_thickness_inches,
        material: engineeringResult.data.wall_system.material,
        loadBearingWalls: engineeringResult.data.wall_system.load_bearing_walls,
      };
      console.log('      ✓ Engineering specs defined');
    } else {
      console.log('      ⚠ Using default engineering specs');
    }

    // Agent 6: Design Validation
    console.log('   6️⃣  Design Validation...');
    const validationAgent = createDesignValidationAgent();
    const validationResult = await validationAgent.execute(
      {
        rooms: context.rooms || [],
        buildableEnvelope: context.buildableEnvelope!,
        vastuZones: context.vastuZones || {},
        ecoMandatory: context.ecoMandatory || [],
        engineeringPlan: engineeringResult.data,
      },
      context
    );

    if (validationResult.success && validationResult.data) {
      context.validationStatus = validationResult.data.status;
      console.log(`      ✓ Validation: ${context.validationStatus}`);
    } else {
      console.log('      ⚠ Validation skipped');
    }

    console.log('');

    // ============================================
    // Phase 3: Display Generated Room Layout
    // ============================================

    console.log('📏 GENERATED ROOM LAYOUT:');
    console.log('─'.repeat(50));

    if (context.rooms) {
      context.rooms.forEach(room => {
        const pad = ' '.repeat(Math.max(0, 22 - room.name.length));
        console.log(`   ${room.name}${pad}${room.width}'-0" × ${room.depth}'-0"  = ${room.areaSqft} sqft  [${room.zone}]`);
      });
      console.log('   ─'.repeat(40));
      console.log(`   TOTAL BUILT-UP AREA:${' '.repeat(10)}${context.totalBuiltUp} sqft`);
    }
    console.log('');

    // ============================================
    // Phase 4: Validate Against Input
    // ============================================

    console.log('✅ VALIDATION AGAINST INPUT:');
    console.log('─'.repeat(50));

    const validation = validateOutput(SURVEY_63_INPUT, context.rooms || []);

    validation.checks.forEach(check => {
      const icon = check.passed ? '✓' : '✗';
      const status = check.passed ? 'PASS' : 'FAIL';
      console.log(`   ${icon} ${check.name}`);
      console.log(`      Expected: ${check.expected}`);
      console.log(`      Actual:   ${check.actual}`);
    });

    console.log('');
    console.log(`   Overall: ${validation.passed ? '✅ ALL CHECKS PASSED' : '⚠️ SOME CHECKS FAILED'}`);
    console.log('');

    // ============================================
    // Phase 5: Generate 3D Isometric Floor Plan
    // ============================================

    console.log('🎨 GENERATING 3D ISOMETRIC FLOOR PLAN:');
    console.log('─'.repeat(50));
    console.log('   Model: Gemini Pro (Nano Banana Pro)');
    console.log('   Resolution: 4K');
    console.log('   Generating photorealistic visualization...');
    console.log('');

    const hasGoogleKey = process.env.GOOGLE_AI_API_KEY;

    if (!hasGoogleKey) {
      console.log('   ⚠️  GOOGLE_AI_API_KEY not set - skipping image generation');
      console.log('   Set GOOGLE_AI_API_KEY to generate actual floor plan images');
    } else {
      const imageStartTime = Date.now();

      // Prepare floor plan data for 3D generation
      const floorPlanData = {
        title: 'ECO-FRIENDLY COURTYARD HOUSE',
        plotDimensions: SURVEY_63_INPUT.plot,
        setbacks: SURVEY_63_INPUT.setbacks,
        rooms: (context.rooms || []).map(r => ({
          name: r.name,
          width: r.width,
          depth: r.depth,
          zone: r.zone,
        })),
        roadSide: SURVEY_63_INPUT.road.side,
        roadWidth: SURVEY_63_INPUT.road.width,
        orientation: SURVEY_63_INPUT.orientation,
        ecoFeatures: SURVEY_63_INPUT.ecoFeatures,
      };

      const imageResult = await generate3DIsometricFloorPlan(floorPlanData);

      const imageElapsed = Date.now() - imageStartTime;

      if (imageResult.success && imageResult.data && imageResult.data.images.length > 0) {
        console.log(`   ✅ 3D ISOMETRIC FLOOR PLAN GENERATED! (${imageElapsed}ms)`);
        console.log(`   Model: ${imageResult.data.model}`);

        // Save image to file
        const outputDir = path.join(__dirname, '..', 'output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outputPath = path.join(outputDir, `survey-63-3d-isometric-${timestamp}.png`);
        const buffer = Buffer.from(imageResult.data.images[0].base64Data, 'base64');
        fs.writeFileSync(outputPath, buffer);

        console.log('');
        console.log(`   📁 Saved to: ${outputPath}`);
        console.log(`   File size: ${Math.round(buffer.length / 1024)} KB`);

        // Also save the input specs for reference
        const specsPath = path.join(outputDir, `survey-63-3d-specs-${timestamp}.json`);
        fs.writeFileSync(specsPath, JSON.stringify({
          input: SURVEY_63_INPUT,
          generatedRooms: context.rooms,
          validation,
          timestamp: new Date().toISOString(),
        }, null, 2));
        console.log(`   📋 Specs saved to: ${specsPath}`);
      } else {
        console.log(`   ❌ Image generation failed: ${imageResult.error?.message}`);
        if (imageResult.error?.details) {
          console.log(`   Details:`, imageResult.error.details);
        }
      }
    }

    console.log('');

    // ============================================
    // Phase 6: Summary
    // ============================================

    const totalElapsed = Date.now() - startTime;

    console.log('═'.repeat(70));
    console.log('   PIPELINE COMPLETE');
    console.log('═'.repeat(70));
    console.log('');
    console.log('📊 SUMMARY:');
    console.log(`   Session ID: ${context.sessionId}`);
    console.log(`   Total Time: ${totalElapsed}ms`);
    console.log(`   Plot: ${SURVEY_63_INPUT.plot.north}' × ${SURVEY_63_INPUT.plot.west}'`);
    console.log(`   Rooms Generated: ${context.rooms?.length || 0}`);
    console.log(`   Built-up Area: ${context.totalBuiltUp} sqft`);
    console.log(`   Validation: ${validation.passed ? 'PASSED' : 'NEEDS REVIEW'}`);
    console.log('');

    return {
      success: true,
      context,
      validation,
    };

  } catch (error) {
    console.error('');
    console.error('❌ PIPELINE ERROR:', error);
    throw error;
  }
}

// ============================================
// Run Pipeline
// ============================================

runFullPipeline()
  .then((result) => {
    console.log('');
    console.log('✅ Full pipeline test completed!');
    process.exit(result.validation.passed ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
