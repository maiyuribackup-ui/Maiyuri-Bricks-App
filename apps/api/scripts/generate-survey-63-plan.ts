/**
 * Survey No. 63 Floor Plan Generator
 *
 * Generates a Vastu-compliant floor plan using the extracted data
 * from Survey No. 63 handwritten sketch.
 */

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

// Survey No. 63 extracted data
const SURVEY_63_DATA = {
  plot: {
    north: 29, // 29'-0"
    south: 27.5, // 27'-6"
    east: 41, // 41'-0"
    west: 43, // 43'-0"
    // Approximate buildable dimensions (after setbacks)
    buildableWidth: 24, // ~28.25 - 2 (north) - 2 (south avg) ≈ 24'
    buildableDepth: 36.5, // ~42 - 2 (west) - 3.5 (east) ≈ 36.5'
    area: 28.25 * 42, // ~1186 sqft total
  },
  setbacks: {
    north: 2,
    south: 3,
    east: 3.5,
    west: 2, // Front (road side)
  },
  road: {
    side: 'west' as const,
    width: 20,
  },
  orientation: 'west' as const,
  requiredRooms: [
    'Living Room',
    'Dining',
    'Kitchen',
    'Double Bedroom',
    'Dress Room',
    'Common Toilet',
    'Staircase',
    'Verandah',
  ],
};

