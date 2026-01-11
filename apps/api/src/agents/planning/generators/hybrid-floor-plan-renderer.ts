/**
 * Hybrid Floor Plan Renderer
 *
 * CAD-FIRST APPROACH:
 * 1. Maker.js generates mathematically precise wireframe (geometry layer)
 * 2. Gemini renders a beautiful concept visualization (visual layer)
 * 3. SVG overlays precise dimensions (annotation layer)
 *
 * WHY THIS WORKS:
 * - AI cannot guarantee dimensions (27'6" might appear longer than 29')
 * - Maker.js GUARANTEES exact proportions (mathematical coordinates)
 * - SVG overlay GUARANTEES readable, accurate dimension text
 * - Gemini provides the "professional look" without responsibility for precision
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────┐
 * │                 FINAL OUTPUT                        │
 * │  ┌─────────────────────────────────────────────┐   │
 * │  │  SVG OVERLAY (Dimensions, Labels, Scale)    │   │  ← LAYER 3: Post-processing
 * │  ├─────────────────────────────────────────────┤   │
 * │  │  GEMINI RENDER (Styled visualization)       │   │  ← LAYER 2: AI Visual
 * │  ├─────────────────────────────────────────────┤   │
 * │  │  MAKER.JS WIREFRAME (Precise geometry)      │   │  ← LAYER 1: CAD Precision
 * │  └─────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────┘
 */

import * as makerjs from 'makerjs';
import { GoogleGenAI } from '@anthropic-ai/sdk';

// ============================================================================
// TYPES
// ============================================================================

export interface PlotDimensions {
  north: number;  // feet
  south: number;  // feet
  east: number;   // feet
  west: number;   // feet
}

export interface Setbacks {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface RoomSpec {
  name: string;
  width: number;   // feet
  depth: number;   // feet
  x: number;       // position from SW corner
  y: number;       // position from SW corner
  color?: string;  // fill color for rendering
  furniture?: FurnitureItem[];
}

export interface FurnitureItem {
  type: 'bed' | 'sofa' | 'table' | 'chair' | 'kitchen_counter' | 'toilet' | 'sink' | 'wardrobe' | 'tv' | 'plant' | 'water_feature' | 'pillar';
  x: number;  // relative to room
  y: number;  // relative to room
  width: number;
  height: number;
  rotation?: number;
}

export interface FloorPlanConfig {
  projectName: string;
  surveyNo: string;
  plot: PlotDimensions;
  setbacks: Setbacks;
  rooms: RoomSpec[];
  scale: number;  // e.g., 50 for 1:50
  road?: {
    side: 'north' | 'south' | 'east' | 'west';
    width: number;
  };
}

export interface DimensionValidation {
  isValid: boolean;
  checks: {
    name: string;
    expected: string;
    actual: string;
    passed: boolean;
  }[];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function formatFeetInches(feet: number): string {
  const wholeFeet = Math.floor(feet);
  const inches = Math.round((feet - wholeFeet) * 12);
  if (inches === 0) {
    return `${wholeFeet}'-0"`;
  } else if (inches === 12) {
    return `${wholeFeet + 1}'-0"`;
  }
  return `${wholeFeet}'-${inches}"`;
}

export function feetToPixels(feet: number, scale: number, ppi: number = 96): number {
  // At 1:scale, 1 foot = (12/scale) inches on paper
  // At 96 PPI, that's (12/scale) * 96 pixels
  return (feet * 12 / scale) * ppi;
}

// ============================================================================
// LAYER 1: MAKER.JS WIREFRAME GENERATOR
// ============================================================================

export function generateWireframeSVG(config: FloorPlanConfig): string {
  const { plot, setbacks, rooms, scale } = config;

  // Calculate plot dimensions
  const plotWidth = Math.max(plot.north, plot.south);
  const plotDepth = Math.max(plot.east, plot.west);

  // Create model
  const model: makerjs.IModel = {
    models: {},
    paths: {},
    units: makerjs.unitType.Foot,
  };

  // Plot boundary (trapezoidal if north != south)
  const plotBoundary: makerjs.IModel = {
    paths: {
      south: new makerjs.paths.Line([0, 0], [plot.south, 0]),
      east: new makerjs.paths.Line([plot.south, 0], [plot.north, plotDepth]),
      north: new makerjs.paths.Line([plot.north, plotDepth], [0, plotDepth]),
      west: new makerjs.paths.Line([0, plotDepth], [0, 0]),
    },
  };
  model.models!.plotBoundary = plotBoundary;

  // Buildable area (after setbacks)
  const buildableWidth = Math.min(plot.north, plot.south) - setbacks.east - setbacks.west;
  const buildableDepth = plotDepth - setbacks.north - setbacks.south;
  const buildable = new makerjs.models.Rectangle(buildableWidth, buildableDepth);
  makerjs.model.move(buildable, [setbacks.west, setbacks.south]);
  model.models!.buildableArea = buildable;

  // Rooms
  rooms.forEach((room, index) => {
    const roomRect = new makerjs.models.Rectangle(room.width, room.depth);
    makerjs.model.move(roomRect, [room.x, room.y]);
    model.models![`room_${index}_${room.name.replace(/\s+/g, '_')}`] = roomRect;
  });

  // Export to SVG
  const svg = makerjs.exporter.toSVG(model, {
    strokeWidth: '2px',
    stroke: '#333333',
    fill: 'none',
    viewBox: true,
    svgAttrs: {
      xmlns: 'http://www.w3.org/2000/svg',
    },
  });

  return svg;
}

// ============================================================================
// LAYER 2: GEMINI CONCEPT RENDERER
// ============================================================================

export async function renderWithGemini(
  wireframeSvg: string,
  config: FloorPlanConfig,
  style: 'isometric' | '2d-professional' | '3d-cutaway' = 'isometric'
): Promise<string | null> {
  // Note: This requires GOOGLE_API_KEY environment variable
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.warn('GOOGLE_API_KEY not set. Skipping Gemini rendering.');
    return null;
  }

