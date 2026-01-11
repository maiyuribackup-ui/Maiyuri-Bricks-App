/**
 * CAD Service Client
 *
 * TypeScript client for the Python CAD Engine Backend.
 * Provides the Backend Bridge between the TypeScript planning pipeline
 * and the Python-based CAD rendering system.
 *
 * Architecture:
 * TS Pipeline → CAD Service Client → Python Backend → DXF/PNG Output
 */

import { logger } from '../agents/planning/utils/logger';

/**
 * Configuration for the CAD service
 */
export interface CadServiceConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_CONFIG: CadServiceConfig = {
  baseUrl: process.env.CAD_ENGINE_URL || 'http://localhost:8000',
  timeout: 60000, // 60 seconds for rendering
  retryAttempts: 3,
  retryDelay: 1000,
};

/**
 * Room specification for CAD rendering
 */
export interface CadRoomSpec {
  id: string;
  name: string;
  type: string;
  width: number;
  depth: number;
  area_sqft: number;
  zone: string;
  adjacent_to: string[];
}

/**
 * Wall system specification
 */
export interface CadWallSystem {
  external_thickness_inches: number;
  internal_thickness_inches: number;
  material: string;
  load_bearing_walls: string[];
}

/**
 * Staircase specification
 */
export interface CadStaircase {
  type: 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';
  position: string;
  width_feet: number;
  riser_height_inches: number;
  tread_width_inches: number;
}

/**
 * Plumbing strategy specification
 */
export interface CadPlumbingStrategy {
  wet_areas_grouped: boolean;
  shaft_positions: string[];
  sewer_connection: 'north' | 'south' | 'east' | 'west';
}

/**
 * Ventilation shaft specification
 */
export interface CadVentilationShaft {
  position: string;
  serves_rooms: string[];
}

/**
 * Expansion provision specification
 */
export interface CadExpansionProvision {
  direction: 'north' | 'south' | 'east' | 'west';
  type: 'vertical' | 'horizontal';
  notes: string;
}

/**
 * Plot dimensions
 */
export interface CadPlotDimensions {
  width: number;
  depth: number;
  unit: string;
}

/**
 * Full engineering plan render input
 */
export interface EngineeringPlanRenderInput {
  rooms: CadRoomSpec[];
  wall_system: CadWallSystem;
  staircase?: CadStaircase | null;
  plumbing_strategy?: CadPlumbingStrategy | null;
  ventilation_shafts: CadVentilationShaft[];
  expansion_provision?: CadExpansionProvision | null;
  plot_dimensions?: CadPlotDimensions | null;
  orientation?: 'north' | 'south' | 'east' | 'west';
  staircase_position?: [number, number] | null;
  style?: 'professional' | 'blueprint' | 'sketch';
  ai_render?: boolean;
  background?: 'white' | 'black' | 'blueprint';
}

/**
 * Render result from CAD service
 */
export interface CadRenderResult {
  success: boolean;
  message: string;
  dxf_path?: string;
  wireframe_base64?: string;
  ai_rendered_base64?: string;
  ai_enhanced: boolean;
  rooms_count: number;
  total_area_sqft: number;
}

/**
 * Health check response
 */
export interface CadHealthResponse {
  status: string;
  service: string;
  version: string;
}

/**
 * CAD Service Client
 *
 * Provides methods to interact with the Python CAD Engine backend.
 */
export class CadServiceClient {
  private config: CadServiceConfig;

