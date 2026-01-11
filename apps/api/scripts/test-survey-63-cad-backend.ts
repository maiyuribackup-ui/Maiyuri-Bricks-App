/**
 * Survey No. 63 - Test CAD Backend with Handwritten Sketch Specs
 *
 * Tests the Python CAD backend with the exact specifications from
 * the handwritten plot sketch:
 * - Plot: 29'-0" × 43'-0"
 * - Setbacks: N=2', S=3', E=3'-6", W=2'
 * - Road: West side
 * - Rooms: Verandah, Living, Dining, Kitchen, Bedroom, Toilet, Staircase
 */

import { getCadService } from '../src/services/cad-service';
import * as fs from 'fs';
import * as path from 'path';

async function testSurvey63CAD() {
  console.log('═'.repeat(60));
  console.log('   SURVEY NO. 63 - CAD BACKEND TEST');
  console.log('   From Handwritten Plot Sketch');
  console.log('═'.repeat(60));
  console.log('');
  console.log('📐 PLOT SPECS (from sketch):');
  console.log('   Plot: 29\'-0" × 43\'-0"');
  console.log('   Setbacks: N=2\', S=3\', E=3\'-6", W=2\'');
  console.log('   Road: West side');
  console.log('   Orientation: North');
  console.log('');

  const cadService = getCadService({
    baseUrl: process.env.CAD_ENGINE_URL || 'http://localhost:8000',
  });

  // Check health
  const isAvailable = await cadService.isAvailable();
  if (!isAvailable) {
    console.log('❌ CAD service is not available');
    console.log('   Run: cd backend && python main.py');
    process.exit(1);
  }
  console.log('✅ CAD service is healthy\n');

  // Survey 63 specifications from handwritten sketch
  const survey63Input = {
    rooms: [
      {
        id: 'verandah',
        name: 'Verandah',
        type: 'verandah',
        width: 12,
        depth: 4,
        area_sqft: 48,
        zone: 'outdoor',
        adjacent_to: ['living-room'],
      },
      {
        id: 'living-room',
        name: 'Living Room',
        type: 'living',
        width: 12,
        depth: 12,
        area_sqft: 144,
        zone: 'public',
        adjacent_to: ['verandah', 'dining', 'staircase'],
      },
      {
        id: 'dining',
        name: 'Dining',
        type: 'dining',
        width: 10,
        depth: 10,
        area_sqft: 100,
        zone: 'public',
        adjacent_to: ['living-room', 'kitchen'],
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        type: 'kitchen',
        width: 8,
        depth: 10,
        area_sqft: 80,
        zone: 'service',
        adjacent_to: ['dining', 'common-toilet'],
      },
      {
        id: 'double-bedroom',
        name: 'Double Bedroom',
        type: 'bedroom',
        width: 12,
        depth: 12,
        area_sqft: 144,
        zone: 'private',
        adjacent_to: ['common-toilet'],
      },
      {
        id: 'common-toilet',
        name: 'Common Toilet',
        type: 'bathroom',
        width: 5,
        depth: 7,
        area_sqft: 35,
        zone: 'service',
        adjacent_to: ['double-bedroom', 'kitchen'],
      },
      {
        id: 'staircase',
        name: 'Staircase',
        type: 'staircase',
        width: 4,
        depth: 8,
        area_sqft: 32,
        zone: 'circulation',
        adjacent_to: ['living-room'],
      },
    ],
    wall_system: {
      external_thickness_inches: 9,
      internal_thickness_inches: 4.5,
      material: 'Burnt clay brick masonry with cement mortar 1:6',
      load_bearing_walls: ['north-external', 'south-external', 'east-external', 'west-external'],
    },
    staircase: {
      type: 'straight' as const,
      position: 'Near living room entrance',
      width_feet: 3.5,
      riser_height_inches: 7,
      tread_width_inches: 10,
    },
    plumbing_strategy: {
      wet_areas_grouped: true,
      shaft_positions: ['Adjacent to kitchen and toilet'],
      sewer_connection: 'west' as const,
    },
    ventilation_shafts: [
      {
        position: 'Near toilet and kitchen',
        serves_rooms: ['common-toilet', 'kitchen'],
      },
    ],
    expansion_provision: {
      direction: 'north' as const,
      type: 'vertical' as const,
      notes: 'Foundation designed for G+1, staircase provision included',
    },
    plot_dimensions: {
      width: 29,  // 29'-0"
      depth: 43,  // 43'-0"
      unit: 'feet',
    },
    orientation: 'north' as const,
    style: 'professional' as const,
    ai_render: false,
    background: 'white' as const,
    // Vastu zones for proper room placement
    vastu_zones: {
      southeast: ['kitchen'],
      southwest: ['double-bedroom'],
      northwest: ['common-toilet'],
      south: ['verandah'],
      center: ['living-room', 'dining'],
      west: ['staircase'],
    },
    // Road is on west side (from handwritten sketch)
    road_side: 'west',
  };

  console.log('🏠 ROOMS TO GENERATE:');
  let totalArea = 0;
  survey63Input.rooms.forEach(room => {
    console.log(`   • ${room.name}: ${room.width}' × ${room.depth}' = ${room.area_sqft} sqft`);
    totalArea += room.area_sqft;
  });
  console.log(`   ────────────────────────────`);
  console.log(`   Total: ${totalArea} sqft`);
  console.log('');

  console.log('🔄 Sending to CAD backend...\n');
  const startTime = Date.now();

  try {
    const result = await cadService.renderEngineeringPlan(survey63Input);
    const elapsed = Date.now() - startTime;

    if (result.success) {
      console.log('═'.repeat(60));
      console.log(`   ✅ FLOOR PLAN GENERATED! (${elapsed}ms)`);
      console.log('═'.repeat(60));
      console.log(`   📊 Rooms rendered: ${result.rooms_count}`);
      console.log(`   📐 Total area: ${result.total_area_sqft} sqft`);
      console.log(`   🎨 AI enhanced: ${result.ai_enhanced}`);

      // Save wireframe
      if (result.wireframe_base64) {
        const outputDir = path.join(__dirname, '..', 'output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outputPath = path.join(outputDir, `survey-63-cad-${timestamp}.png`);
        const buffer = Buffer.from(result.wireframe_base64, 'base64');
        fs.writeFileSync(outputPath, buffer);

        console.log('');
        console.log(`   🖼️  Wireframe saved:`);
        console.log(`       ${outputPath}`);
        console.log(`       Size: ${Math.round(buffer.length / 1024)} KB`);
      }

      if (result.dxf_path) {
        console.log(`   📄 DXF file: ${result.dxf_path}`);
      }

      console.log('');
      console.log('═'.repeat(60));
      console.log('   🎉 SURVEY NO. 63 CAD TEST COMPLETE!');
      console.log('═'.repeat(60));
    } else {
      console.log(`\n❌ Generation failed: ${result.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error}`);
    process.exit(1);
  }
}

// Run
testSurvey63CAD().catch(console.error);
