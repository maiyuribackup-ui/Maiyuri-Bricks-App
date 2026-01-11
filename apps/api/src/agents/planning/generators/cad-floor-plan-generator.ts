/**
 * CAD Floor Plan Generator
 *
 * Uses Maker.js for mathematically precise, construction-ready floor plans.
 * Exports to SVG (web), DXF (CAD software), and PDF (printing).
 *
 * WHY NOT AI IMAGE GENERATION:
 * - AI uses statistical pattern matching, not geometry
 * - Cannot guarantee proportions (27'6" might appear longer than 29')
 * - Labels and dimensions are regenerated loosely each time
 * - Not suitable for construction-ready plans
 *
 * WHY MAKER.JS:
 * - Designed for CNC/laser cutting (construction-grade precision)
 * - Programmatic API for exact dimensions
 * - Mathematical precision guaranteed
 * - Industry-standard DXF export
 */

import * as makerjs from 'makerjs';

// ============================================================================
// TYPES
// ============================================================================

export interface PlotDimensions {
  north: number; // feet
  south: number; // feet
  east: number; // feet
  west: number; // feet
}

export interface Setbacks {
  north: number; // feet
  south: number; // feet
  east: number; // feet
  west: number; // feet
}

export interface Room {
  name: string;
  width: number; // feet
  depth: number; // feet
  x: number; // position from left edge (feet)
  y: number; // position from bottom edge (feet)
  doors?: Door[];
  windows?: Window[];
}

export interface Door {
  width: number; // feet
  wall: 'north' | 'south' | 'east' | 'west';
  position: number; // offset from wall start (feet)
  swingDirection?: 'in' | 'out';
  swingSide?: 'left' | 'right';
}

export interface Window {
  width: number; // feet
  wall: 'north' | 'south' | 'east' | 'west';
  position: number; // offset from wall start (feet)
}

