/**
 * Test CAD Backend Integration
 *
 * Tests the Backend Bridge connection between TypeScript and Python CAD Engine.
 */

import { getCadService } from '../src/services/cad-service';

async function testCadIntegration() {
  console.log('🔧 Testing CAD Backend Integration...\n');

  const cadService = getCadService({
    baseUrl: process.env.CAD_ENGINE_URL || 'http://localhost:8000',
  });

  // Test 1: Health Check
  console.log('1️⃣ Testing health check...');
  try {
    const isAvailable = await cadService.isAvailable();
    if (isAvailable) {
      console.log('   ✅ CAD service is healthy\n');
    } else {
      console.log('   ❌ CAD service is not available\n');
      process.exit(1);
    }
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error}\n`);
    process.exit(1);
  }

  // Test 2: Render Engineering Plan
  console.log('2️⃣ Testing engineering plan rendering...');
  try {
    const testInput = {
      rooms: [
        {
          id: 'living-room',
          name: 'Living Room',
          type: 'living',
          width: 15,
          depth: 12,
          area_sqft: 180,
          zone: 'public',
          adjacent_to: ['kitchen', 'foyer'],
        },
        {
          id: 'kitchen',
          name: 'Kitchen',
          type: 'kitchen',
          width: 10,
          depth: 8,
          area_sqft: 80,
          zone: 'service',
          adjacent_to: ['living-room', 'dining'],
        },
        {
          id: 'master-bedroom',
          name: 'Master Bedroom',
          type: 'bedroom',
          width: 14,
          depth: 12,
          area_sqft: 168,
          zone: 'private',
          adjacent_to: ['attached-bath'],
        },
        {
          id: 'attached-bath',
          name: 'Attached Bathroom',
          type: 'bathroom',
          width: 8,
          depth: 6,
          area_sqft: 48,
          zone: 'private',
          adjacent_to: ['master-bedroom'],
        },
        {
          id: 'courtyard',
          name: 'Courtyard',
          type: 'courtyard',
          width: 10,
          depth: 10,
          area_sqft: 100,
          zone: 'outdoor',
          adjacent_to: ['living-room', 'kitchen'],
        },
      ],
      wall_system: {
        external_thickness_inches: 9,
        internal_thickness_inches: 4.5,
        material: 'Burnt clay brick masonry with cement mortar 1:6',
        load_bearing_walls: ['north-external', 'south-external'],
      },
      staircase: {
        type: 'l-shaped' as const,
        position: 'Near living room entrance',
        width_feet: 3.5,
        riser_height_inches: 7,
        tread_width_inches: 10,
      },
      plumbing_strategy: {
        wet_areas_grouped: true,
        shaft_positions: ['Adjacent to kitchen and bathroom cluster'],
        sewer_connection: 'south' as const,
      },
      ventilation_shafts: [
        {
          position: 'Near bathroom cluster',
          serves_rooms: ['attached-bath', 'kitchen'],
        },
      ],
      expansion_provision: {
        direction: 'south' as const,
        type: 'vertical' as const,
        notes: 'Foundation designed for G+1',
      },
      plot_dimensions: {
        width: 30,
        depth: 40,
        unit: 'feet',
      },
      orientation: 'north' as const,
      style: 'professional' as const,
      ai_render: false, // Set to false for faster testing (skip AI rendering)
      background: 'white' as const,
    };

    console.log('   📐 Sending engineering plan to CAD service...');
    console.log(`   📦 Rooms: ${testInput.rooms.length}`);
    console.log(`   📏 Plot: ${testInput.plot_dimensions.width}' × ${testInput.plot_dimensions.depth}'`);

    const startTime = Date.now();
    const result = await cadService.renderEngineeringPlan(testInput);
    const elapsed = Date.now() - startTime;

    if (result.success) {
      console.log(`   ✅ Rendering successful (${elapsed}ms)`);
      console.log(`   📊 Rooms rendered: ${result.rooms_count}`);
      console.log(`   📐 Total area: ${result.total_area_sqft} sq.ft`);
      console.log(`   🎨 AI enhanced: ${result.ai_enhanced}`);

      if (result.wireframe_base64) {
        console.log(`   🖼️ Wireframe: ${result.wireframe_base64.substring(0, 50)}...`);
        console.log(`   📏 Wireframe size: ${Math.round(result.wireframe_base64.length / 1024)} KB`);
      }

      if (result.dxf_path) {
        console.log(`   📄 DXF path: ${result.dxf_path}`);
      }
    } else {
      console.log(`   ❌ Rendering failed: ${result.message}`);
    }

    console.log('');
  } catch (error) {
    console.log(`   ❌ Rendering failed: ${error}\n`);
    process.exit(1);
  }

  // Test 3: Test with AI rendering (optional)
  console.log('3️⃣ Testing with AI rendering (Gemini)...');
  try {
    const aiTestInput = {
      rooms: [
        {
          id: 'living',
          name: 'Living Room',
          type: 'living',
          width: 12,
          depth: 10,
          area_sqft: 120,
          zone: 'public',
          adjacent_to: [],
        },
      ],
      wall_system: {
        external_thickness_inches: 9,
        internal_thickness_inches: 4.5,
        material: 'Brick masonry',
        load_bearing_walls: [],
      },
      ventilation_shafts: [],
      plot_dimensions: {
        width: 20,
        depth: 25,
        unit: 'feet',
      },
      orientation: 'north' as const,
      style: 'professional' as const,
      ai_render: true, // Enable AI rendering
      background: 'white' as const,
    };

    console.log('   🤖 Sending request with AI rendering enabled...');
    const startTime = Date.now();
    const result = await cadService.renderEngineeringPlan(aiTestInput);
    const elapsed = Date.now() - startTime;

    if (result.success) {
      console.log(`   ✅ AI rendering successful (${elapsed}ms)`);
      console.log(`   🎨 AI enhanced: ${result.ai_enhanced}`);

      if (result.ai_rendered_base64) {
        console.log(`   🖼️ AI rendered: ${result.ai_rendered_base64.substring(0, 50)}...`);
        console.log(`   📏 AI image size: ${Math.round(result.ai_rendered_base64.length / 1024)} KB`);
      } else {
        console.log('   ⚠️ AI rendering returned but no image data (Gemini may have failed)');
      }
    } else {
      console.log(`   ⚠️ AI rendering failed: ${result.message}`);
    }
  } catch (error) {
    console.log(`   ⚠️ AI rendering test failed: ${error}`);
    console.log('   (This is expected if Gemini API key is not configured)');
  }

  console.log('\n✅ CAD Backend Integration Test Complete!');
}

// Run the test
testCadIntegration().catch(console.error);