async function generateFloorPlan() {
  console.log('═'.repeat(60));
  console.log('   ECO-VASTU INTELLIGENT FLOOR PLAN GENERATOR');
  console.log('   Survey No. 63 - West-Facing Plot');
  console.log('═'.repeat(60));
  console.log();

  console.log('📐 PLOT DATA (from sketch):');
  console.log(`   North: ${SURVEY_63_DATA.plot.north}'`);
  console.log(`   South: ${SURVEY_63_DATA.plot.south}'`);
  console.log(`   East: ${SURVEY_63_DATA.plot.east}'`);
  console.log(`   West: ${SURVEY_63_DATA.plot.west}'`);
  console.log(`   Road: West side (${SURVEY_63_DATA.road.width}' width)`);
  console.log(`   Total Area: ~${Math.round(SURVEY_63_DATA.plot.area)} sqft`);
  console.log();

  console.log('🏠 REQUIRED ROOMS:');
  SURVEY_63_DATA.requiredRooms.forEach((room, i) => {
    console.log(`   ${i + 1}. ${room}`);
  });
  console.log();

  // Initialize design context with Survey 63 data
  const context: DesignContext = {
    ...createDesignContext(`survey-63-${Date.now()}`),
    plot: {
      width: SURVEY_63_DATA.plot.buildableWidth,
      depth: SURVEY_63_DATA.plot.buildableDepth,
      area: SURVEY_63_DATA.plot.buildableWidth * SURVEY_63_DATA.plot.buildableDepth,
      unit: 'feet',
    },
    setbacks: {
      front: SURVEY_63_DATA.setbacks.west,
      rear: SURVEY_63_DATA.setbacks.east,
      left: SURVEY_63_DATA.setbacks.north,
      right: SURVEY_63_DATA.setbacks.south,
      unit: 'feet',
    },
    road: SURVEY_63_DATA.road,
    orientation: SURVEY_63_DATA.orientation,
    buildableEnvelope: {
      width: SURVEY_63_DATA.plot.buildableWidth,
      depth: SURVEY_63_DATA.plot.buildableDepth,
      area: SURVEY_63_DATA.plot.buildableWidth * SURVEY_63_DATA.plot.buildableDepth,
      maxHeight: 12, // 2 floors typical
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

  console.log('🚀 Running planning agents...');
  console.log();

  try {
    // Step 1: Vastu Compliance
    console.log('1️⃣  VASTU COMPLIANCE ANALYSIS...');
    const vastuAgent = createVastuComplianceAgent();
    const vastuResult = await vastuAgent.execute(
      {
        orientation: 'west',
        plotDimensions: context.plot!,
        requirements: {
          bedrooms: 1,
          bathrooms: 1,
          hasPooja: false,
          hasParking: false,
          hasStore: false,
          hasServantRoom: false,
          floors: 2,
        },
      },
      context
    );

    if (vastuResult.success && vastuResult.data) {
      context.vastuZones = vastuResult.data.recommended_zones;
      console.log('   ✓ Vastu zones computed');
      console.log('   Recommended zones:');
      const zones = vastuResult.data.recommended_zones;
      if (zones.northeast?.length) console.log(`     NE: ${zones.northeast.join(', ')}`);
      if (zones.east?.length) console.log(`     E: ${zones.east.join(', ')}`);
      if (zones.southeast?.length) console.log(`     SE: ${zones.southeast.join(', ')}`);
      if (zones.south?.length) console.log(`     S: ${zones.south.join(', ')}`);
      if (zones.southwest?.length) console.log(`     SW: ${zones.southwest.join(', ')}`);
      if (zones.west?.length) console.log(`     W: ${zones.west.join(', ')}`);
      if (zones.northwest?.length) console.log(`     NW: ${zones.northwest.join(', ')}`);
      if (zones.north?.length) console.log(`     N: ${zones.north.join(', ')}`);
      if (zones.center?.length) console.log(`     Center: ${zones.center.join(', ')}`);
    } else {
      console.log('   ⚠ Vastu analysis failed, using defaults');
    }
    console.log();

    // Step 2: Eco Design
    console.log('2️⃣  ECO-DESIGN STRATEGY...');
    const ecoAgent = createEcoDesignAgent();
    const ecoResult = await ecoAgent.execute(
      {
        buildableEnvelope: context.buildableEnvelope!,
        orientation: 'west',
        requirements: context.requirements!,
      },
      context
    );

    if (ecoResult.success && ecoResult.data) {
      context.ecoMandatory = ecoResult.data.mandatory_elements;
      context.energyStrategy = {
        passiveCooling: ecoResult.data.energy_strategy.passive_cooling,
        crossVentilation: ecoResult.data.energy_strategy.cross_ventilation,
        westWallMinimized: ecoResult.data.energy_strategy.west_wall_minimized,
        naturalLighting: ecoResult.data.energy_strategy.natural_lighting,
      };
      context.courtyardSpec = {
        required: ecoResult.data.courtyard.required,
        minArea: ecoResult.data.courtyard.min_area_sqft,
        position: ecoResult.data.courtyard.position,
      };
      context.verandaSpec = {
        required: ecoResult.data.veranda.required,
        width: ecoResult.data.veranda.min_width_feet,
        sides: ecoResult.data.veranda.sides,
      };
      console.log('   ✓ Eco elements defined');
      console.log(`   Mandatory: ${context.ecoMandatory?.join(', ')}`);
      console.log(`   Courtyard: ${context.courtyardSpec?.minArea} sqft (${context.courtyardSpec?.position})`);
      console.log(`   Veranda: ${context.verandaSpec?.width}' on ${context.verandaSpec?.sides?.join(', ')}`);
    } else {
      console.log('   ⚠ Eco design analysis failed, using defaults');
    }
    console.log();

    // Step 3: Architectural Zoning
    console.log('3️⃣  ARCHITECTURAL ZONING...');
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
      context.entrySequence = zoningResult.data.entry_sequence;
      console.log('   ✓ Zones defined');
      console.log(`   Public: ${zoningResult.data.zones.public.join(', ')}`);
      console.log(`   Semi-private: ${zoningResult.data.zones.semi_private.join(', ')}`);
      console.log(`   Private: ${zoningResult.data.zones.private.join(', ')}`);
      console.log(`   Service: ${zoningResult.data.zones.service.join(', ')}`);
      console.log(`   Entry: ${zoningResult.data.entry_sequence.join(' → ')}`);
    } else {
      console.log('   ⚠ Zoning analysis failed, using defaults');
    }
    console.log();

    // Step 4: Dimensioning
    console.log('4️⃣  ROOM DIMENSIONING...');
    const dimensioningAgent = createDimensioningAgent();
    const dimensioningResult = await dimensioningAgent.execute(
      {
        buildableEnvelope: context.buildableEnvelope!,
        architecturalZones: context.architecturalZones || {
          public: ['Living Room', 'Verandah'],
          semi_private: ['Dining', 'Kitchen'],
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
      context.courtyardSize = dimensioningResult.data.courtyard;
      context.totalBuiltUp = dimensioningResult.data.total_built_up_sqft;
      context.carpetArea = dimensioningResult.data.carpet_area_sqft;
      context.efficiency = dimensioningResult.data.efficiency_percent;

      console.log('   ✓ Rooms dimensioned');
      console.log();
      console.log('   📏 ROOM DIMENSIONS:');
      context.rooms.forEach(room => {
        console.log(`      ${room.name}: ${room.width}'×${room.depth}' = ${room.areaSqft} sqft [${room.zone}]`);
      });
      console.log();
      console.log(`   Courtyard: ${context.courtyardSize?.width}'×${context.courtyardSize?.depth}' = ${context.courtyardSize?.area_sqft} sqft`);
      console.log(`   Total Built-up: ${context.totalBuiltUp} sqft`);
      console.log(`   Carpet Area: ${context.carpetArea} sqft`);
      console.log(`   Efficiency: ${context.efficiency}%`);
    } else {
      console.log('   ⚠ Dimensioning failed:', dimensioningResult.error?.message);
    }
    console.log();

    // Step 5: Engineering Plan
    console.log('5️⃣  ENGINEERING PLAN...');
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
      context.staircase = {
        type: engineeringResult.data.staircase.type,
        position: engineeringResult.data.staircase.position,
        width: engineeringResult.data.staircase.width_feet,
        riserHeight: engineeringResult.data.staircase.riser_height_inches,
        treadWidth: engineeringResult.data.staircase.tread_width_inches,
      };
      console.log('   ✓ Engineering specs defined');
      console.log(`   Wall: ${context.wallSystem.material} (${context.wallSystem.externalThickness}" ext / ${context.wallSystem.internalThickness}" int)`);
      console.log(`   Staircase: ${context.staircase.type} at ${context.staircase.position}`);
    } else {
      console.log('   ⚠ Engineering plan failed:', engineeringResult.error?.message);
    }
    console.log();

    // Step 6: Design Validation
    console.log('6️⃣  DESIGN VALIDATION...');
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
      context.validationIssues = validationResult.data.issues;
      context.validationSeverity = validationResult.data.severity;
      console.log(`   ✓ Validation: ${context.validationStatus}`);
      if (validationResult.data.issues.length > 0) {
        validationResult.data.issues.forEach(issue => {
          const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`     ${icon} [${issue.category}] ${issue.message}`);
        });
      }
    } else {
      console.log('   ⚠ Validation failed:', validationResult.error?.message);
    }
    console.log();

    // Step 7: Visualization Prompts
    console.log('7️⃣  GENERATING VISUALIZATION PROMPTS...');
    const vizAgent = createVisualizationAgent();
    const vizResult = await vizAgent.execute(
      {
        rooms: context.rooms || [],
        orientation: 'west',
        ecoMandatory: context.ecoMandatory || [],
        materialPreferences: context.materialPreferences || [],
        plotDimensions: context.plot,
      },
      context
    );

    if (vizResult.success && vizResult.data) {
      context.renderPrompts = {
        courtyard: vizResult.data.courtyard_prompt,
        exterior: vizResult.data.exterior_prompt,
        interior: vizResult.data.interior_prompt,
        floorPlan: vizResult.data.floor_plan_prompt,
      };
      console.log('   ✓ Render prompts generated');
      console.log('   Ready for: Floor Plan, Courtyard, Exterior, Interior views');
    } else {
      console.log('   ⚠ Visualization prompts failed, using defaults');
      // Generate default prompts
      context.renderPrompts = {
        floorPlan: `Professional architectural 2D floor plan. West-facing Tamil Nadu house. ${context.plot?.width}x${context.plot?.depth} feet plot. Rooms: ${context.rooms?.map(r => `${r.name} (${r.width}x${r.depth}ft)`).join(', ')}. Central courtyard. Veranda at entrance. Room labels with dimensions. Wall thickness shown. Compass rose. Black lines on white background.`,
        courtyard: `Photorealistic 3D courtyard (mutram) of traditional Tamil Nadu house. Open-to-sky central space with Tulsi plant. Terracotta tiles. Surrounding rooms visible through doorways. Natural lighting from above. Traditional pillared corridors.`,
        exterior: `Photorealistic 3D exterior of west-facing Tamil Nadu house. Veranda with wooden pillars. Sloped Mangalore tile roof. Lime wash walls in cream. Ornate wooden door. Low compound wall. Coconut palm and flowering plants. Golden hour lighting.`,
        interior: `Photorealistic 3D interior of Tamil Nadu house living room facing courtyard. Terracotta floor tiles. White lime-washed walls. Teakwood ceiling beams. Traditional wooden windows. Natural daylight from courtyard. Ceiling fan. Brass lamps.`,
      };
      console.log('   ✓ Default render prompts generated');
    }
    console.log();

    // Step 8: Generate Floor Plan Image (if API key available)
    console.log('8️⃣  GENERATING FLOOR PLAN IMAGE...');
    const hasGoogleKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!hasGoogleKey) {
      console.log('   ⚠ GOOGLE_AI_API_KEY not set - skipping image generation');
      console.log('   Set GOOGLE_AI_API_KEY to generate actual floor plan images');
    } else {
      const imageAgent = createFloorPlanImageAgent({
        imagesToGenerate: ['floorPlan'],
        parallel: false,
        maxRetries: 2,
      });

      const imageResult = await imageAgent.execute(
        {
          renderPrompts: {
            floorPlan: context.renderPrompts?.floorPlan,
          },
          rooms: context.rooms?.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            width: r.width,
            depth: r.depth,
            area_sqft: r.areaSqft,
            zone: r.zone,
            adjacent_to: r.adjacentTo || [],
          })),
          plotDimensions: {
            width: context.plot!.width,
            depth: context.plot!.depth,
            unit: context.plot!.unit,
          },
          orientation: 'west',
          ecoElements: context.ecoMandatory,
        },
        context
      );

      if (imageResult.success && imageResult.data) {
        context.generatedImages = {
          floorPlan: imageResult.data.floorPlan,
        };
        console.log('   ✓ Floor plan image generated!');
        console.log(`   Model: ${imageResult.data.metadata.model}`);
        console.log(`   Generation time: ${imageResult.data.metadata.generationTime}ms`);

        // Save image to file
        if (imageResult.data.floorPlan?.base64Data) {
          const fs = await import('fs');
          const outputPath = `./output/survey-63-floor-plan-${Date.now()}.png`;

          // Ensure output directory exists
          if (!fs.existsSync('./output')) {
            fs.mkdirSync('./output', { recursive: true });
          }

          fs.writeFileSync(outputPath, Buffer.from(imageResult.data.floorPlan.base64Data, 'base64'));
          console.log(`   📁 Saved to: ${outputPath}`);
        }
      } else {
        console.log('   ⚠ Image generation failed:', imageResult.error?.message);
      }
    }
    console.log();

    // Final Summary
    console.log('═'.repeat(60));
    console.log('   FLOOR PLAN GENERATION COMPLETE');
    console.log('═'.repeat(60));
    console.log();
    console.log('📊 SUMMARY:');
    console.log(`   Session: ${context.sessionId}`);
    console.log(`   Plot: ${context.plot?.width}' × ${context.plot?.depth}' = ${context.plot?.area} sqft`);
    console.log(`   Orientation: West-facing`);
    console.log(`   Rooms: ${context.rooms?.length || 0}`);
    console.log(`   Built-up Area: ${context.totalBuiltUp} sqft`);
    console.log(`   Efficiency: ${context.efficiency}%`);
    console.log(`   Validation: ${context.validationStatus}`);
    console.log();

    // Output the floor plan prompt for manual rendering if needed
    if (context.renderPrompts?.floorPlan) {
      console.log('🎨 FLOOR PLAN RENDER PROMPT:');
      console.log('─'.repeat(60));
      console.log(context.renderPrompts.floorPlan);
      console.log('─'.repeat(60));
    }

    return context;

  } catch (error) {
    console.error('Pipeline error:', error);
    throw error;
  }
}

// Run
generateFloorPlan()
  .then(() => {
    console.log();
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
