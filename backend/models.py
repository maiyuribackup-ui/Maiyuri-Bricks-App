"""
Pydantic models for Engineering Plan Rendering API

These models match the TypeScript contract from the planning pipeline.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict
from enum import Enum


class RoomType(str, Enum):
    """Room types matching the TypeScript planning system"""
    LIVING = "living"
    DINING = "dining"
    KITCHEN = "kitchen"
    MASTER_BEDROOM = "master-bedroom"
    BEDROOM = "bedroom"
    ATTACHED_BATHROOM = "attached-bathroom"
    COMMON_BATHROOM = "common-bathroom"
    POOJA = "pooja"
    STORE = "store"
    UTILITY = "utility"
    PARKING = "parking"
    STAIRCASE = "staircase"
    BALCONY = "balcony"
    VERANDA = "veranda"
    COURTYARD = "courtyard"
    FOYER = "foyer"
    WASH = "wash"
    SERVANT_ROOM = "servant-room"


class Zone(str, Enum):
    """Zones from architectural zoning agent"""
    PUBLIC = "public"
    PRIVATE = "private"
    SERVICE = "service"
    TRANSITION = "transition"
    OUTDOOR = "outdoor"


class Direction(str, Enum):
    """Cardinal directions"""
    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"


class StaircaseType(str, Enum):
    """Staircase types"""
    STRAIGHT = "straight"
    L_SHAPED = "l-shaped"
    U_SHAPED = "u-shaped"
    SPIRAL = "spiral"


class StructuralStrategy(str, Enum):
    """Structural strategy from engineer clarification agent"""
    LOAD_BEARING = "load-bearing"
    RCC = "rcc"
    HYBRID = "hybrid"


# ============================================
# Room Models
# ============================================

class RoomSpec(BaseModel):
    """Room specification from dimensioning agent"""
    id: str = Field(..., description="Unique room identifier")
    name: str = Field(..., description="Display name")
    type: str = Field(..., description="Room type")
    width: float = Field(..., gt=0, description="Room width in feet")
    depth: float = Field(..., gt=0, description="Room depth in feet")
    area_sqft: float = Field(..., gt=0, description="Area in square feet")
    zone: str = Field(..., description="Architectural zone")
    adjacent_to: List[str] = Field(default_factory=list, description="Adjacent room IDs")


# ============================================
# Wall System Models
# ============================================

class WallSystemSpec(BaseModel):
    """Wall system specification from engineering plan agent"""
    external_thickness_inches: float = Field(
        default=9.0,
        ge=4.5,
        le=18,
        description="External wall thickness in inches"
    )
    internal_thickness_inches: float = Field(
        default=4.5,
        ge=4.5,
        le=9,
        description="Internal wall thickness in inches"
    )
    material: str = Field(
        default="Burnt clay brick masonry with cement mortar 1:6",
        description="Wall material specification"
    )
    load_bearing_walls: List[str] = Field(
        default_factory=list,
        description="List of load-bearing wall identifiers"
    )


# ============================================
# Staircase Models
# ============================================

class StaircaseSpec(BaseModel):
    """Staircase specification from engineering plan agent"""
    type: StaircaseType = Field(
        default=StaircaseType.STRAIGHT,
        description="Staircase type"
    )
    position: str = Field(
        default="Near living room entrance",
        description="Position description"
    )
    width_feet: float = Field(
        default=3.5,
        ge=3.0,
        le=5.0,
        description="Staircase width in feet"
    )
    riser_height_inches: float = Field(
        default=7.0,
        ge=6.0,
        le=7.5,
        description="Riser height in inches"
    )
    tread_width_inches: float = Field(
        default=10.0,
        ge=10.0,
        le=12.0,
        description="Tread width in inches"
    )


# ============================================
# Plumbing Models
# ============================================

class PlumbingStrategySpec(BaseModel):
    """Plumbing strategy from engineering plan agent"""
    wet_areas_grouped: bool = Field(
        default=True,
        description="Whether wet areas are grouped together"
    )
    shaft_positions: List[str] = Field(
        default_factory=list,
        description="Plumbing shaft position descriptions"
    )
    sewer_connection: Direction = Field(
        default=Direction.SOUTH,
        description="Sewer connection direction"
    )


# ============================================
# Ventilation Models
# ============================================

class VentilationShaftSpec(BaseModel):
    """Ventilation shaft specification"""
    position: str = Field(..., description="Position description")
    serves_rooms: List[str] = Field(
        default_factory=list,
        description="Room IDs served by this shaft"
    )


# ============================================
# Expansion Provision Models
# ============================================

class ExpansionProvisionSpec(BaseModel):
    """Expansion provision from engineering plan agent"""
    direction: Direction = Field(
        default=Direction.SOUTH,
        description="Recommended expansion direction"
    )
    type: Literal["vertical", "horizontal"] = Field(
        default="horizontal",
        description="Expansion type"
    )
    notes: str = Field(
        default="",
        description="Additional notes about expansion"
    )


# ============================================
# Plot Dimensions Models
# ============================================

class PlotDimensions(BaseModel):
    """Plot dimensions"""
    width: float = Field(..., gt=0, description="Plot width in feet")
    depth: float = Field(..., gt=0, description="Plot depth in feet")
    unit: str = Field(default="feet", description="Measurement unit")


# ============================================
# Door Specification
# ============================================

class DoorSpec(BaseModel):
    """Door specification for a room"""
    wall: Direction = Field(..., description="Wall where door is placed")
    position: float = Field(
        default=0.5,
        ge=0.1,
        le=0.9,
        description="Position along wall (0-1)"
    )
    width: float = Field(
        default=3.0,
        ge=2.5,
        le=4.0,
        description="Door width in feet"
    )


# ============================================
# Main API Input Models
# ============================================

class EngineeringPlanRenderInput(BaseModel):
    """
    Input for the /api/render-engineering-plan endpoint.

    This matches the output from the TypeScript engineering plan agent.
    """

    # Rooms from dimensioning agent
    rooms: List[RoomSpec] = Field(
        ...,
        min_length=1,
        description="Room specifications from dimensioning agent"
    )

    # Wall system from engineering plan agent
    wall_system: WallSystemSpec = Field(
        default_factory=WallSystemSpec,
        description="Wall system specifications"
    )

    # Staircase (optional for single-floor)
    staircase: Optional[StaircaseSpec] = Field(
        default=None,
        description="Staircase specifications (null for single floor)"
    )

    # Plumbing strategy
    plumbing_strategy: Optional[PlumbingStrategySpec] = Field(
        default=None,
        description="Plumbing strategy"
    )

    # Ventilation shafts
    ventilation_shafts: List[VentilationShaftSpec] = Field(
        default_factory=list,
        description="Ventilation shaft specifications"
    )

    # Expansion provision
    expansion_provision: Optional[ExpansionProvisionSpec] = Field(
        default=None,
        description="Future expansion provision"
    )

    # Plot dimensions (for overall dimensions)
    plot_dimensions: Optional[PlotDimensions] = Field(
        default=None,
        description="Overall plot dimensions"
    )

    # Vastu zones mapping (direction -> room types/ids)
    vastu_zones: Optional[Dict[str, List[str]]] = Field(
        default=None,
        description="Vastu zone mapping: direction to room types (e.g., {'southeast': ['kitchen'], 'southwest': ['master-bedroom']})"
    )

    # Road side for entrance placement
    road_side: Optional[str] = Field(
        default='south',
        description="Direction of road/entrance (north, south, east, west)"
    )

    # Orientation (for north arrow)
    orientation: Optional[Direction] = Field(
        default=Direction.NORTH,
        description="Plot orientation (direction of front facing)"
    )

    # Staircase position (calculated coordinates)
    staircase_position: Optional[tuple] = Field(
        default=None,
        description="Staircase (x, y) position in feet"
    )

    # Rendering options
    style: str = Field(
        default="professional",
        description="Rendering style: professional, blueprint, sketch"
    )

    ai_render: bool = Field(
        default=True,
        description="Whether to apply AI rendering (Gemini)"
    )

    background: Literal["white", "black", "blueprint"] = Field(
        default="white",
        description="Background color for wireframe"
    )


# ============================================
# API Response Models
# ============================================

class RenderResult(BaseModel):
    """Result of rendering operation"""
    success: bool = Field(..., description="Whether rendering succeeded")
    message: str = Field(..., description="Status message")

    # Generated files
    dxf_path: Optional[str] = Field(
        default=None,
        description="Path to generated DXF file"
    )
    wireframe_base64: Optional[str] = Field(
        default=None,
        description="Base64 encoded wireframe PNG"
    )
    ai_rendered_base64: Optional[str] = Field(
        default=None,
        description="Base64 encoded AI-rendered blueprint"
    )

    # Metadata
    ai_enhanced: bool = Field(
        default=False,
        description="Whether AI rendering was applied"
    )
    rooms_count: int = Field(
        default=0,
        description="Number of rooms rendered"
    )
    total_area_sqft: float = Field(
        default=0.0,
        description="Total rendered area in sq.ft"
    )


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    service: str = Field(..., description="Service name")
    version: str = Field(default="1.0.0", description="API version")