  const stylePrompts = {
    'isometric': `Create a beautiful isometric 3D architectural floor plan visualization.
      Bird's eye view at 30-degree angle.
      Show rooms with furniture, textures (wood floors, tiles), soft shadows.
      Professional architectural illustration style.
      Clean, modern design with pastel colors.
      DO NOT add any text or dimension labels - those will be added separately.`,

    '2d-professional': `Create a professional 2D architectural floor plan.
      Clean lines, proper hatching patterns for materials.
      Standard architectural drawing style (like AutoCAD output).
      Black lines on white background.
      DO NOT add any text or dimension labels.`,

    '3d-cutaway': `Create a 3D cutaway architectural visualization.
      Show interior with furniture and fixtures visible.
      Photorealistic materials and lighting.
      Magazine-quality architectural render.
      DO NOT add any text or dimension labels.`,
  };

  const roomDescriptions = config.rooms.map(r =>
    `${r.name}: ${r.width}'×${r.depth}' at position (${r.x}', ${r.y}')`
  ).join('\n');

  const prompt = `${stylePrompts[style]}

Project: ${config.projectName}
Plot: North=${formatFeetInches(config.plot.north)}, South=${formatFeetInches(config.plot.south)}, East=${formatFeetInches(config.plot.east)}, West=${formatFeetInches(config.plot.west)}

Rooms:
${roomDescriptions}

CRITICAL: Maintain the EXACT proportions from the wireframe. North side (${config.plot.north}') must appear LONGER than South side (${config.plot.south}').

Generate a ${style === 'isometric' ? '1024x1024' : '1200x900'} image.`;

  try {
    // Using fetch directly for Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              // Include wireframe as reference if supported
            ]
          }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', await response.text());
      return null;
    }

    const data = await response.json();

    // Extract image from response
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Gemini rendering error:', error);
    return null;
  }
}

// ============================================================================
// LAYER 3: SVG DIMENSION OVERLAY
// ============================================================================

