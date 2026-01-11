/**
 * Survey No. 63 - 3D Isometric Floor Plan Generation (v2.0)
 *
 * CORRECTED VERSION:
 * - "Double Bedroom" = 2 separate bedrooms (NOT 1 bedroom with double bed)
 * - Mutram with 4 pillars, open all 4 sides, water feature
 * - Vernacular architecture materials (Athangudi tiles, CSEB, oxide flooring)
 * - Door and window specifications per CPWD standards
 *
 * Uses Gemini Pro Image model for higher quality output.
 */

import { GoogleGenAI } from '@google/genai';

// Survey No. 63 extracted data - CORRECTED
const SURVEY_63 = {
  projectName: 'ECO-FRIENDLY COURTYARD HOUSE',
  surveyNo: '63',
  dimensions: {
    north: "29'-0\"",
    south: "27'-6\"",
    east: "41'-0\"",
    west: "43'-0\"",
  },
  buildable: {
    width: 24, // feet (after setbacks: 29 - 2 - 3 = 24 approx)
    depth: 35, // feet (after setbacks: 41 - 3.5 - 2 = 35.5 approx)
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
  orientation: 'West-facing',
  // CORRECTED: "Double Bedroom" means 2 SEPARATE bedrooms
  rooms: [
    { name: 'Living Room', size: "12'×12'", sqft: 144, zone: 'public', vastu: 'North', furniture: 'sofa set, coffee table, TV unit' },
    { name: 'Dining', size: "10'×10'", sqft: 100, zone: 'semi-private', vastu: 'West', furniture: 'dining table with 4 chairs' },
    { name: 'Kitchen', size: "8'×10'", sqft: 80, zone: 'service', vastu: 'Southeast', furniture: 'L-shaped counter, stove, sink, cabinets' },
    { name: 'Bedroom 1', size: "10'×12'", sqft: 120, zone: 'private', vastu: 'Southwest', furniture: 'double bed, wardrobe, side table' },
    { name: 'Bedroom 2', size: "10'×10'", sqft: 100, zone: 'private', vastu: 'South', furniture: 'single bed, study table, wardrobe' },
    { name: 'Common Toilet', size: "5'×7'", sqft: 35, zone: 'service', vastu: 'Northwest', furniture: 'WC, wash basin, shower' },
    { name: 'Staircase', size: "4'×8'", sqft: 32, zone: 'service', vastu: 'South', furniture: 'stairs going up (clockwise)' },
    { name: 'Verandah', size: "4'×18'", sqft: 72, zone: 'public', vastu: 'West (entrance)', furniture: 'traditional sitting bench, planters' },
    { name: 'Mutram', size: "8'×8'", sqft: 64, zone: 'central', vastu: 'Center (Brahmasthan)', furniture: '4 pillars only, open all sides, water feature, Tulsi plant' },
  ],
  totalBuiltUp: 747,
  efficiency: 85,
  // Door specifications (CPWD standards)
  doors: {
    mainEntrance: { size: "7'×3'6\"", cpwd: '10DS21', type: 'Teak wood double panel' },
    bedroom: { size: "7'×3'", cpwd: '9DS20', type: 'Flush door' },
    bathroom: { size: "7'×2'6\"", cpwd: '7.5DS20', type: 'PVC/Aluminum' },
    kitchen: { size: "7'×2'9\"", cpwd: '8DS20', type: 'Flush door' },
  },
  // Window specifications (CPWD standards)
  windows: {
    bedroom: { size: "4'×4'", cpwd: '12W12', sillHeight: "2'6\"" },
    living: { size: "5'×4'", cpwd: '15W12', sillHeight: "2'6\"" },
    kitchen: { size: "4'×3'", cpwd: '12W9', sillHeight: "3'6\"" },
    bathroom: { size: "2'×1'6\"", cpwd: '6W5', sillHeight: "5'" },
    ventilator: { size: "2'×1'6\"", cpwd: '6V5', placement: 'high' },
  },
  // Vernacular architecture materials
  materials: {
    walls: 'CSEB (Compressed Stabilized Earth Blocks) with lime wash',
    livingFloor: 'Red oxide flooring with brass border strips',
    bedroomFloor: 'Red oxide flooring',
    courtyardFloor: 'Athangudi tiles (traditional Chettinad pattern)',
    verandahFloor: 'Athangudi tiles / stone',
    bathroomFloor: 'Kadappa stone (anti-skid)',
    roof: 'Mangalore tiles over RCC slab',
    ceiling: 'Jack arch / exposed terracotta panels',
    doors: 'Teak wood with traditional carvings',
    windows: 'Teak wood frames with MS grills',
  },
  ecoFeatures: [
    'Traditional mutram with 4 pillars, open to sky, water feature',
    'Shaded verandah (Thinnai) at entrance',
    'Naturally ventilated and cross-ventilated rooms',
    'Rainwater harvesting via courtyard',
    'CSEB walls for thermal comfort',
    'Red oxide / Athangudi flooring (no tiles needed)',
    'Suitable for future vertical expansion',
  ],
};

// 3D Isometric Floor Plan Prompt - CORRECTED VERSION
const ISOMETRIC_3D_PROMPT = `
Create a professional 3D ISOMETRIC FLOOR PLAN visualization for client presentation.

STYLE REFERENCE: Traditional Tamil Nadu courtyard house in modern 3D isometric view with:
- Bird's eye view at 45-degree isometric angle
- Cutaway walls (partial height) showing interior layout
- Realistic furniture and fixtures inside each room
- Traditional material textures visible
- Soft shadows for depth
- Clean white/cream background
- Professional architectural presentation quality

PROJECT: GROUND FLOOR PLAN - ${SURVEY_63.projectName}
SURVEY NO: ${SURVEY_63.surveyNo}

═══════════════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY
═══════════════════════════════════════════════════════════════════

PLOT DIMENSIONS (TRAPEZOIDAL):
- NORTH (top): ${SURVEY_63.dimensions.north} ← SHORTER side
- SOUTH (bottom): ${SURVEY_63.dimensions.south} ← SHORTER side
- EAST (right): ${SURVEY_63.dimensions.east} ← LONGER side
- WEST (left): ${SURVEY_63.dimensions.west} ← LONGER side (road)
- Plot is DEEPER (East-West ~42') than WIDE (North-South ~28')

SETBACKS:
- North: ${SURVEY_63.setbacks.north}
- South: ${SURVEY_63.setbacks.south}
- East: ${SURVEY_63.setbacks.east}
- West: ${SURVEY_63.setbacks.west}

ORIENTATION:
- North arrow pointing to TOP-RIGHT corner
- Road (${SURVEY_63.road.width} wide) on WEST side (bottom-left in isometric)
- Entrance from West via Verandah

═══════════════════════════════════════════════════════════════════
ROOM LAYOUT - EXACT LABELS (DO NOT CHANGE NAMES)
═══════════════════════════════════════════════════════════════════

${SURVEY_63.rooms.map(r => `• ${r.name}: ${r.size} (${r.vastu}) - ${r.furniture}`).join('\n')}

IMPORTANT ROOM NOTES:
1. "Bedroom 1" and "Bedroom 2" are TWO SEPARATE ROOMS (not one room)
2. "Mutram" is the CENTRAL COURTYARD with:
   - FOUR PILLARS at corners (traditional carved stone/wood)
   - OPEN from ALL 4 SIDES (no walls enclosing it)
   - Water feature/pool in center (4'×4' with stone edge)
   - Tulsi plant pedestal
   - Athangudi tile flooring
   - Surrounding covered corridor on all sides

═══════════════════════════════════════════════════════════════════
VERNACULAR ARCHITECTURE - MATERIALS
═══════════════════════════════════════════════════════════════════

WALLS: ${SURVEY_63.materials.walls}
- Show earth-toned CSEB blocks (exposed or lime-washed cream)
- 9" thick walls for thermal mass

FLOORING (show different textures):
- Living/Dining: ${SURVEY_63.materials.livingFloor}
- Bedrooms: ${SURVEY_63.materials.bedroomFloor}
- Mutram (Courtyard): ${SURVEY_63.materials.courtyardFloor}
- Verandah: ${SURVEY_63.materials.verandahFloor}
- Bathroom: ${SURVEY_63.materials.bathroomFloor}

CEILING: ${SURVEY_63.materials.ceiling}
- Show exposed beams with terracotta panels between

DOORS: ${SURVEY_63.materials.doors}
- Main entrance: ${SURVEY_63.doors.mainEntrance.size} (double panel, carved)
- Room doors: ${SURVEY_63.doors.bedroom.size}

WINDOWS: ${SURVEY_63.materials.windows}
- Bedroom windows: ${SURVEY_63.windows.bedroom.size}
- Living windows: ${SURVEY_63.windows.living.size}

═══════════════════════════════════════════════════════════════════
VISUAL REQUIREMENTS
═══════════════════════════════════════════════════════════════════

1. 3D ISOMETRIC VIEW at 45° angle from above

2. WALLS shown as cutaway (half height) to reveal interiors

3. FURNITURE in each room:
   - Living Room: Wooden sofa set, coffee table, TV unit
   - Dining: Wooden dining table with 4 chairs
   - Kitchen: L-shaped counter, stove, sink, overhead cabinets
   - Bedroom 1: Double bed with headboard, wardrobe, side table
   - Bedroom 2: Single bed, study table, small wardrobe
   - Common Toilet: WC, wash basin, shower area
   - Staircase: Stairs going up (show 3-4 visible steps)
   - Verandah: Traditional wooden bench, potted plants
   - Mutram: 4 PILLARS at corners, water feature in center, Tulsi pedestal

4. MATERIAL TEXTURES (critical for vernacular feel):
   - Red oxide flooring: Deep maroon/terracotta color
   - Athangudi tiles: Geometric patterns in earth tones
   - CSEB walls: Earthy tan/cream color
   - Kadappa stone: Grey-green in bathroom
   - Teak wood: Warm brown for doors/furniture

5. COLOR SCHEME:
   - Walls: Cream/off-white (lime wash over CSEB)
   - Floors: Terracotta red (oxide), earth patterns (Athangudi)
   - Wood: Warm brown tones
   - Courtyard: Blue-green water, earth tiles
   - Landscaping: Green plants, grass in setbacks

6. ROOM LABELS - EXACT TEXT (with dimensions):
   - "LIVING ROOM 12'×12'"
   - "DINING 10'×10'"
   - "KITCHEN 8'×10'"
   - "BEDROOM 1 10'×12'"
   - "BEDROOM 2 10'×10'"
   - "COMMON TOILET 5'×7'"
   - "STAIRCASE 4'×8'"
   - "VERANDAH 4'×18'"
   - "MUTRAM 8'×8'"

7. COMPASS ROSE: North indicator in top-right corner

8. ROAD: "${SURVEY_63.road.width} WIDE ROAD" label on West side

9. SETBACK AREAS: Green landscaping/grass around the building

10. DIMENSION LINES: Show overall plot dimensions on all 4 sides

═══════════════════════════════════════════════════════════════════
HEADER & FOOTER
═══════════════════════════════════════════════════════════════════

HEADER (Top of image):
- Title: "GROUND FLOOR PLAN: ECO-FRIENDLY COURTYARD HOUSE"
- Subtitle: "SURVEY NO: 63"
- Dimensions: "N: ${SURVEY_63.dimensions.north}, S: ${SURVEY_63.dimensions.south}, E: ${SURVEY_63.dimensions.east}, W: ${SURVEY_63.dimensions.west}"
- Setbacks: "N: ${SURVEY_63.setbacks.north}, S: ${SURVEY_63.setbacks.south}, E: ${SURVEY_63.setbacks.east}, W: ${SURVEY_63.setbacks.west}"

FOOTER (Bottom of image):
"VERNACULAR ECO-DESIGN: Built with traditional materials"
Checkmarks:
✓ Traditional Mutram with 4 pillars & water feature
✓ CSEB walls for thermal comfort
✓ Athangudi tiles & Red oxide flooring
✓ Cross-ventilated rooms
✓ Rainwater harvesting ready
✓ Future expansion possible

═══════════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════

Generate a HIGH-QUALITY 3D isometric architectural visualization that:
- Looks professional and suitable for client presentation
- Shows the traditional Tamil Nadu courtyard house character
- Clearly displays all rooms with correct labels
- Highlights vernacular materials (CSEB, oxide flooring, Athangudi)
- Makes the central Mutram (courtyard) a prominent feature with 4 pillars

═══════════════════════════════════════════════════════════════════
VALIDATION CHECKLIST (Image MUST satisfy ALL)
═══════════════════════════════════════════════════════════════════
□ TWO separate bedrooms labeled "BEDROOM 1" and "BEDROOM 2"
□ MUTRAM has FOUR PILLARS at corners (no walls)
□ MUTRAM is OPEN from all 4 sides
□ MUTRAM has water feature in center
□ Red oxide / Athangudi flooring visible
□ North dimension = ${SURVEY_63.dimensions.north} (shorter than East)
□ East dimension = ${SURVEY_63.dimensions.east} (longer than North)
□ Road on West side with ${SURVEY_63.road.width} label
□ All 9 rooms labeled with correct names
`.trim();

async function main() {
  console.log('═'.repeat(70));
  console.log('   SURVEY NO. 63 - 3D ISOMETRIC FLOOR PLAN (v2.0 CORRECTED)');
  console.log('═'.repeat(70));
  console.log();

  console.log('📐 PROJECT: ' + SURVEY_63.projectName);
  console.log('   Survey No:', SURVEY_63.surveyNo);
  console.log();

  console.log('📏 PLOT DIMENSIONS:');
  console.log(`   North: ${SURVEY_63.dimensions.north} (shorter)`);
  console.log(`   South: ${SURVEY_63.dimensions.south} (shorter)`);
  console.log(`   East: ${SURVEY_63.dimensions.east} (longer)`);
  console.log(`   West: ${SURVEY_63.dimensions.west} (longer, road)`);
  console.log(`   Buildable: ~${SURVEY_63.buildable.width}'×${SURVEY_63.buildable.depth}'`);
  console.log();

  console.log('🏠 ROOMS (CORRECTED - 2 separate bedrooms):');
  SURVEY_63.rooms.forEach(room => {
    console.log(`   • ${room.name}: ${room.size} = ${room.sqft} sqft (${room.vastu})`);
  });
  console.log(`   Total: ${SURVEY_63.totalBuiltUp} sqft (${SURVEY_63.efficiency}% efficiency)`);
  console.log();

  console.log('🏛️ VERNACULAR MATERIALS:');
  console.log(`   Walls: ${SURVEY_63.materials.walls}`);
  console.log(`   Living Floor: ${SURVEY_63.materials.livingFloor}`);
  console.log(`   Courtyard: ${SURVEY_63.materials.courtyardFloor}`);
  console.log(`   Bathroom: ${SURVEY_63.materials.bathroomFloor}`);
  console.log();

  console.log('🚪 DOOR SPECS:');
  console.log(`   Main Entrance: ${SURVEY_63.doors.mainEntrance.size}`);
  console.log(`   Bedroom: ${SURVEY_63.doors.bedroom.size}`);
  console.log(`   Bathroom: ${SURVEY_63.doors.bathroom.size}`);
  console.log();

  console.log('🪟 WINDOW SPECS:');
  console.log(`   Bedroom: ${SURVEY_63.windows.bedroom.size} (sill: ${SURVEY_63.windows.bedroom.sillHeight})`);
  console.log(`   Living: ${SURVEY_63.windows.living.size}`);
  console.log(`   Bathroom: ${SURVEY_63.windows.bathroom.size} (sill: ${SURVEY_63.windows.bathroom.sillHeight})`);
  console.log();

  console.log('🌿 ECO-FEATURES:');
  SURVEY_63.ecoFeatures.forEach(feature => {
    console.log(`   ✓ ${feature}`);
  });
  console.log();

  console.log('🎨 GENERATING 3D ISOMETRIC FLOOR PLAN...');
  console.log('   Model: gemini-3-pro-image-preview');
  console.log('   Prompt length:', ISOMETRIC_3D_PROMPT.length, 'characters');
  console.log();

  const startTime = Date.now();

  try {
    const geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

    const result = await geminiClient.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [{ role: 'user', parts: [{ text: ISOMETRIC_3D_PROMPT }] }],
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const duration = Date.now() - startTime;

    let imageData: string | null = null;
    let mimeType = 'image/png';

    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            imageData = part.inlineData.data;
            mimeType = part.inlineData.mimeType || 'image/png';
            break;
          }
        }
      }
    }

    if (imageData) {
      console.log('✅ 3D ISOMETRIC IMAGE GENERATED SUCCESSFULLY!');
      console.log(`   Time: ${duration}ms`);
      console.log(`   Format: ${mimeType}`);

      const fs = await import('fs');
      const path = await import('path');

      const outputDir = path.join(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = Date.now();
      const outputPath = path.join(outputDir, `survey-63-3d-isometric-${timestamp}.png`);
      fs.writeFileSync(outputPath, Buffer.from(imageData, 'base64'));

      console.log(`   📁 Saved to: ${outputPath}`);

      const promptPath = path.join(outputDir, `survey-63-3d-prompt-${timestamp}.txt`);
      fs.writeFileSync(promptPath, ISOMETRIC_3D_PROMPT);
      console.log(`   📝 Prompt saved to: ${promptPath}`);

    } else {
      console.log('❌ IMAGE GENERATION FAILED');
      console.log('   No image data in response');
      console.log('   Response:', JSON.stringify(result, null, 2).substring(0, 500));
    }

  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
  }

  console.log();
  console.log('═'.repeat(70));
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
