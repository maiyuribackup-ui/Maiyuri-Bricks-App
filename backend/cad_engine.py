"""
CAD Engine for Engineering Plan Rendering

Generates precise DXF files and wireframe PNGs from engineering plan specifications.
Supports wall systems, staircases, plumbing shafts, and Indian-style dimensions.
"""

import ezdxf
from ezdxf import units
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import matplotlib.pyplot as plt
import io
import ezdxf.zoom
import math
from typing import List, Tuple, Dict, Optional, Literal
from dataclasses import dataclass


@dataclass
class WallSystem:
    """Wall system specifications from engineering plan"""
    external_thickness_inches: float
    internal_thickness_inches: float
    material: str
    load_bearing_walls: List[str]


@dataclass
class Staircase:
    """Staircase specifications from engineering plan"""
    type: Literal['straight', 'l-shaped', 'u-shaped', 'spiral']
    position: str
    width_feet: float
    riser_height_inches: float
    tread_width_inches: float


@dataclass
class Room:
    """Room specification from dimensioning agent"""
    id: str
    name: str
    type: str
    width: float  # feet
    depth: float  # feet
    area_sqft: float
    zone: str
    adjacent_to: List[str]
    origin: Optional[Tuple[float, float]] = None  # calculated position


class EngineeringCadGenerator:
    """
    Enhanced CAD generator for engineering plan visualization.

    Handles:
    - Room layouts with calculated positions
    - Wall thickness representation
    - Staircase symbols (multiple types)
    - Plumbing and ventilation shafts
    - Door and window symbols
    - Indian-style dimensions (feet-inches format)
    """

    # Layer names for organization
    LAYER_WALLS = "WALLS"
    LAYER_ROOMS = "ROOMS"
    LAYER_DIMENSIONS = "DIMENSIONS"
    LAYER_STAIRS = "STAIRS"
    LAYER_PLUMBING = "PLUMBING"
    LAYER_VENTILATION = "VENTILATION"
    LAYER_DOORS = "DOORS"
    LAYER_WINDOWS = "WINDOWS"
    LAYER_LABELS = "LABELS"
    LAYER_FURNITURE = "FURNITURE"
    LAYER_FIXTURES = "FIXTURES"

    # Colors (ACI color codes)
    COLOR_WALL_EXTERNAL = 1  # Red
    COLOR_WALL_INTERNAL = 7  # White/Black
    COLOR_STAIRS = 3  # Green
    COLOR_PLUMBING = 5  # Blue
    COLOR_VENTILATION = 4  # Cyan
    COLOR_DOORS = 6  # Magenta
    COLOR_WINDOWS = 4  # Cyan (same as ventilation - represents glass)
    COLOR_LABELS = 7  # White/Black
    COLOR_FURNITURE = 30  # Orange (ACI 30)
    COLOR_FIXTURES = 140  # Light blue (ACI 140)

    def __init__(self, unit: str = 'feet'):
        """
        Initialize CAD generator.

        Args:
            unit: Measurement unit ('feet' or 'meters')
        """
        self.doc = ezdxf.new('R2010')
        self.unit = unit

        # Set units based on preference
        if unit == 'feet':
            self.doc.units = units.FT
            self.scale = 1.0
        else:
            self.doc.units = units.M
            self.scale = 0.3048  # feet to meters

        self.msp = self.doc.modelspace()
        self._setup_layers()
        self._setup_dimension_style()

        # Store room positions for adjacency calculations
        self.room_positions: Dict[str, Tuple[float, float, float, float]] = {}
        self.wall_system: Optional[WallSystem] = None

    def _setup_layers(self):
        """Create layers for different element types"""
        layers = [
            (self.LAYER_WALLS, self.COLOR_WALL_EXTERNAL),
            (self.LAYER_ROOMS, 7),
            (self.LAYER_DIMENSIONS, 7),
            (self.LAYER_STAIRS, self.COLOR_STAIRS),
            (self.LAYER_PLUMBING, self.COLOR_PLUMBING),
            (self.LAYER_VENTILATION, self.COLOR_VENTILATION),
            (self.LAYER_DOORS, self.COLOR_DOORS),
            (self.LAYER_WINDOWS, self.COLOR_WINDOWS),
            (self.LAYER_LABELS, self.COLOR_LABELS),
            (self.LAYER_FURNITURE, self.COLOR_FURNITURE),
            (self.LAYER_FIXTURES, self.COLOR_FIXTURES),
        ]
        for name, color in layers:
            self.doc.layers.add(name, color=color)

    def _setup_dimension_style(self):
        """Setup Indian-style dimension formatting"""
        # Create custom dimension style for feet-inches
        dimstyle = self.doc.dimstyles.new('INDIAN_FT_IN')
        dimstyle.dxf.dimtxt = 0.15  # Text height
        dimstyle.dxf.dimasz = 0.1   # Arrow size
        dimstyle.dxf.dimexe = 0.05  # Extension line extension
        dimstyle.dxf.dimexo = 0.05  # Extension line offset

    def _feet_to_indian_format(self, feet: float) -> str:
        """
        Convert feet to Indian format: X'-Y"

        Args:
            feet: Measurement in feet

        Returns:
            String like "10'-6\"" or "3'-0\""
        """
        whole_feet = int(feet)
        inches = round((feet - whole_feet) * 12)
        if inches == 12:
            whole_feet += 1
            inches = 0
        return f"{whole_feet}'-{inches}\""

    def set_wall_system(self, wall_system: WallSystem):
        """
        Set wall system specifications for the drawing.

        Args:
            wall_system: Wall thickness and material specs
        """
        self.wall_system = wall_system

    def add_room_with_walls(
        self,
        room: Room,
        origin: Tuple[float, float],
        is_external: bool = False,
        doors: List[Dict] = None
    ):
        """
        Draw a room with proper wall thickness representation.

        Args:
            room: Room specification
            origin: (x, y) position in feet
            is_external: Whether this room has external walls
            doors: List of door specifications [{wall: 'north'|'south'|'east'|'west', position: float}]
        """
        x, y = origin
        width, depth = room.width, room.depth

        # Calculate wall thickness in feet
        if self.wall_system:
            ext_thick = self.wall_system.external_thickness_inches / 12
            int_thick = self.wall_system.internal_thickness_inches / 12
        else:
            ext_thick = 9 / 12  # Default 9"
            int_thick = 4.5 / 12  # Default 4.5"

        wall_thick = ext_thick if is_external else int_thick

        # Draw outer boundary
        outer_points = [
            (x, y),
            (x + width, y),
            (x + width, y + depth),
            (x, y + depth),
            (x, y)
        ]
        self.msp.add_lwpolyline(
            outer_points,
            close=True,
            dxfattribs={'layer': self.LAYER_WALLS, 'color': self.COLOR_WALL_EXTERNAL if is_external else self.COLOR_WALL_INTERNAL}
        )

        # Draw inner boundary (showing wall thickness)
        inner_points = [
            (x + wall_thick, y + wall_thick),
            (x + width - wall_thick, y + wall_thick),
            (x + width - wall_thick, y + depth - wall_thick),
            (x + wall_thick, y + depth - wall_thick),
            (x + wall_thick, y + wall_thick)
        ]
        self.msp.add_lwpolyline(
            inner_points,
            close=True,
            dxfattribs={'layer': self.LAYER_WALLS}
        )

        # Add room label - centered in room
        label_x = x + width / 2
        label_y = y + depth / 2

        # Calculate text height based on room size (larger rooms get larger text)
        text_height = max(0.5, min(1.2, min(width, depth) / 8))

        # Room name - use dark color (250 = dark gray, almost black)
        self.msp.add_text(
            room.name,
            dxfattribs={
                'height': text_height,
                'layer': self.LAYER_LABELS,
                'color': 250,  # Dark gray (almost black)
            }
        ).set_placement((label_x, label_y + text_height * 0.5), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # Add area text below name
        area_text = f"{room.area_sqft:.0f} sq.ft"
        self.msp.add_text(
            area_text,
            dxfattribs={
                'height': text_height * 0.7,
                'layer': self.LAYER_LABELS,
                'color': 251,  # Slightly lighter gray
            }
        ).set_placement((label_x, label_y - text_height * 0.3), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # Add room dimensions
        dim_text = f"{room.width}' × {room.depth}'"
        self.msp.add_text(
            dim_text,
            dxfattribs={
                'height': text_height * 0.5,
                'layer': self.LAYER_LABELS,
                'color': 252,  # Medium gray for dimensions
            }
        ).set_placement((label_x, label_y - text_height * 1.0), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # Store position for adjacency
        self.room_positions[room.id] = (x, y, width, depth)

        # Add doors if specified
        if doors:
            for door in doors:
                self._add_door(x, y, width, depth, door['wall'], door.get('position', 0.5), door.get('width', 3))

        return (x, y, width, depth)

    def _add_door(
        self,
        room_x: float,
        room_y: float,
        room_width: float,
        room_depth: float,
        wall: str,
        position: float = 0.5,
        door_width: float = 3.0
    ):
        """
        Add a door symbol to a wall.

        Args:
            room_x, room_y: Room origin
            room_width, room_depth: Room dimensions
            wall: 'north', 'south', 'east', 'west'
            position: 0-1 position along wall (0.5 = center)
            door_width: Door width in feet
        """
        half_door = door_width / 2

        if wall == 'south':
            cx = room_x + room_width * position
            cy = room_y
            # Draw door opening (gap in wall)
            self.msp.add_line(
                (cx - half_door, cy),
                (cx + half_door, cy),
                dxfattribs={'layer': self.LAYER_DOORS, 'color': 0}  # Background color to "erase"
            )
            # Draw door swing arc
            self.msp.add_arc(
                center=(cx - half_door, cy),
                radius=door_width,
                start_angle=0,
                end_angle=90,
                dxfattribs={'layer': self.LAYER_DOORS}
            )
        elif wall == 'north':
            cx = room_x + room_width * position
            cy = room_y + room_depth
            self.msp.add_arc(
                center=(cx + half_door, cy),
                radius=door_width,
                start_angle=180,
                end_angle=270,
                dxfattribs={'layer': self.LAYER_DOORS}
            )
        elif wall == 'west':
            cx = room_x
            cy = room_y + room_depth * position
            self.msp.add_arc(
                center=(cx, cy - half_door),
                radius=door_width,
                start_angle=0,
                end_angle=90,
                dxfattribs={'layer': self.LAYER_DOORS}
            )
        elif wall == 'east':
            cx = room_x + room_width
            cy = room_y + room_depth * position
            self.msp.add_arc(
                center=(cx, cy + half_door),
                radius=door_width,
                start_angle=180,
                end_angle=270,
                dxfattribs={'layer': self.LAYER_DOORS}
            )

    def add_door(
        self,
        room_id: str,
        wall: str,
        position: float = 0.5,
        door_width: float = 3.0
    ):
        """
        Add a door to an existing room.

        Args:
            room_id: ID of the room to add door to
            wall: 'north', 'south', 'east', 'west'
            position: 0-1 position along wall (0.5 = center)
            door_width: Door width in feet (default 3')
        """
        if room_id not in self.room_positions:
            return

        room_x, room_y, room_width, room_depth = self.room_positions[room_id]
        self._add_door(room_x, room_y, room_width, room_depth, wall, position, door_width)

    def _add_window(
        self,
        room_x: float,
        room_y: float,
        room_width: float,
        room_depth: float,
        wall: str,
        position: float = 0.5,
        window_width: float = 4.0
    ):
        """
        Add a window symbol to a wall.
        Window is drawn as a double line break in the wall with cross lines.

        Args:
            room_x, room_y: Room origin
            room_width, room_depth: Room dimensions
            wall: 'north', 'south', 'east', 'west'
            position: 0-1 position along wall (0.5 = center)
            window_width: Window width in feet
        """
        half_window = window_width / 2
        line_offset = 0.15  # Offset for double line

        if wall == 'south':
            cx = room_x + room_width * position
            cy = room_y
            # Draw window symbol - double lines with cross pattern
            # Outer line
            self.msp.add_line(
                (cx - half_window, cy - line_offset),
                (cx + half_window, cy - line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Inner line
            self.msp.add_line(
                (cx - half_window, cy + line_offset),
                (cx + half_window, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # End caps
            self.msp.add_line(
                (cx - half_window, cy - line_offset),
                (cx - half_window, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            self.msp.add_line(
                (cx + half_window, cy - line_offset),
                (cx + half_window, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Center cross (glass pane divider)
            self.msp.add_line(
                (cx, cy - line_offset),
                (cx, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )

        elif wall == 'north':
            cx = room_x + room_width * position
            cy = room_y + room_depth
            # Outer line
            self.msp.add_line(
                (cx - half_window, cy - line_offset),
                (cx + half_window, cy - line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Inner line
            self.msp.add_line(
                (cx - half_window, cy + line_offset),
                (cx + half_window, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # End caps
            self.msp.add_line(
                (cx - half_window, cy - line_offset),
                (cx - half_window, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            self.msp.add_line(
                (cx + half_window, cy - line_offset),
                (cx + half_window, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Center cross
            self.msp.add_line(
                (cx, cy - line_offset),
                (cx, cy + line_offset),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )

        elif wall == 'west':
            cx = room_x
            cy = room_y + room_depth * position
            # Outer line
            self.msp.add_line(
                (cx - line_offset, cy - half_window),
                (cx - line_offset, cy + half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Inner line
            self.msp.add_line(
                (cx + line_offset, cy - half_window),
                (cx + line_offset, cy + half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # End caps
            self.msp.add_line(
                (cx - line_offset, cy - half_window),
                (cx + line_offset, cy - half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            self.msp.add_line(
                (cx - line_offset, cy + half_window),
                (cx + line_offset, cy + half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Center cross
            self.msp.add_line(
                (cx - line_offset, cy),
                (cx + line_offset, cy),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )

        elif wall == 'east':
            cx = room_x + room_width
            cy = room_y + room_depth * position
            # Outer line
            self.msp.add_line(
                (cx - line_offset, cy - half_window),
                (cx - line_offset, cy + half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Inner line
            self.msp.add_line(
                (cx + line_offset, cy - half_window),
                (cx + line_offset, cy + half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # End caps
            self.msp.add_line(
                (cx - line_offset, cy - half_window),
                (cx + line_offset, cy - half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            self.msp.add_line(
                (cx - line_offset, cy + half_window),
                (cx + line_offset, cy + half_window),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )
            # Center cross
            self.msp.add_line(
                (cx - line_offset, cy),
                (cx + line_offset, cy),
                dxfattribs={'layer': self.LAYER_WINDOWS, 'color': self.COLOR_WINDOWS}
            )

    def add_window(
        self,
        room_id: str,
        wall: str,
        position: float = 0.5,
        window_width: float = 4.0
    ):
        """
        Add a window to an existing room.

        Args:
            room_id: ID of the room to add window to
            wall: 'north', 'south', 'east', 'west'
            position: 0-1 position along wall (0.5 = center)
            window_width: Window width in feet (default 4')
        """
        if room_id not in self.room_positions:
            return

        room_x, room_y, room_width, room_depth = self.room_positions[room_id]
        self._add_window(room_x, room_y, room_width, room_depth, wall, position, window_width)

    # ============== FURNITURE AND FIXTURES ==============

    def add_bed(
        self,
        position: Tuple[float, float],
        bed_type: str = 'double',
        rotation: float = 0
    ):
        """
        Add a bed symbol.

        Args:
            position: (x, y) bottom-left corner
            bed_type: 'single' (3'x6.5'), 'double' (4.5'x6.5'), 'king' (6'x6.5')
            rotation: Rotation in degrees (0 = headboard at top)
        """
        x, y = position

        # Bed dimensions in feet
        sizes = {
            'single': (3.0, 6.5),
            'double': (4.5, 6.5),
            'queen': (5.0, 6.5),
            'king': (6.0, 6.5),
        }
        width, depth = sizes.get(bed_type, sizes['double'])

        # Bed outline
        self.msp.add_lwpolyline(
            [(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # Headboard (thicker line at top)
        headboard_height = 0.3
        self.msp.add_lwpolyline(
            [
                (x, y + depth - headboard_height),
                (x + width, y + depth - headboard_height),
                (x + width, y + depth),
                (x, y + depth),
                (x, y + depth - headboard_height)
            ],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # Pillows
        pillow_width = width * 0.4
        pillow_height = 0.5
        pillow_margin = (width - pillow_width * 2) / 3

        # Left pillow
        px1 = x + pillow_margin
        py = y + depth - headboard_height - pillow_height - 0.2
        self.msp.add_lwpolyline(
            [(px1, py), (px1 + pillow_width, py), (px1 + pillow_width, py + pillow_height),
             (px1, py + pillow_height), (px1, py)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # Right pillow (for double/king beds)
        if bed_type != 'single':
            px2 = x + pillow_margin * 2 + pillow_width
            self.msp.add_lwpolyline(
                [(px2, py), (px2 + pillow_width, py), (px2 + pillow_width, py + pillow_height),
                 (px2, py + pillow_height), (px2, py)],
                close=True,
                dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
            )

    def add_sofa(
        self,
        position: Tuple[float, float],
        sofa_type: str = '3-seater',
        facing: str = 'south'
    ):
        """
        Add a sofa symbol.

        Args:
            position: (x, y) bottom-left corner
            sofa_type: '2-seater' (5'x2.5'), '3-seater' (7'x2.5'), 'l-shaped'
            facing: Direction sofa faces ('north', 'south', 'east', 'west')
        """
        x, y = position

        sizes = {
            '2-seater': (5.0, 2.5),
            '3-seater': (7.0, 2.5),
            'loveseat': (4.0, 2.5),
        }
        width, depth = sizes.get(sofa_type, sizes['3-seater'])

        # Main sofa body
        self.msp.add_lwpolyline(
            [(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # Backrest
        backrest_depth = 0.5
        if facing == 'south':
            self.msp.add_lwpolyline(
                [(x, y + depth - backrest_depth), (x + width, y + depth - backrest_depth),
                 (x + width, y + depth), (x, y + depth), (x, y + depth - backrest_depth)],
                close=True,
                dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
            )
        elif facing == 'north':
            self.msp.add_lwpolyline(
                [(x, y), (x + width, y), (x + width, y + backrest_depth),
                 (x, y + backrest_depth), (x, y)],
                close=True,
                dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
            )

        # Armrests
        armrest_width = 0.3
        # Left armrest
        self.msp.add_lwpolyline(
            [(x, y), (x + armrest_width, y), (x + armrest_width, y + depth),
             (x, y + depth), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )
        # Right armrest
        self.msp.add_lwpolyline(
            [(x + width - armrest_width, y), (x + width, y), (x + width, y + depth),
             (x + width - armrest_width, y + depth), (x + width - armrest_width, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

    def add_coffee_table(
        self,
        position: Tuple[float, float],
        width: float = 3.5,
        depth: float = 2.0
    ):
        """
        Add a coffee table symbol.

        Args:
            position: (x, y) center position
            width: Table width in feet
            depth: Table depth in feet
        """
        x, y = position
        half_w, half_d = width / 2, depth / 2

        # Table top (rectangle)
        self.msp.add_lwpolyline(
            [(x - half_w, y - half_d), (x + half_w, y - half_d),
             (x + half_w, y + half_d), (x - half_w, y + half_d), (x - half_w, y - half_d)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

    def add_tv_unit(
        self,
        position: Tuple[float, float],
        width: float = 5.0,
        wall: str = 'north'
    ):
        """
        Add a TV unit/entertainment center symbol.

        Args:
            position: (x, y) position
            width: Unit width in feet
            wall: Wall it's against ('north', 'south', 'east', 'west')
        """
        x, y = position
        depth = 1.5

        # TV unit cabinet
        self.msp.add_lwpolyline(
            [(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # TV screen (rectangle on top)
        tv_width = width * 0.7
        tv_height = 0.15
        tv_x = x + (width - tv_width) / 2
        self.msp.add_lwpolyline(
            [(tv_x, y + depth), (tv_x + tv_width, y + depth),
             (tv_x + tv_width, y + depth + tv_height), (tv_x, y + depth + tv_height), (tv_x, y + depth)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

    def add_dining_table(
        self,
        position: Tuple[float, float],
        seats: int = 4
    ):
        """
        Add a dining table with chairs.

        Args:
            position: (x, y) center position
            seats: Number of seats (4 or 6)
        """
        x, y = position

        # Table dimensions based on seats
        if seats <= 4:
            table_w, table_d = 4.0, 3.0
        else:
            table_w, table_d = 6.0, 3.5

        half_w, half_d = table_w / 2, table_d / 2

        # Table
        self.msp.add_lwpolyline(
            [(x - half_w, y - half_d), (x + half_w, y - half_d),
             (x + half_w, y + half_d), (x - half_w, y + half_d), (x - half_w, y - half_d)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # Chairs
        chair_size = 1.2
        chair_offset = 0.3

        # Top and bottom chairs
        for i in range(seats // 2):
            cx = x - half_w + (i + 0.5) * (table_w / (seats // 2))
            # Top chair
            self._add_chair((cx, y + half_d + chair_offset), chair_size)
            # Bottom chair
            self._add_chair((cx, y - half_d - chair_offset - chair_size), chair_size)

    def _add_chair(self, position: Tuple[float, float], size: float = 1.2):
        """Draw a simple chair symbol"""
        x, y = position
        half = size / 2
        self.msp.add_lwpolyline(
            [(x - half, y), (x + half, y), (x + half, y + size), (x - half, y + size), (x - half, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

    def add_wardrobe(
        self,
        position: Tuple[float, float],
        width: float = 6.0,
        depth: float = 2.0,
        wall: str = 'north'
    ):
        """
        Add a wardrobe/closet symbol.

        Args:
            position: (x, y) position
            width: Wardrobe width in feet
            depth: Wardrobe depth in feet
            wall: Wall it's against
        """
        x, y = position

        # Wardrobe outline
        self.msp.add_lwpolyline(
            [(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # Center line (door division)
        self.msp.add_line(
            (x + width / 2, y), (x + width / 2, y + depth),
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

        # Door handles (small circles)
        handle_y = y + depth / 2
        self.msp.add_circle(
            (x + width / 2 - 0.3, handle_y), 0.1,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )
        self.msp.add_circle(
            (x + width / 2 + 0.3, handle_y), 0.1,
            dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
        )

    # ============== BATHROOM FIXTURES ==============

    def add_toilet(self, position: Tuple[float, float], facing: str = 'south'):
        """
        Add a toilet/WC symbol.

        Args:
            position: (x, y) position (back wall corner)
            facing: Direction toilet faces
        """
        x, y = position
        # Toilet dimensions: ~1.5' x 2.5'

        # Tank (rectangle at back)
        tank_w, tank_d = 1.5, 0.6
        self.msp.add_lwpolyline(
            [(x, y), (x + tank_w, y), (x + tank_w, y + tank_d), (x, y + tank_d), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Bowl (elongated oval - taller than wide)
        bowl_w, bowl_d = 1.3, 1.8
        bowl_x = x + (tank_w - bowl_w) / 2
        bowl_y = y + tank_d

        # For ellipse: major_axis must be the longer dimension, ratio = minor/major <= 1.0
        # Bowl is taller than wide, so major axis is vertical
        self.msp.add_ellipse(
            center=(bowl_x + bowl_w / 2, bowl_y + bowl_d / 2),
            major_axis=(0, bowl_d / 2),  # Vertical major axis
            ratio=bowl_w / bowl_d,  # ratio = minor/major = 1.3/1.8 = 0.72
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

    def add_bathroom_sink(self, position: Tuple[float, float], wall: str = 'north'):
        """
        Add a bathroom sink/washbasin symbol.

        Args:
            position: (x, y) position
            wall: Wall it's mounted on
        """
        x, y = position
        # Sink dimensions: ~2' x 1.5'
        sink_w, sink_d = 2.0, 1.5

        # Counter/vanity
        self.msp.add_lwpolyline(
            [(x, y), (x + sink_w, y), (x + sink_w, y + sink_d), (x, y + sink_d), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Basin (inner oval)
        basin_w, basin_d = 1.2, 0.9
        cx = x + sink_w / 2
        cy = y + sink_d / 2
        self.msp.add_ellipse(
            center=(cx, cy),
            major_axis=(basin_w / 2, 0),
            ratio=basin_d / basin_w,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Faucet symbol (small rectangle)
        self.msp.add_lwpolyline(
            [(cx - 0.15, y + sink_d - 0.1), (cx + 0.15, y + sink_d - 0.1),
             (cx + 0.15, y + sink_d), (cx - 0.15, y + sink_d), (cx - 0.15, y + sink_d - 0.1)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

    def add_shower(self, position: Tuple[float, float], size: float = 3.0):
        """
        Add a shower enclosure symbol.

        Args:
            position: (x, y) corner position
            size: Shower size (typically 3' x 3')
        """
        x, y = position

        # Shower base
        self.msp.add_lwpolyline(
            [(x, y), (x + size, y), (x + size, y + size), (x, y + size), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Diagonal lines to indicate shower
        self.msp.add_line(
            (x, y), (x + size, y + size),
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )
        self.msp.add_line(
            (x + size, y), (x, y + size),
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Shower head symbol (small circle)
        self.msp.add_circle(
            (x + size / 2, y + size - 0.3), 0.2,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

    def add_bathtub(self, position: Tuple[float, float], width: float = 2.5, length: float = 5.0):
        """
        Add a bathtub symbol.

        Args:
            position: (x, y) position
            width: Tub width in feet
            length: Tub length in feet
        """
        x, y = position

        # Outer tub shape
        self.msp.add_lwpolyline(
            [(x, y), (x + width, y), (x + width, y + length), (x, y + length), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Inner tub (offset)
        offset = 0.2
        self.msp.add_lwpolyline(
            [(x + offset, y + offset), (x + width - offset, y + offset),
             (x + width - offset, y + length - offset), (x + offset, y + length - offset),
             (x + offset, y + offset)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Drain (small circle at one end)
        self.msp.add_circle(
            (x + width / 2, y + 0.5), 0.1,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

    # ============== KITCHEN FIXTURES ==============

    def add_kitchen_counter(
        self,
        position: Tuple[float, float],
        width: float = 8.0,
        depth: float = 2.0,
        wall: str = 'north'
    ):
        """
        Add a kitchen counter/platform symbol.

        Args:
            position: (x, y) position
            width: Counter width in feet
            depth: Counter depth in feet
            wall: Wall counter is against
        """
        x, y = position

        # Counter outline
        self.msp.add_lwpolyline(
            [(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Hatch pattern to indicate counter
        for i in range(int(width)):
            self.msp.add_line(
                (x + i + 0.5, y), (x + i + 0.5, y + depth),
                dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
            )

    def add_kitchen_sink(self, position: Tuple[float, float]):
        """
        Add a kitchen sink symbol (double basin).

        Args:
            position: (x, y) position
        """
        x, y = position
        sink_w, sink_d = 3.0, 2.0

        # Sink outline
        self.msp.add_lwpolyline(
            [(x, y), (x + sink_w, y), (x + sink_w, y + sink_d), (x, y + sink_d), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Two basins
        basin_w = 1.2
        basin_d = 1.4
        basin_margin = (sink_w - basin_w * 2) / 3

        # Left basin
        bx1 = x + basin_margin
        by = y + (sink_d - basin_d) / 2
        self.msp.add_lwpolyline(
            [(bx1, by), (bx1 + basin_w, by), (bx1 + basin_w, by + basin_d),
             (bx1, by + basin_d), (bx1, by)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Right basin
        bx2 = x + basin_margin * 2 + basin_w
        self.msp.add_lwpolyline(
            [(bx2, by), (bx2 + basin_w, by), (bx2 + basin_w, by + basin_d),
             (bx2, by + basin_d), (bx2, by)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

    def add_stove(self, position: Tuple[float, float], burners: int = 4):
        """
        Add a stove/cooktop symbol.

        Args:
            position: (x, y) position
            burners: Number of burners (2 or 4)
        """
        x, y = position
        stove_w = 2.5 if burners == 4 else 2.0
        stove_d = 2.0

        # Stove outline
        self.msp.add_lwpolyline(
            [(x, y), (x + stove_w, y), (x + stove_w, y + stove_d), (x, y + stove_d), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Burners (circles)
        burner_radius = 0.3
        if burners == 4:
            positions = [
                (x + stove_w * 0.25, y + stove_d * 0.3),
                (x + stove_w * 0.75, y + stove_d * 0.3),
                (x + stove_w * 0.25, y + stove_d * 0.7),
                (x + stove_w * 0.75, y + stove_d * 0.7),
            ]
        else:
            positions = [
                (x + stove_w * 0.33, y + stove_d * 0.5),
                (x + stove_w * 0.67, y + stove_d * 0.5),
            ]

        for bx, by in positions:
            self.msp.add_circle(
                (bx, by), burner_radius,
                dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
            )

    def add_refrigerator(self, position: Tuple[float, float]):
        """
        Add a refrigerator symbol.

        Args:
            position: (x, y) position
        """
        x, y = position
        fridge_w, fridge_d = 3.0, 2.5

        # Fridge outline
        self.msp.add_lwpolyline(
            [(x, y), (x + fridge_w, y), (x + fridge_w, y + fridge_d), (x, y + fridge_d), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # Door line
        self.msp.add_line(
            (x + fridge_w / 2, y), (x + fridge_w / 2, y + fridge_d),
            dxfattribs={'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        )

        # "RF" label
        self.msp.add_text(
            "RF",
            dxfattribs={'height': 0.3, 'layer': self.LAYER_FIXTURES, 'color': self.COLOR_FIXTURES}
        ).set_placement((x + fridge_w / 2, y + fridge_d / 2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    def add_room_furniture(self, room_id: str, room_type: str):
        """
        Add appropriate furniture to a room based on its type.

        Args:
            room_id: Room identifier
            room_type: Type of room ('bedroom', 'living', 'kitchen', etc.)
        """
        if room_id not in self.room_positions:
            return

        rx, ry, rw, rd = self.room_positions[room_id]

        # Wall offset for furniture placement
        wall_offset = 0.75

        if room_type in ['bedroom', 'master-bedroom']:
            # Add bed (centered against north wall)
            bed_type = 'king' if room_type == 'master-bedroom' else 'double'
            bed_sizes = {'single': 3.0, 'double': 4.5, 'queen': 5.0, 'king': 6.0}
            bed_w = bed_sizes.get(bed_type, 4.5)
            bed_x = rx + (rw - bed_w) / 2
            bed_y = ry + rd - 6.5 - wall_offset
            self.add_bed((bed_x, bed_y), bed_type)

            # Add wardrobe on west wall
            if rw > 10:  # Only if room is wide enough
                self.add_wardrobe((rx + wall_offset, ry + wall_offset), width=5.0, depth=2.0)

        elif room_type in ['living', 'living-room']:
            # Add sofa (against north wall, centered)
            sofa_w = 7.0
            sofa_x = rx + (rw - sofa_w) / 2
            sofa_y = ry + rd - 2.5 - wall_offset
            self.add_sofa((sofa_x, sofa_y), '3-seater', facing='south')

            # Add coffee table in front of sofa
            self.add_coffee_table((rx + rw / 2, ry + rd / 2 - 1))

            # Add TV unit on south wall
            tv_w = 5.0
            tv_x = rx + (rw - tv_w) / 2
            self.add_tv_unit((tv_x, ry + wall_offset), width=tv_w)

        elif room_type == 'kitchen':
            # Add counter along north wall
            counter_w = rw - 2 * wall_offset
            self.add_kitchen_counter(
                (rx + wall_offset, ry + rd - 2.0 - wall_offset),
                width=counter_w, depth=2.0
            )

            # Add sink in counter
            sink_x = rx + wall_offset + counter_w / 2 - 1.5
            self.add_kitchen_sink((sink_x, ry + rd - 2.0 - wall_offset))

            # Add stove
            stove_x = rx + wall_offset + 0.5
            stove_y = ry + rd - 2.0 - wall_offset
            self.add_stove((stove_x, stove_y), burners=4)

            # Add refrigerator in corner
            self.add_refrigerator((rx + rw - 3.0 - wall_offset, ry + wall_offset))

        elif room_type == 'dining':
            # Add dining table (centered)
            self.add_dining_table((rx + rw / 2, ry + rd / 2), seats=4)

        elif room_type in ['bathroom', 'attached-bathroom', 'common-bathroom', 'attached-bath']:
            # Add toilet
            self.add_toilet((rx + wall_offset, ry + rd - 2.5 - wall_offset))

            # Add sink
            self.add_bathroom_sink((rx + rw - 2.0 - wall_offset, ry + rd - 1.5 - wall_offset))

            # Add shower or bathtub based on room size
            if rw >= 6 and rd >= 6:
                # Larger bathroom - add bathtub
                self.add_bathtub((rx + wall_offset, ry + wall_offset), width=2.5, length=5.0)
            else:
                # Smaller bathroom - add shower
                self.add_shower((rx + rw - 3.0 - wall_offset, ry + wall_offset), size=3.0)

        elif room_type == 'courtyard':
            # Add simple decorative elements (plants represented as circles)
            self.msp.add_circle(
                (rx + rw / 2, ry + rd / 2), 1.0,
                dxfattribs={'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
            )
            # Plant label
            self.msp.add_text(
                "PLANT",
                dxfattribs={'height': 0.25, 'layer': self.LAYER_FURNITURE, 'color': self.COLOR_FURNITURE}
            ).set_placement((rx + rw / 2, ry + rd / 2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    def add_staircase(
        self,
        staircase: Staircase,
        origin: Tuple[float, float],
        direction: str = 'up'
    ):
        """
        Draw staircase symbol based on type.

        Args:
            staircase: Staircase specifications
            origin: (x, y) position
            direction: 'up' or 'down' (direction of travel)
        """
        x, y = origin
        width = staircase.width_feet

        # Calculate length based on floor height (assuming 10' floor)
        floor_height_inches = 10 * 12  # 120 inches
        num_steps = math.ceil(floor_height_inches / staircase.riser_height_inches)
        tread_feet = staircase.tread_width_inches / 12
        total_length = num_steps * tread_feet

        if staircase.type == 'straight':
            self._draw_straight_staircase(x, y, width, total_length, num_steps)
        elif staircase.type == 'l-shaped':
            self._draw_l_staircase(x, y, width, total_length, num_steps)
        elif staircase.type == 'u-shaped':
            self._draw_u_staircase(x, y, width, total_length, num_steps)
        elif staircase.type == 'spiral':
            self._draw_spiral_staircase(x, y, width)

    def _draw_straight_staircase(self, x: float, y: float, width: float, length: float, num_steps: int):
        """Draw straight staircase with step lines"""
        # Outer boundary
        self.msp.add_lwpolyline(
            [(x, y), (x + width, y), (x + width, y + length), (x, y + length), (x, y)],
            close=True,
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

        # Draw step lines
        step_depth = length / num_steps
        for i in range(1, num_steps):
            step_y = y + i * step_depth
            self.msp.add_line(
                (x, step_y), (x + width, step_y),
                dxfattribs={'layer': self.LAYER_STAIRS}
            )

        # Direction arrow
        arrow_y = y + length * 0.8
        self.msp.add_line(
            (x + width/2, y + length * 0.2),
            (x + width/2, arrow_y),
            dxfattribs={'layer': self.LAYER_STAIRS}
        )
        # Arrow head
        self.msp.add_line(
            (x + width/2 - 0.2, arrow_y - 0.3),
            (x + width/2, arrow_y),
            dxfattribs={'layer': self.LAYER_STAIRS}
        )
        self.msp.add_line(
            (x + width/2 + 0.2, arrow_y - 0.3),
            (x + width/2, arrow_y),
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

        # Label
        self.msp.add_text(
            "UP",
            dxfattribs={'height': 0.2, 'layer': self.LAYER_STAIRS}
        ).set_placement((x + width/2, y + 0.3), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    def _draw_l_staircase(self, x: float, y: float, width: float, length: float, num_steps: int):
        """Draw L-shaped staircase with landing"""
        half_steps = num_steps // 2
        half_length = length / 2

        # First flight
        self._draw_straight_staircase(x, y, width, half_length, half_steps)

        # Landing
        landing_size = width
        self.msp.add_lwpolyline(
            [
                (x, y + half_length),
                (x + width, y + half_length),
                (x + width, y + half_length + landing_size),
                (x - landing_size, y + half_length + landing_size),
                (x - landing_size, y + half_length),
                (x, y + half_length)
            ],
            close=True,
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

        # Second flight (perpendicular)
        self.msp.add_lwpolyline(
            [
                (x - landing_size, y + half_length),
                (x - landing_size - half_length, y + half_length),
                (x - landing_size - half_length, y + half_length + landing_size),
                (x - landing_size, y + half_length + landing_size)
            ],
            close=True,
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

    def _draw_u_staircase(self, x: float, y: float, width: float, length: float, num_steps: int):
        """Draw U-shaped staircase with intermediate landing"""
        third_steps = num_steps // 3
        flight_length = length / 3
        gap = 0.5  # Gap between flights

        # First flight (going up)
        self._draw_straight_staircase(x, y, width, flight_length, third_steps)

        # Landing
        landing_depth = width
        self.msp.add_lwpolyline(
            [
                (x, y + flight_length),
                (x + width * 2 + gap, y + flight_length),
                (x + width * 2 + gap, y + flight_length + landing_depth),
                (x, y + flight_length + landing_depth),
                (x, y + flight_length)
            ],
            close=True,
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

        # Second flight (coming back down)
        second_x = x + width + gap
        self.msp.add_lwpolyline(
            [
                (second_x, y),
                (second_x + width, y),
                (second_x + width, y + flight_length),
                (second_x, y + flight_length),
                (second_x, y)
            ],
            close=True,
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

        # Step lines for second flight
        step_depth = flight_length / third_steps
        for i in range(1, third_steps):
            step_y = y + flight_length - i * step_depth
            self.msp.add_line(
                (second_x, step_y), (second_x + width, step_y),
                dxfattribs={'layer': self.LAYER_STAIRS}
            )

    def _draw_spiral_staircase(self, x: float, y: float, diameter: float):
        """Draw spiral staircase symbol"""
        radius = diameter / 2
        center = (x + radius, y + radius)

        # Outer circle
        self.msp.add_circle(
            center, radius,
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

        # Inner circle (central column)
        self.msp.add_circle(
            center, 0.5,
            dxfattribs={'layer': self.LAYER_STAIRS}
        )

        # Radial lines representing steps
        for angle in range(0, 360, 30):
            rad = math.radians(angle)
            end_x = center[0] + radius * math.cos(rad)
            end_y = center[1] + radius * math.sin(rad)
            inner_x = center[0] + 0.5 * math.cos(rad)
            inner_y = center[1] + 0.5 * math.sin(rad)
            self.msp.add_line(
                (inner_x, inner_y), (end_x, end_y),
                dxfattribs={'layer': self.LAYER_STAIRS}
            )

        # Label
        self.msp.add_text(
            "SPIRAL",
            dxfattribs={'height': 0.15, 'layer': self.LAYER_STAIRS}
        ).set_placement(center, align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    def add_plumbing_shaft(
        self,
        position: Tuple[float, float],
        size: Tuple[float, float] = (1.5, 1.5),
        label: str = "P"
    ):
        """
        Add plumbing shaft symbol.

        Args:
            position: (x, y) center position
            size: (width, height) in feet
            label: Shaft label
        """
        x, y = position
        w, h = size

        # Draw shaft rectangle with diagonal lines (standard plumbing symbol)
        self.msp.add_lwpolyline(
            [(x - w/2, y - h/2), (x + w/2, y - h/2), (x + w/2, y + h/2), (x - w/2, y + h/2)],
            close=True,
            dxfattribs={'layer': self.LAYER_PLUMBING}
        )

        # Diagonal lines
        self.msp.add_line(
            (x - w/2, y - h/2), (x + w/2, y + h/2),
            dxfattribs={'layer': self.LAYER_PLUMBING}
        )
        self.msp.add_line(
            (x + w/2, y - h/2), (x - w/2, y + h/2),
            dxfattribs={'layer': self.LAYER_PLUMBING}
        )

        # Label
        self.msp.add_text(
            label,
            dxfattribs={'height': 0.2, 'layer': self.LAYER_PLUMBING}
        ).set_placement((x, y + h/2 + 0.2), align=ezdxf.enums.TextEntityAlignment.BOTTOM_CENTER)

    def add_ventilation_shaft(
        self,
        position: Tuple[float, float],
        size: Tuple[float, float] = (1.0, 1.0),
        label: str = "V"
    ):
        """
        Add ventilation shaft symbol.

        Args:
            position: (x, y) center position
            size: (width, height) in feet
            label: Shaft label
        """
        x, y = position
        w, h = size

        # Draw shaft rectangle with circle inside (ventilation symbol)
        self.msp.add_lwpolyline(
            [(x - w/2, y - h/2), (x + w/2, y - h/2), (x + w/2, y + h/2), (x - w/2, y + h/2)],
            close=True,
            dxfattribs={'layer': self.LAYER_VENTILATION}
        )

        # Circle inside
        self.msp.add_circle(
            (x, y), min(w, h) / 3,
            dxfattribs={'layer': self.LAYER_VENTILATION}
        )

        # Label
        self.msp.add_text(
            label,
            dxfattribs={'height': 0.15, 'layer': self.LAYER_VENTILATION}
        ).set_placement((x, y + h/2 + 0.2), align=ezdxf.enums.TextEntityAlignment.BOTTOM_CENTER)

    def add_dimension_indian(
        self,
        start: Tuple[float, float],
        end: Tuple[float, float],
        offset: float = 0.5
    ):
        """
        Add dimension in Indian feet-inches format.

        Args:
            start: Start point
            end: End point
            offset: Distance from the line being dimensioned
        """
        # Calculate length
        length = math.sqrt((end[0] - start[0])**2 + (end[1] - start[1])**2)
        label = self._feet_to_indian_format(length)

        # Add aligned dimension - create first without custom text
        dim_override = self.msp.add_aligned_dim(
            p1=start,
            p2=end,
            distance=offset,
            dimstyle='INDIAN_FT_IN',
            override={
                'dimtxt': 0.15,
            }
        )
        # Set custom dimension text AFTER creation
        # dim_override is a DimStyleOverride object, access underlying dimension via .dimension
        dim_override.dimension.dxf.text = label
        dim_override.render()

    def add_overall_dimensions(self, plot_width: float, plot_depth: float, margin: float = 2.0):
        """
        Add overall plot dimensions around the drawing.

        Args:
            plot_width: Total plot width
            plot_depth: Total plot depth
            margin: Distance from plot boundary
        """
        # Bottom dimension (width)
        self.add_dimension_indian(
            (0, -margin),
            (plot_width, -margin),
            offset=0.5
        )

        # Left dimension (depth)
        self.add_dimension_indian(
            (-margin, 0),
            (-margin, plot_depth),
            offset=0.5
        )

    def add_north_arrow(self, position: Tuple[float, float], size: float = 1.0, rotation: float = 0):
        """
        Add north arrow symbol.

        Args:
            position: (x, y) position
            size: Arrow size
            rotation: Rotation in degrees (0 = north pointing up)
        """
        x, y = position

        # Convert rotation to radians
        rad = math.radians(rotation)

        # Arrow points (pointing up by default)
        arrow_length = size
        arrow_width = size * 0.3

        # Calculate rotated points
        def rotate_point(px, py):
            rx = px * math.cos(rad) - py * math.sin(rad)
            ry = px * math.sin(rad) + py * math.cos(rad)
            return (x + rx, y + ry)

        tip = rotate_point(0, arrow_length)
        left = rotate_point(-arrow_width, 0)
        right = rotate_point(arrow_width, 0)
        bottom = rotate_point(0, -arrow_length * 0.3)

        # Draw arrow
        self.msp.add_lwpolyline(
            [left, tip, right, bottom, left],
            close=True,
            dxfattribs={'layer': self.LAYER_LABELS}
        )

        # N label
        label_pos = rotate_point(0, arrow_length + 0.3)
        self.msp.add_text(
            "N",
            dxfattribs={'height': 0.25, 'layer': self.LAYER_LABELS}
        ).set_placement(label_pos, align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    def add_title_block(
        self,
        position: Tuple[float, float],
        plot_width: float,
        plot_depth: float,
        total_area: float,
        orientation: str = "north",
        scale: str = "1:100",
        project_name: str = "FLOOR PLAN",
        drawing_no: str = "FP-001"
    ):
        """
        Add a professional title block to the drawing.

        Args:
            position: (x, y) bottom-left corner of title block
            plot_width: Plot width in feet
            plot_depth: Plot depth in feet
            total_area: Total built-up area in sq.ft
            orientation: Plot orientation (north, south, east, west)
            scale: Drawing scale string
            project_name: Project/drawing title
            drawing_no: Drawing reference number
        """
        x, y = position
        block_width = 8.0   # Title block width in feet
        block_height = 4.0  # Title block height in feet

        # Draw title block border (double line)
        outer_points = [
            (x, y),
            (x + block_width, y),
            (x + block_width, y + block_height),
            (x, y + block_height),
            (x, y)
        ]
        self.msp.add_lwpolyline(
            outer_points,
            close=True,
            dxfattribs={'layer': self.LAYER_LABELS, 'color': 250, 'lineweight': 35}
        )

        # Inner border
        margin = 0.1
        inner_points = [
            (x + margin, y + margin),
            (x + block_width - margin, y + margin),
            (x + block_width - margin, y + block_height - margin),
            (x + margin, y + block_height - margin),
            (x + margin, y + margin)
        ]
        self.msp.add_lwpolyline(
            inner_points,
            close=True,
            dxfattribs={'layer': self.LAYER_LABELS, 'color': 252}
        )

        # Horizontal divider lines
        divider_y = y + block_height * 0.6
        self.msp.add_line(
            (x, divider_y),
            (x + block_width, divider_y),
            dxfattribs={'layer': self.LAYER_LABELS, 'color': 252}
        )

        divider_y2 = y + block_height * 0.3
        self.msp.add_line(
            (x, divider_y2),
            (x + block_width, divider_y2),
            dxfattribs={'layer': self.LAYER_LABELS, 'color': 252}
        )

        # Vertical divider in bottom section
        self.msp.add_line(
            (x + block_width * 0.5, y),
            (x + block_width * 0.5, divider_y2),
            dxfattribs={'layer': self.LAYER_LABELS, 'color': 252}
        )

        # === Title Section (top) ===
        title_y = y + block_height * 0.75
        self.msp.add_text(
            project_name,
            dxfattribs={'height': 0.5, 'layer': self.LAYER_LABELS, 'color': 250}
        ).set_placement((x + block_width / 2, title_y), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # === Plot Info Section (middle) ===
        info_y = y + block_height * 0.45

        # Plot dimensions
        plot_text = f"PLOT: {plot_width}' × {plot_depth}' ({plot_width * plot_depth:.0f} sq.ft)"
        self.msp.add_text(
            plot_text,
            dxfattribs={'height': 0.25, 'layer': self.LAYER_LABELS, 'color': 251}
        ).set_placement((x + block_width / 2, info_y + 0.2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # Built-up area
        area_text = f"BUILT-UP: {total_area:.0f} sq.ft"
        self.msp.add_text(
            area_text,
            dxfattribs={'height': 0.25, 'layer': self.LAYER_LABELS, 'color': 251}
        ).set_placement((x + block_width / 2, info_y - 0.2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # === Bottom Left: Scale & Orientation ===
        bottom_left_x = x + block_width * 0.25
        bottom_y = y + block_height * 0.15

        # Scale
        self.msp.add_text(
            f"SCALE: {scale}",
            dxfattribs={'height': 0.2, 'layer': self.LAYER_LABELS, 'color': 252}
        ).set_placement((bottom_left_x, bottom_y + 0.15), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # Orientation
        self.msp.add_text(
            f"FACING: {orientation.upper()}",
            dxfattribs={'height': 0.2, 'layer': self.LAYER_LABELS, 'color': 252}
        ).set_placement((bottom_left_x, bottom_y - 0.15), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # === Bottom Right: Drawing No & Date ===
        bottom_right_x = x + block_width * 0.75

        # Drawing number
        self.msp.add_text(
            f"DWG: {drawing_no}",
            dxfattribs={'height': 0.2, 'layer': self.LAYER_LABELS, 'color': 252}
        ).set_placement((bottom_right_x, bottom_y + 0.15), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # Date
        from datetime import datetime
        date_str = datetime.now().strftime("%d-%m-%Y")
        self.msp.add_text(
            f"DATE: {date_str}",
            dxfattribs={'height': 0.2, 'layer': self.LAYER_LABELS, 'color': 252}
        ).set_placement((bottom_right_x, bottom_y - 0.15), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    def generate_dxf(self, output_path: str = "output.dxf") -> str:
        """
        Save DXF to file.

        Args:
            output_path: Output file path

        Returns:
            Path to saved file
        """
        self.doc.saveas(output_path)
        return output_path

    def generate_wireframe_image(
        self,
        dpi: int = 300,
        background: str = 'white',
        figsize: Tuple[int, int] = (12, 12)
    ) -> bytes:
        """
        Render to high-contrast PNG for AI processing.

        Args:
            dpi: Resolution
            background: Background color ('white' or 'black')
            figsize: Figure size in inches

        Returns:
            PNG image as bytes
        """
        ezdxf.zoom.extents(self.msp)

        fig, ax = plt.subplots(figsize=figsize)

        if background == 'black':
            fig.patch.set_facecolor('black')
            ax.set_facecolor('black')
        else:
            fig.patch.set_facecolor('white')
            ax.set_facecolor('white')

        ctx = RenderContext(self.doc)
        out = MatplotlibBackend(ax)
        Frontend(ctx, out).draw_layout(self.msp, finalize=True)

        ax.set_aspect('equal')
        ax.axis('off')

        img_buf = io.BytesIO()
        fig.savefig(img_buf, format='png', dpi=dpi, bbox_inches='tight',
                    facecolor=fig.get_facecolor(), edgecolor='none')
        plt.close(fig)

        return img_buf.getvalue()


# Legacy compatibility - simple generator
class CadGenerator:
    """Simple CAD generator for backward compatibility"""

    def __init__(self):
        self.doc = ezdxf.new('R2010')
        self.doc.units = units.M
        self.msp = self.doc.modelspace()

    def add_room(self, name: str, width: float, height: float, origin: Tuple[float, float] = (0, 0)):
        """Draws a rectangular room in the DXF modelspace."""
        x, y = origin
        points = [
            (x, y),
            (x + width, y),
            (x + width, y + height),
            (x, y + height),
            (x, y)
        ]
        self.msp.add_lwpolyline(points, close=True)

        self.msp.add_text(
            name,
            dxfattribs={'height': 0.3, 'style': 'STANDARD'}
        ).set_placement((x + width/2, y + height/2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        self.msp.add_aligned_dim(
            p1=(x, y - 0.5),
            p2=(x + width, y - 0.5),
            distance=0,
            dimstyle='EZDXF',
            override={'dimtxt': 0.25}
        ).render()

        self.msp.add_aligned_dim(
            p1=(x - 0.5, y),
            p2=(x - 0.5, y + height),
            distance=0,
            dimstyle='EZDXF',
            override={'dimtxt': 0.25},
            rotation=90
        ).render()

    def generate_dxf(self) -> str:
        path = "output.dxf"
        self.doc.saveas(path)
        return path

    def generate_wireframe_image(self) -> bytes:
        ezdxf.zoom.extents(self.msp)
        fig = plt.figure()
        ax = fig.add_axes([0, 0, 1, 1])
        ctx = RenderContext(self.doc)
        out = MatplotlibBackend(ax)
        Frontend(ctx, out).draw_layout(self.msp, finalize=True)
        img_buf = io.BytesIO()
        fig.savefig(img_buf, format='png', dpi=300)
        plt.close(fig)
        return img_buf.getvalue()


if __name__ == "__main__":
    # Test the enhanced generator
    gen = EngineeringCadGenerator(unit='feet')

    # Set wall system
    gen.set_wall_system(WallSystem(
        external_thickness_inches=9,
        internal_thickness_inches=4.5,
        material="Burnt clay brick masonry",
        load_bearing_walls=["north-external", "south-external"]
    ))

    # Add rooms
    living = Room(
        id="living",
        name="Living Room",
        type="living",
        width=15,
        depth=12,
        area_sqft=180,
        zone="public",
        adjacent_to=["kitchen", "dining"]
    )
    gen.add_room_with_walls(living, (0, 0), is_external=True, doors=[{'wall': 'south', 'position': 0.5}])

    kitchen = Room(
        id="kitchen",
        name="Kitchen",
        type="kitchen",
        width=10,
        depth=8,
        area_sqft=80,
        zone="service",
        adjacent_to=["living"]
    )
    gen.add_room_with_walls(kitchen, (15, 0), is_external=True)

    # Add staircase
    gen.add_staircase(
        Staircase(
            type='l-shaped',
            position="Near living room",
            width_feet=3.5,
            riser_height_inches=7,
            tread_width_inches=10
        ),
        origin=(0, 12)
    )

    # Add plumbing shaft
    gen.add_plumbing_shaft((18, 4), label="PS")

    # Add ventilation shaft
    gen.add_ventilation_shaft((20, 4), label="VS")

    # Add north arrow
    gen.add_north_arrow((25, 20), size=1.5)

    # Add overall dimensions
    gen.add_overall_dimensions(25, 20)

    # Generate outputs
    dxf_path = gen.generate_dxf("engineering_test.dxf")
    print(f"DXF saved to: {dxf_path}")

    wireframe = gen.generate_wireframe_image()
    with open("engineering_wireframe.png", "wb") as f:
        f.write(wireframe)
    print("Wireframe PNG saved")