  constructor(config: Partial<CadServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if the CAD service is healthy
   */
  async healthCheck(): Promise<CadHealthResponse> {
    const response = await this.fetch('/health');
    return response as CadHealthResponse;
  }

  /**
   * Check if the CAD service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy' || health.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Render an engineering plan to blueprint
   *
   * This is the main method for the Backend Bridge.
   * It sends the engineering plan from the TypeScript pipeline
   * to the Python backend for CAD rendering.
   */
  async renderEngineeringPlan(
    input: EngineeringPlanRenderInput
  ): Promise<CadRenderResult> {
    logger.info('Sending engineering plan to CAD service', {
      roomsCount: input.rooms.length,
      hasStaircase: !!input.staircase,
      aiRender: input.ai_render ?? true,
    });

    const result = await this.fetch<CadRenderResult>(
      '/api/render-engineering-plan',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );

    logger.info('CAD service render complete', {
      success: result.success,
      aiEnhanced: result.ai_enhanced,
      totalAreaSqft: result.total_area_sqft,
    });

    return result;
  }

  /**
   * Render engineering plan from DesignContext
   *
   * Convenience method that extracts the relevant data from
   * the pipeline's DesignContext and formats it for the CAD service.
   */
  async renderFromContext(context: {
    rooms?: Array<{
      id: string;
      name: string;
      type: string;
      width: number;
      depth: number;
      areaSqft: number;
      zone: string;
      adjacentTo?: string[];
    }>;
    wallSystem?: {
      external_thickness_inches: number;
      internal_thickness_inches: number;
      material: string;
      load_bearing_walls: string[];
    };
    staircase?: {
      type: string;
      position: string;
      width_feet: number;
      riser_height_inches: number;
      tread_width_inches: number;
    };
    plumbingStrategy?: {
      wet_areas_grouped: boolean;
      shaft_positions: string[];
      sewer_connection: string;
    };
    ventilationShafts?: Array<{
      position: string;
      serves_rooms: string[];
    }>;
    expansionProvision?: {
      direction: string;
      type: string;
      notes: string;
    };
    plot?: {
      width: number;
      depth: number;
      unit: string;
    };
    orientation?: string;
  }): Promise<CadRenderResult> {
    // Transform context to CAD service input format
    const input: EngineeringPlanRenderInput = {
      rooms: (context.rooms || []).map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        width: r.width,
        depth: r.depth,
        area_sqft: r.areaSqft,
        zone: r.zone,
        adjacent_to: r.adjacentTo || [],
      })),
      wall_system: context.wallSystem || {
        external_thickness_inches: 9,
        internal_thickness_inches: 4.5,
        material: 'Burnt clay brick masonry with cement mortar 1:6',
        load_bearing_walls: [],
      },
      staircase: context.staircase
        ? {
            type: context.staircase.type as CadStaircase['type'],
            position: context.staircase.position,
            width_feet: context.staircase.width_feet,
            riser_height_inches: context.staircase.riser_height_inches,
            tread_width_inches: context.staircase.tread_width_inches,
          }
        : null,
      plumbing_strategy: context.plumbingStrategy
        ? {
            wet_areas_grouped: context.plumbingStrategy.wet_areas_grouped,
            shaft_positions: context.plumbingStrategy.shaft_positions,
            sewer_connection: context.plumbingStrategy
              .sewer_connection as CadPlumbingStrategy['sewer_connection'],
          }
        : null,
      ventilation_shafts: (context.ventilationShafts || []).map((v) => ({
        position: v.position,
        serves_rooms: v.serves_rooms,
      })),
      expansion_provision: context.expansionProvision
        ? {
            direction: context.expansionProvision
              .direction as CadExpansionProvision['direction'],
            type: context.expansionProvision
              .type as CadExpansionProvision['type'],
            notes: context.expansionProvision.notes,
          }
        : null,
      plot_dimensions: context.plot
        ? {
            width: context.plot.width,
            depth: context.plot.depth,
            unit: context.plot.unit,
          }
        : null,
      orientation: (context.orientation as EngineeringPlanRenderInput['orientation']) || 'north',
      ai_render: true,
      style: 'professional',
      background: 'white',
    };

    return this.renderEngineeringPlan(input);
  }

  /**
   * List generated output files
   */
  async listOutputs(): Promise<{
    files: Array<{
      filename: string;
      size_bytes: number;
      modified: string;
    }>;
  }> {
    return this.fetch('/api/outputs');
  }

  /**
   * Internal fetch method with retry logic
   */
  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `CAD service error (${response.status}): ${errorBody}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.retryAttempts) {
          logger.warn(`CAD service request failed, retrying...`, {
            attempt,
            maxAttempts: this.config.retryAttempts,
            error: lastError.message,
          });
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw new Error(
      `CAD service request failed after ${this.config.retryAttempts} attempts: ${lastError?.message}`
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance for convenience
 */
let cadServiceInstance: CadServiceClient | null = null;

export function getCadService(
  config?: Partial<CadServiceConfig>
): CadServiceClient {
  if (!cadServiceInstance || config) {
    cadServiceInstance = new CadServiceClient(config);
  }
  return cadServiceInstance;
}

/**
 * Type alias for use in pipeline
 */
export type CadEngineeringPlanInput = EngineeringPlanRenderInput;