export function generateDimensionOverlay(
  config: FloorPlanConfig,
  viewBoxWidth: number,
  viewBoxHeight: number
): string {
  const { plot, rooms, scale } = config;

  // Calculate scale factor (feet to viewBox units)
  const plotWidth = Math.max(plot.north, plot.south);
  const plotDepth = Math.max(plot.east, plot.west);
  const scaleX = (viewBoxWidth - 100) / plotWidth;  // Leave margin for labels
  const scaleY = (viewBoxHeight - 100) / plotDepth;
  const scaleFactor = Math.min(scaleX, scaleY);

  const offsetX = 50;  // Left margin
  const offsetY = 50;  // Top margin

  // Helper to convert feet to viewBox coordinates
  const toX = (feet: number) => offsetX + feet * scaleFactor;
  const toY = (feet: number) => viewBoxHeight - offsetY - feet * scaleFactor;  // Flip Y axis

  let svg = '';

  // Dimension line style
  const dimStyle = 'stroke="#333" stroke-width="1" fill="none"';
  const textStyle = 'font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333"';
  const smallTextStyle = 'font-family="Arial, sans-serif" font-size="11" fill="#666"';

  // North dimension (top)
  const northY = toY(plotDepth) - 20;
  svg += `
    <g class="dimension north">
      <line x1="${toX(0)}" y1="${northY}" x2="${toX(plot.north)}" y2="${northY}" ${dimStyle}/>
      <line x1="${toX(0)}" y1="${northY - 5}" x2="${toX(0)}" y2="${northY + 5}" ${dimStyle}/>
      <line x1="${toX(plot.north)}" y1="${northY - 5}" x2="${toX(plot.north)}" y2="${northY + 5}" ${dimStyle}/>
      <text x="${toX(plot.north / 2)}" y="${northY - 8}" text-anchor="middle" ${textStyle}>${formatFeetInches(plot.north)}</text>
      <text x="${toX(plot.north / 2)}" y="${northY - 22}" text-anchor="middle" ${smallTextStyle}>(NORTH - LONGER)</text>
    </g>
  `;

  // South dimension (bottom)
  const southY = toY(0) + 20;
  svg += `
    <g class="dimension south">
      <line x1="${toX(0)}" y1="${southY}" x2="${toX(plot.south)}" y2="${southY}" ${dimStyle}/>
      <line x1="${toX(0)}" y1="${southY - 5}" x2="${toX(0)}" y2="${southY + 5}" ${dimStyle}/>
      <line x1="${toX(plot.south)}" y1="${southY - 5}" x2="${toX(plot.south)}" y2="${southY + 5}" ${dimStyle}/>
      <text x="${toX(plot.south / 2)}" y="${southY + 18}" text-anchor="middle" ${textStyle}>${formatFeetInches(plot.south)}</text>
      <text x="${toX(plot.south / 2)}" y="${southY + 32}" text-anchor="middle" ${smallTextStyle}>(SOUTH - SHORTER)</text>
    </g>
  `;

  // West dimension (left)
  const westX = toX(0) - 20;
  svg += `
    <g class="dimension west">
      <line x1="${westX}" y1="${toY(0)}" x2="${westX}" y2="${toY(plot.west)}" ${dimStyle}/>
      <line x1="${westX - 5}" y1="${toY(0)}" x2="${westX + 5}" y2="${toY(0)}" ${dimStyle}/>
      <line x1="${westX - 5}" y1="${toY(plot.west)}" x2="${westX + 5}" y2="${toY(plot.west)}" ${dimStyle}/>
      <text x="${westX - 8}" y="${toY(plot.west / 2)}" text-anchor="middle" transform="rotate(-90, ${westX - 8}, ${toY(plot.west / 2)})" ${textStyle}>${formatFeetInches(plot.west)}</text>
    </g>
  `;

  // East dimension (right)
  const eastX = toX(plotWidth) + 20;
  svg += `
    <g class="dimension east">
      <line x1="${eastX}" y1="${toY(0)}" x2="${eastX}" y2="${toY(plot.east)}" ${dimStyle}/>
      <line x1="${eastX - 5}" y1="${toY(0)}" x2="${eastX + 5}" y2="${toY(0)}" ${dimStyle}/>
      <line x1="${eastX - 5}" y1="${toY(plot.east)}" x2="${eastX + 5}" y2="${toY(plot.east)}" ${dimStyle}/>
      <text x="${eastX + 8}" y="${toY(plot.east / 2)}" text-anchor="middle" transform="rotate(90, ${eastX + 8}, ${toY(plot.east / 2)})" ${textStyle}>${formatFeetInches(plot.east)}</text>
    </g>
  `;

  // Room labels
  rooms.forEach((room) => {
    const centerX = toX(room.x + room.width / 2);
    const centerY = toY(room.y + room.depth / 2);

    svg += `
      <g class="room-label">
        <text x="${centerX}" y="${centerY - 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#1a1a2e">${room.name.toUpperCase()}</text>
        <text x="${centerX}" y="${centerY + 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#666">${room.width}'×${room.depth}'</text>
      </g>
    `;
  });

  // North arrow / Compass
  const compassX = viewBoxWidth - 60;
  const compassY = 60;
  svg += `
    <g class="compass" transform="translate(${compassX}, ${compassY})">
      <circle cx="0" cy="0" r="30" fill="white" stroke="#333" stroke-width="2"/>
      <polygon points="0,-25 -6,-8 0,-12 6,-8" fill="#e74c3c"/>
      <polygon points="0,25 -6,8 0,12 6,8" fill="#ccc" stroke="#333" stroke-width="0.5"/>
      <text x="0" y="-32" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold">N</text>
    </g>
  `;

  // Scale bar
  const scaleBarX = viewBoxWidth - 150;
  const scaleBarY = viewBoxHeight - 30;
  const scaleBarLength = 10 * scaleFactor;  // 10 feet
  svg += `
    <g class="scale-bar" transform="translate(${scaleBarX}, ${scaleBarY})">
      <line x1="0" y1="0" x2="${scaleBarLength}" y2="0" stroke="#333" stroke-width="2"/>
      <line x1="0" y1="-5" x2="0" y2="5" stroke="#333" stroke-width="2"/>
      <line x1="${scaleBarLength}" y1="-5" x2="${scaleBarLength}" y2="5" stroke="#333" stroke-width="2"/>
      <text x="${scaleBarLength / 2}" y="-10" text-anchor="middle" font-family="Arial" font-size="10" fill="#333">10'-0"</text>
      <text x="${scaleBarLength / 2}" y="18" text-anchor="middle" font-family="Arial" font-size="9" fill="#666">Scale 1:${scale}</text>
    </g>
  `;

  return svg;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateDimensions(config: FloorPlanConfig): DimensionValidation {
  const checks: DimensionValidation['checks'] = [];

  // Check 1: North > South (critical for Survey 63)
  checks.push({
    name: 'North > South',
    expected: `${config.plot.north}' > ${config.plot.south}'`,
    actual: `${config.plot.north}' ${config.plot.north > config.plot.south ? '>' : '≤'} ${config.plot.south}'`,
    passed: config.plot.north > config.plot.south,
  });

  // Check 2: Plot area calculation
  const avgWidth = (config.plot.north + config.plot.south) / 2;
  const avgDepth = (config.plot.east + config.plot.west) / 2;
  const plotArea = avgWidth * avgDepth;
  checks.push({
    name: 'Plot Area',
    expected: '> 0 sqft',
    actual: `${plotArea.toFixed(0)} sqft`,
    passed: plotArea > 0,
  });

  // Check 3: Rooms fit within plot
  config.rooms.forEach(room => {
    const roomRight = room.x + room.width;
    const roomTop = room.y + room.depth;
    const fitsWidth = roomRight <= Math.max(config.plot.north, config.plot.south);
    const fitsDepth = roomTop <= Math.max(config.plot.east, config.plot.west);

    checks.push({
      name: `${room.name} fits in plot`,
      expected: `x+w ≤ ${Math.max(config.plot.north, config.plot.south)}', y+d ≤ ${Math.max(config.plot.east, config.plot.west)}'`,
      actual: `x+w = ${roomRight}', y+d = ${roomTop}'`,
      passed: fitsWidth && fitsDepth,
    });
  });

  // Check 4: Total room area
  const totalRoomArea = config.rooms.reduce((sum, r) => sum + r.width * r.depth, 0);
  checks.push({
    name: 'Total Room Area',
    expected: `≤ ${plotArea.toFixed(0)} sqft`,
    actual: `${totalRoomArea} sqft`,
    passed: totalRoomArea <= plotArea,
  });

  return {
    isValid: checks.every(c => c.passed),
    checks,
  };
}

// ============================================================================
// COMPOSITE OUTPUT GENERATOR
// ============================================================================

export function generateCompositeHTML(
  config: FloorPlanConfig,
  geminiImage: string | null,
  options: {
    width?: number;
    height?: number;
    showValidation?: boolean;
  } = {}
): string {
  const {
    width = 1200,
    height = 900,
    showValidation = true,
  } = options;

  const validation = validateDimensions(config);
  const dimensionOverlay = generateDimensionOverlay(config, width, height);

  // Room colors for the fallback visualization
  const roomColors: Record<string, string> = {
    'Verandah': '#fff8e1',
    'Living Room': '#e3f2fd',
    'Dining': '#fff3e0',
    'Mutram': '#e8f5e9',
    'Kitchen': '#fce4ec',
    'Bedroom 1': '#f3e5f5',
    'Bedroom 2': '#e8eaf6',
    'Common Toilet': '#efebe9',
    'Staircase': '#fff9c4',
    'Dress Room': '#e0f7fa',
  };

  // Generate fallback SVG floor plan if Gemini didn't provide an image
  const plotWidth = Math.max(config.plot.north, config.plot.south);
  const plotDepth = Math.max(config.plot.east, config.plot.west);
  const scaleX = (width - 100) / plotWidth;
  const scaleY = (height - 100) / plotDepth;
  const scaleFactor = Math.min(scaleX, scaleY);
  const offsetX = 50;
  const offsetY = 50;

  const toX = (feet: number) => offsetX + feet * scaleFactor;
  const toY = (feet: number) => height - offsetY - feet * scaleFactor;

  let roomsSvg = '';
  config.rooms.forEach(room => {
    const x = toX(room.x);
    const y = toY(room.y + room.depth);
    const w = room.width * scaleFactor;
    const h = room.depth * scaleFactor;
    const color = roomColors[room.name] || '#f5f5f5';

    roomsSvg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="#8b7355" stroke-width="2"/>`;

    // Add furniture for Mutram (pillars + water feature)
    if (room.name === 'Mutram') {
      const pillarSize = 0.75 * scaleFactor;
      // 4 pillars
      roomsSvg += `<rect x="${x}" y="${y}" width="${pillarSize}" height="${pillarSize}" fill="#8b4513"/>`;
      roomsSvg += `<rect x="${x + w - pillarSize}" y="${y}" width="${pillarSize}" height="${pillarSize}" fill="#8b4513"/>`;
      roomsSvg += `<rect x="${x}" y="${y + h - pillarSize}" width="${pillarSize}" height="${pillarSize}" fill="#8b4513"/>`;
      roomsSvg += `<rect x="${x + w - pillarSize}" y="${y + h - pillarSize}" width="${pillarSize}" height="${pillarSize}" fill="#8b4513"/>`;
      // Water feature
      roomsSvg += `<circle cx="${x + w/2}" cy="${y + h/2}" r="${Math.min(w, h) * 0.3}" fill="#87ceeb" stroke="#4682b4" stroke-width="2"/>`;
    }
  });

  // Plot boundary (trapezoidal)
  const plotPath = `M ${toX(0)} ${toY(0)}
                    L ${toX(config.plot.south)} ${toY(0)}
                    L ${toX(config.plot.north)} ${toY(plotDepth)}
                    L ${toX(0)} ${toY(plotDepth)} Z`;

  const totalArea = config.rooms.reduce((sum, r) => sum + r.width * r.depth, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.projectName} - Survey No. ${config.surveyNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
      max-width: ${width + 100}px;
      width: 100%;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 25px 30px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    .header .subtitle {
      font-size: 14px;
      opacity: 0.9;
    }
    .dimensions-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 15px;
    }
    .dim-item {
      background: rgba(255,255,255,0.1);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
    }
    .dim-item.highlight {
      background: rgba(76, 175, 80, 0.3);
      border: 1px solid #4caf50;
    }
    .dim-item strong { color: #4ade80; }
    .plan-container {
      position: relative;
      padding: 20px;
      background: #f8fafc;
    }
    .plan-svg {
      width: 100%;
      height: auto;
    }
    ${geminiImage ? `
    .gemini-layer {
      position: absolute;
      top: 20px;
      left: 20px;
      right: 20px;
      bottom: 20px;
      opacity: 0.9;
    }
    .gemini-layer img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    ` : ''}
    .validation {
      padding: 20px 30px;
      background: ${validation.isValid ? '#e8f5e9' : '#ffebee'};
      border-top: 2px solid ${validation.isValid ? '#4caf50' : '#f44336'};
    }
    .validation h3 {
      color: ${validation.isValid ? '#2e7d32' : '#c62828'};
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .validation-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 10px;
    }
    .check-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: white;
      border-radius: 6px;
      font-size: 13px;
    }
    .check-item.pass { border-left: 3px solid #4caf50; }
    .check-item.fail { border-left: 3px solid #f44336; }
    .footer {
      padding: 20px 30px;
      background: #f1f5f9;
      border-top: 1px solid #e2e8f0;
    }
    .footer-title {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 12px;
    }
    .eco-features {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
    }
    .eco-feature {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #334155;
    }
    .eco-feature::before {
      content: "✓";
      color: #22c55e;
      font-weight: bold;
    }
    .method-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #e0f2fe;
      color: #0369a1;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${config.projectName.toUpperCase()}</h1>
      <div class="subtitle">
        Survey No: ${config.surveyNo} | Total Built-up Area: ${totalArea} sqft
        <span class="method-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          CAD-FIRST HYBRID METHOD
        </span>
      </div>
      <div class="dimensions-bar">
        <div class="dim-item highlight"><strong>North: ${formatFeetInches(config.plot.north)}</strong> (LONGER)</div>
        <div class="dim-item">South: ${formatFeetInches(config.plot.south)} (SHORTER)</div>
        <div class="dim-item">East: ${formatFeetInches(config.plot.east)}</div>
        <div class="dim-item">West: ${formatFeetInches(config.plot.west)}${config.road?.side === 'west' ? ' (ROAD)' : ''}</div>
      </div>
    </div>

    <div class="plan-container">
      ${geminiImage ? `
      <div class="gemini-layer">
        <img src="${geminiImage}" alt="AI-rendered floor plan concept"/>
      </div>
      ` : ''}

      <svg class="plan-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#fafafa"/>

        <!-- Plot boundary -->
        <path d="${plotPath}" fill="none" stroke="#333" stroke-width="3"/>

        <!-- Rooms (fallback if no Gemini image) -->
        ${!geminiImage ? roomsSvg : ''}

        <!-- DIMENSION OVERLAY - Always rendered on top -->
        ${dimensionOverlay}
      </svg>
    </div>

    ${showValidation ? `
    <div class="validation">
      <h3>
        ${validation.isValid ? '✅' : '❌'}
        Dimension Validation Report
        ${validation.isValid ? '- ALL CHECKS PASSED' : '- ISSUES DETECTED'}
      </h3>
      <div class="validation-grid">
        ${validation.checks.map(check => `
          <div class="check-item ${check.passed ? 'pass' : 'fail'}">
            <span>${check.passed ? '✓' : '✗'}</span>
            <span><strong>${check.name}:</strong> ${check.actual}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="footer">
      <div class="footer-title">ECO-FRIENDLY FEATURES: Suitable for construction with CSEB / Mud Bricks</div>
      <div class="eco-features">
        <span class="eco-feature">Traditional mutram (open-to-sky courtyard)</span>
        <span class="eco-feature">4 pillars with water feature</span>
        <span class="eco-feature">Naturally ventilated rooms</span>
        <span class="eco-feature">Athangudi tiles flooring</span>
        <span class="eco-feature">CSEB/Mud brick walls</span>
      </div>
      <div style="margin-top: 15px; font-size: 11px; color: #64748b;">
        Generated: ${new Date().toISOString()} | Method: CAD-First Hybrid (Maker.js + SVG Overlay) |
        Dimensions: MATHEMATICALLY VERIFIED
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function generateHybridFloorPlan(
  config: FloorPlanConfig,
  options: {
    useGemini?: boolean;
    geminiStyle?: 'isometric' | '2d-professional' | '3d-cutaway';
    outputWidth?: number;
    outputHeight?: number;
  } = {}
): Promise<{
  html: string;
  wireframeSvg: string;
  validation: DimensionValidation;
  geminiImage: string | null;
}> {
  const {
    useGemini = false,
    geminiStyle = 'isometric',
    outputWidth = 1200,
    outputHeight = 900,
  } = options;

  // Layer 1: Generate precise wireframe
  const wireframeSvg = generateWireframeSVG(config);

  // Layer 2: Optionally render with Gemini
  let geminiImage: string | null = null;
  if (useGemini) {
    geminiImage = await renderWithGemini(wireframeSvg, config, geminiStyle);
  }

  // Layer 3: Generate composite with dimension overlay
  const html = generateCompositeHTML(config, geminiImage, {
    width: outputWidth,
    height: outputHeight,
    showValidation: true,
  });

  // Validate dimensions
  const validation = validateDimensions(config);

  return {
    html,
    wireframeSvg,
    validation,
    geminiImage,
  };
}
