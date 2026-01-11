/**
 * Survey No. 63 - Direct Floor Plan Image Generation
 *
 * Generates a floor plan image directly using the extracted data.
 */

import { generateImage } from '../src/cloudcore/services/ai/gemini';

// Survey No. 63 extracted data
const SURVEY_63 = {
  dimensions: {
    north: "29'-0\"",
    south: "27'-6\"",
    east: "41'-0\"",
    west: "43'-0\"",
  },
  buildable: {
    width: 24, // feet (after setbacks)
    depth: 36.5, // feet (after setbacks)
  },
  setbacks: {
    north: "2'-0\"",
    south: "3'-0\"",
    east: "3'-6\"",
    west: "2'-0\"",
  },
  road: 'West side (20\' road)',
  orientation: 'West-facing',
  rooms: [
    { name: 'Living Room', size: "12'×14'", sqft: 168, zone: 'public' },
    { name: 'Dining', size: "10'×10'", sqft: 100, zone: 'semi-private' },
    { name: 'Kitchen', size: "8'×10'", sqft: 80, zone: 'service', vastu: 'Southeast' },
    { name: 'Double Bedroom', size: "12'×12'", sqft: 144, zone: 'private', vastu: 'Southwest' },
    { name: 'Dress Room', size: "6'×8'", sqft: 48, zone: 'private' },
    { name: 'Common Toilet', size: "5'×7'", sqft: 35, zone: 'service' },
    { name: 'Staircase', size: "4'×10'", sqft: 40, zone: 'service' },
    { name: 'Verandah', size: "4'×20'", sqft: 80, zone: 'public', vastu: 'West (entrance)' },
    { name: 'Courtyard', size: "8'×8'", sqft: 64, zone: 'central', vastu: 'Center (Brahmasthan)' },
  ],
  totalBuiltUp: 759,
  efficiency: 87,
};

// Detailed floor plan prompt with DIMENSION ACCURACY REQUIREMENTS
const FLOOR_PLAN_PROMPT = `
Professional architectural 2D floor plan drawing.

PROJECT: Survey No. 63 - Tamil Nadu Residential House

CRITICAL DIMENSION REQUIREMENTS (MUST display EXACTLY as specified - NO rounding):
- Total Plot: MUST show exactly ${SURVEY_63.dimensions.north} (North) × ${SURVEY_63.dimensions.south} (South) × ${SURVEY_63.dimensions.east} (East) × ${SURVEY_63.dimensions.west} (West)
- Buildable Area: MUST show exactly ${SURVEY_63.buildable.width}'×${SURVEY_63.buildable.depth}'
- ORIENTATION: ${SURVEY_63.orientation} entrance
- SETBACKS: MUST show exactly North ${SURVEY_63.setbacks.north}, South ${SURVEY_63.setbacks.south}, East ${SURVEY_63.setbacks.east}, West ${SURVEY_63.setbacks.west}

ROOM LAYOUT (MUST display EXACT dimensions as specified):
${SURVEY_63.rooms.map(r => `• ${r.name}: MUST show exactly ${r.size} = ${r.sqft} sqft${r.vastu ? ` (${r.vastu})` : ''}`).join('\n')}

TOTAL BUILT-UP: MUST show exactly ${SURVEY_63.totalBuiltUp} sqft
EFFICIENCY: MUST show exactly ${SURVEY_63.efficiency}%

DESIGN REQUIREMENTS:
- Central open courtyard (mutram) for natural ventilation
- West-facing veranda (thinnai) at entrance
- Kitchen in Southeast (Agni corner per Vastu)
- Master bedroom in Southwest
- Cross-ventilation design
- Living room near entrance with courtyard view
- Staircase near entrance for future expansion

DRAWING STYLE:
- Clean top-down 2D view
- Black lines on white background
- Room labels with names and EXACT dimensions in feet-inches format
- Door and window symbols
- Wall thickness shown (9" external, 4.5" internal)
- Compass rose indicating North
- MANDATORY: Scale ruler showing 1/4" = 1'-0"
- MANDATORY: Header must display exact plot dimensions as specified above
- Professional architectural drafting style
- All dimensions MUST match input EXACTLY - NO approximation allowed
`.trim();

async function main() {
  console.log('═'.repeat(60));
  console.log('   SURVEY NO. 63 - FLOOR PLAN IMAGE GENERATION');
  console.log('═'.repeat(60));
  console.log();

  console.log('📐 PLOT SUMMARY:');
  console.log(`   Dimensions: N=${SURVEY_63.dimensions.north}, S=${SURVEY_63.dimensions.south}`);
  console.log(`              E=${SURVEY_63.dimensions.east}, W=${SURVEY_63.dimensions.west}`);
  console.log(`   Buildable: ${SURVEY_63.buildable.width}'×${SURVEY_63.buildable.depth}'`);
  console.log(`   Road: ${SURVEY_63.road}`);
  console.log();

  console.log('🏠 ROOMS:');
  SURVEY_63.rooms.forEach(room => {
    console.log(`   • ${room.name}: ${room.size} = ${room.sqft} sqft`);
  });
  console.log(`   Total: ${SURVEY_63.totalBuiltUp} sqft (${SURVEY_63.efficiency}% efficiency)`);
  console.log();

  console.log('🎨 GENERATING FLOOR PLAN IMAGE...');
  console.log('   Using prompt length:', FLOOR_PLAN_PROMPT.length, 'characters');
  console.log();

  const startTime = Date.now();

  try {
    const result = await generateImage(FLOOR_PLAN_PROMPT, {
      includeTextResponse: false,
    });

    const duration = Date.now() - startTime;

    if (result.success && result.data && result.data.images.length > 0) {
      console.log('✅ IMAGE GENERATED SUCCESSFULLY!');
      console.log(`   Time: ${duration}ms`);
      console.log(`   Images: ${result.data.images.length}`);
      console.log(`   Format: ${result.data.images[0].mimeType}`);

      // Save to file
      const fs = await import('fs');
      const path = await import('path');

      const outputDir = path.join(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `survey-63-floor-plan-${Date.now()}.png`);
      fs.writeFileSync(outputPath, Buffer.from(result.data.images[0].base64Data, 'base64'));

      console.log(`   📁 Saved to: ${outputPath}`);

      // Also save the prompt for reference
      const promptPath = path.join(outputDir, `survey-63-prompt-${Date.now()}.txt`);
      fs.writeFileSync(promptPath, FLOOR_PLAN_PROMPT);
      console.log(`   📝 Prompt saved to: ${promptPath}`);

    } else {
      console.log('❌ IMAGE GENERATION FAILED');
      console.log('   Error:', result.error?.message || 'Unknown error');
      if (result.error?.details) {
        console.log('   Details:', JSON.stringify(result.error.details, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
  }

  console.log();
  console.log('═'.repeat(60));
}

// Run
main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