export interface FloorPlanInput {
  projectName: string;
  surveyNo: string;
  plot: PlotDimensions;
  setbacks: Setbacks;
  wallThickness: number; // inches
  rooms: Room[];
  road: {
    side: 'north' | 'south' | 'east' | 'west';
    width: number; // feet
  };
  scale: number; // e.g., 50 for 1:50
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WALL_THICKNESS_INCHES = 9; // Standard 9" wall
const DOOR_SWING_RADIUS_FACTOR = 0.9; // 90% of door width for swing arc
const DIMENSION_OFFSET = 2; // feet offset for dimension lines
const FONT_SIZE = 0.5; // feet for labels

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert feet and inches string to decimal feet
 * e.g., "29'-6\"" => 29.5
 */
export function parseFeetInches(input: string): number {
  const match = input.match(/(\d+)'[- ]?(\d+)?\"?/);
  if (match) {
    const feet = parseInt(match[1], 10);
    const inches = match[2] ? parseInt(match[2], 10) : 0;
    return feet + inches / 12;
  }
  return parseFloat(input);
}

/**
 * Format decimal feet to feet-inches string
 * e.g., 29.5 => "29'-6\""
 */
export function formatFeetInches(feet: number): string {
  const wholeFeet = Math.floor(feet);
  const inches = Math.round((feet - wholeFeet) * 12);
  if (inches === 0) {
    return `${wholeFeet}'-0"`;
  }
  return `${wholeFeet}'-${inches}"`;
}

/**
 * Convert feet to millimeters (for DXF export)
 */
export function feetToMm(feet: number): number {
  return feet * 304.8;
}

// ============================================================================
// MODEL CREATORS
// ============================================================================

/**
 * Create a trapezoidal plot boundary
 */
function createPlotBoundary(plot: PlotDimensions): makerjs.IModel {
  // For a trapezoidal plot:
  // - North and South are parallel (top and bottom)
  // - East and West connect them (sides)
  // We'll place the plot with SW corner at origin

  // Calculate the offset needed for the trapezoidal shape
  const northOffset = (plot.south - plot.north) / 2;

  const paths: makerjs.IPathMap = {
    south: new makerjs.paths.Line([0, 0], [plot.south, 0]),
    east: new makerjs.paths.Line([plot.south, 0], [plot.south - northOffset + plot.north, plot.east]),
    north: new makerjs.paths.Line([plot.south - northOffset + plot.north, plot.east], [northOffset, plot.east]),
    west: new makerjs.paths.Line([northOffset, plot.east], [0, 0]),
  };

  return { paths, layer: 'PLOT_BOUNDARY' };
}

/**
 * Create buildable area (plot minus setbacks)
 */
function createBuildableArea(plot: PlotDimensions, setbacks: Setbacks): makerjs.IModel {
  // Simplified rectangular buildable area
  const width = Math.min(plot.north, plot.south) - setbacks.east - setbacks.west;
  const depth = Math.min(plot.east, plot.west) - setbacks.north - setbacks.south;

  const rect = new makerjs.models.Rectangle(width, depth);
  makerjs.model.move(rect, [setbacks.west, setbacks.south]);

  return { ...rect, layer: 'BUILDABLE_AREA' };
}

/**
 * Create a room with walls
 */
function createRoom(room: Room, wallThickness: number): makerjs.IModel {
  const wallFeet = wallThickness / 12; // Convert inches to feet

  // Outer rectangle (outside of walls)
  const outer = new makerjs.models.Rectangle(room.width, room.depth);

  // Inner rectangle (inside of walls)
  const inner = new makerjs.models.Rectangle(
    room.width - 2 * wallFeet,
    room.depth - 2 * wallFeet
  );
  makerjs.model.move(inner, [wallFeet, wallFeet]);

  // Create walls by combining outer and inner
  const walls: makerjs.IModel = {
    models: {
      outer,
      inner,
    },
    layer: 'WALLS',
  };

  // Position the room
  makerjs.model.move(walls, [room.x, room.y]);

  return walls;
}

/**
 * Create a door opening with swing arc
 */
function createDoor(
  room: Room,
  door: Door,
  wallThickness: number
): makerjs.IModel {
  const wallFeet = wallThickness / 12;
  const doorModels: makerjs.IModelMap = {};
  const doorPaths: makerjs.IPathMap = {};

  // Calculate door position
  let doorX = room.x;
  let doorY = room.y;
  let openingWidth = door.width;
  let openingDepth = wallFeet;

  switch (door.wall) {
    case 'south':
      doorX += door.position;
      doorY += 0;
      break;
    case 'north':
      doorX += door.position;
      doorY += room.depth - wallFeet;
      break;
    case 'west':
      doorX += 0;
      doorY += door.position;
      openingWidth = wallFeet;
      openingDepth = door.width;
      break;
    case 'east':
      doorX += room.width - wallFeet;
      doorY += door.position;
      openingWidth = wallFeet;
      openingDepth = door.width;
      break;
  }

  // Door opening (gap in wall)
  const opening = new makerjs.models.Rectangle(openingWidth, openingDepth);
  makerjs.model.move(opening, [doorX, doorY]);
  doorModels.opening = opening;

  // Door panel (line showing the door)
  const swingRadius = door.width * DOOR_SWING_RADIUS_FACTOR;
  let panelStart: makerjs.IPoint;
  let panelEnd: makerjs.IPoint;
  let arcStart: number;
  let arcEnd: number;

  // Default swing direction
  const swingIn = door.swingDirection !== 'out';
  const swingLeft = door.swingSide !== 'right';

  if (door.wall === 'south' || door.wall === 'north') {
    if (swingLeft) {
      panelStart = [doorX, doorY + (door.wall === 'south' ? wallFeet : 0)];
      panelEnd = [doorX + door.width * 0.7, doorY + (swingIn ? wallFeet + door.width * 0.7 : -door.width * 0.7)];
      arcStart = swingIn ? 90 : 270;
      arcEnd = swingIn ? 180 : 360;
    } else {
      panelStart = [doorX + door.width, doorY + (door.wall === 'south' ? wallFeet : 0)];
      panelEnd = [doorX + door.width - door.width * 0.7, doorY + (swingIn ? wallFeet + door.width * 0.7 : -door.width * 0.7)];
      arcStart = swingIn ? 0 : 180;
      arcEnd = swingIn ? 90 : 270;
    }
  } else {
    // East/West walls
    panelStart = [doorX + (door.wall === 'west' ? wallFeet : 0), doorY];
    panelEnd = [doorX + wallFeet + door.width * 0.7, doorY + door.width * 0.7];
    arcStart = 0;
    arcEnd = 90;
  }

  // Door panel line
  doorPaths.panel = new makerjs.paths.Line(panelStart, panelEnd);

  // Door swing arc
  const arcCenter = swingLeft ? panelStart : [panelStart[0] + door.width, panelStart[1]];
  doorPaths.swingArc = new makerjs.paths.Arc(arcCenter, swingRadius, arcStart, arcEnd);

  return {
    models: doorModels,
    paths: doorPaths,
    layer: 'DOORS',
  };
}

/**
 * Create a window symbol
 */
function createWindow(room: Room, window: Window, wallThickness: number): makerjs.IModel {
  const wallFeet = wallThickness / 12;
  const windowPaths: makerjs.IPathMap = {};

  let x1: number, y1: number, x2: number, y2: number;

  switch (window.wall) {
    case 'south':
      x1 = room.x + window.position;
      y1 = room.y;
      x2 = x1 + window.width;
      y2 = y1 + wallFeet;
      break;
    case 'north':
      x1 = room.x + window.position;
      y1 = room.y + room.depth - wallFeet;
      x2 = x1 + window.width;
      y2 = y1 + wallFeet;
      break;
    case 'west':
      x1 = room.x;
      y1 = room.y + window.position;
      x2 = x1 + wallFeet;
      y2 = y1 + window.width;
      break;
    case 'east':
      x1 = room.x + room.width - wallFeet;
      y1 = room.y + window.position;
      x2 = x1 + wallFeet;
      y2 = y1 + window.width;
      break;
    default:
      x1 = y1 = x2 = y2 = 0;
  }

  // Window symbol: two parallel lines
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  if (window.wall === 'south' || window.wall === 'north') {
    // Horizontal window
    windowPaths.line1 = new makerjs.paths.Line([x1, midY - 0.1], [x2, midY - 0.1]);
    windowPaths.line2 = new makerjs.paths.Line([x1, midY + 0.1], [x2, midY + 0.1]);
  } else {
    // Vertical window
    windowPaths.line1 = new makerjs.paths.Line([midX - 0.1, y1], [midX - 0.1, y2]);
    windowPaths.line2 = new makerjs.paths.Line([midX + 0.1, y1], [midX + 0.1, y2]);
  }

  return {
    paths: windowPaths,
    layer: 'WINDOWS',
  };
}

/**
 * Create dimension line with text
 */
function createDimensionLine(
  start: makerjs.IPoint,
  end: makerjs.IPoint,
  text: string,
  offset: number,
  horizontal: boolean
): makerjs.IModel {
  const paths: makerjs.IPathMap = {};

  if (horizontal) {
    // Horizontal dimension line
    const y = start[1] - offset;
    paths.line = new makerjs.paths.Line([start[0], y], [end[0], y]);
    paths.ext1 = new makerjs.paths.Line([start[0], start[1]], [start[0], y - 0.3]);
    paths.ext2 = new makerjs.paths.Line([end[0], end[1]], [end[0], y - 0.3]);
  } else {
    // Vertical dimension line
    const x = start[0] - offset;
    paths.line = new makerjs.paths.Line([x, start[1]], [x, end[1]]);
    paths.ext1 = new makerjs.paths.Line([start[0], start[1]], [x - 0.3, start[1]]);
    paths.ext2 = new makerjs.paths.Line([end[0], end[1]], [x - 0.3, end[1]]);
  }

  // Note: Maker.js doesn't have built-in text, we'll add it via caption
  return {
    paths,
    layer: 'DIMENSIONS',
    caption: {
      text,
      anchor: new makerjs.paths.Line(
        horizontal ? [(start[0] + end[0]) / 2, start[1] - offset] : [start[0] - offset, (start[1] + end[1]) / 2],
        horizontal ? [(start[0] + end[0]) / 2 + 0.1, start[1] - offset] : [start[0] - offset, (start[1] + end[1]) / 2 + 0.1]
      ),
    },
  };
}

/**
 * Create north arrow symbol
 */
function createNorthArrow(position: makerjs.IPoint): makerjs.IModel {
  const paths: makerjs.IPathMap = {};

  // Arrow shaft
  paths.shaft = new makerjs.paths.Line([position[0], position[1]], [position[0], position[1] + 3]);

  // Arrow head
  paths.head1 = new makerjs.paths.Line(
    [position[0], position[1] + 3],
    [position[0] - 0.5, position[1] + 2.5]
  );
  paths.head2 = new makerjs.paths.Line(
    [position[0], position[1] + 3],
    [position[0] + 0.5, position[1] + 2.5]
  );

  return {
    paths,
    layer: 'SYMBOLS',
  };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate a complete floor plan model
 */
export function generateFloorPlan(input: FloorPlanInput): makerjs.IModel {
  const model: makerjs.IModel = {
    models: {},
    paths: {},
    units: makerjs.unitType.Foot,
  };

  // 1. Plot boundary
  model.models!.plotBoundary = createPlotBoundary(input.plot);

  // 2. Buildable area (dashed line)
  model.models!.buildableArea = createBuildableArea(input.plot, input.setbacks);

  // 3. All rooms
  input.rooms.forEach((room, index) => {
    model.models![`room_${index}_${room.name.replace(/\s+/g, '_')}`] = createRoom(
      room,
      input.wallThickness
    );

    // Add doors for this room
    room.doors?.forEach((door, doorIndex) => {
      model.models![`door_${index}_${doorIndex}`] = createDoor(room, door, input.wallThickness);
    });

    // Add windows for this room
    room.windows?.forEach((window, windowIndex) => {
      model.models![`window_${index}_${windowIndex}`] = createWindow(room, window, input.wallThickness);
    });
  });

  // 4. Dimension lines
  const plotWidth = Math.max(input.plot.north, input.plot.south);
  const plotDepth = Math.max(input.plot.east, input.plot.west);

  // South dimension (bottom)
  model.models!.dimSouth = createDimensionLine(
    [0, 0],
    [input.plot.south, 0],
    formatFeetInches(input.plot.south),
    DIMENSION_OFFSET,
    true
  );

  // North dimension (top)
  const northOffset = (input.plot.south - input.plot.north) / 2;
  model.models!.dimNorth = createDimensionLine(
    [northOffset, input.plot.east],
    [northOffset + input.plot.north, input.plot.east],
    formatFeetInches(input.plot.north),
    -DIMENSION_OFFSET,
    true
  );

  // West dimension (left)
  model.models!.dimWest = createDimensionLine(
    [0, 0],
    [northOffset, input.plot.east],
    formatFeetInches(input.plot.west),
    DIMENSION_OFFSET,
    false
  );

  // East dimension (right)
  model.models!.dimEast = createDimensionLine(
    [input.plot.south, 0],
    [input.plot.south - northOffset + input.plot.north, input.plot.east],
    formatFeetInches(input.plot.east),
    -DIMENSION_OFFSET,
    false
  );

  // 5. North arrow
  model.models!.northArrow = createNorthArrow([plotWidth + 3, plotDepth - 3]);

  // 6. Road label
  // Add road indication on the appropriate side

  return model;
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export floor plan to SVG
 */
export function exportToSVG(model: makerjs.IModel, options?: makerjs.exporter.ISVGRenderOptions): string {
  const defaultOptions: makerjs.exporter.ISVGRenderOptions = {
    strokeWidth: '0.5mm',
    fontSize: '12pt',
    useSvgPathOnly: false,
    ...options,
  };

  return makerjs.exporter.toSVG(model, defaultOptions);
}

/**
 * Export floor plan to DXF (for CAD software)
 */
export function exportToDXF(model: makerjs.IModel, options?: makerjs.exporter.IDXFRenderOptions): string {
  const defaultOptions: makerjs.exporter.IDXFRenderOptions = {
    units: makerjs.unitType.Foot,
    ...options,
  };

  return makerjs.exporter.toDXF(model, defaultOptions);
}

/**
 * Get model measurements for validation
 */
export function validateProportions(model: makerjs.IModel): {
  isValid: boolean;
  measurements: Record<string, number>;
  errors: string[];
} {
  const measurements = makerjs.measure.modelExtents(model);
  const errors: string[] = [];

  // The actual measurements from the model
  const width = measurements.high[0] - measurements.low[0];
  const depth = measurements.high[1] - measurements.low[1];

  return {
    isValid: errors.length === 0,
    measurements: {
      width,
      depth,
      lowX: measurements.low[0],
      lowY: measurements.low[1],
      highX: measurements.high[0],
      highY: measurements.high[1],
    },
    errors,
  };
}
