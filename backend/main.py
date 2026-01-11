"""
Maiyuri Bricks CAD Engine API

FastAPI backend for generating engineering plan blueprints using:
1. Precision Layer: ezdxf-based DXF/PNG wireframe generation
2. Visual Layer: Gemini 3 Pro AI rendering

Endpoints:
- GET /              : Health check
- POST /api/generate : Legacy simple blueprint generation
- POST /api/render-engineering-plan : Full engineering plan rendering (Backend Bridge)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import base64
import tempfile
import uuid
from datetime import datetime
from dotenv import load_dotenv
from typing import Optional, Dict, Tuple, List

# Load environment variables
load_dotenv()

# Import local modules
from models import (
    EngineeringPlanRenderInput,
    RenderResult,
    HealthResponse,
    RoomSpec,
    WallSystemSpec,
    StaircaseSpec,
)
from cad_engine import (
    EngineeringCadGenerator,
    CadGenerator,
    WallSystem,
    Staircase,
    Room,
)

app = FastAPI(
    title="Maiyuri Bricks CAD Engine",
    description="Engineering Plan Rendering API - Hybrid CAD-First Workflow",
    version="2.0.0"
)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output directory for generated files
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================
# Room Position Calculator
# ============================================

class RoomLayoutCalculator:
    """
    Calculates room positions based on Vastu zones and adjacency rules.

    Supports two layout modes:
    1. Courtyard-centric: Rooms arranged around central courtyard
    2. Standard: Rooms placed in Vastu-recommended quadrants

    Vastu Grid (9-zone):
    ┌────────┬────────┬────────┐
    │   NW   │   N    │   NE   │
    │ Guest  │ Living │ Pooja  │
    ├────────┼────────┼────────┤
    │   W    │ CENTER │   E    │
    │ Dining │Courtyd │ Entry  │
    ├────────┼────────┼────────┤
    │   SW   │   S    │   SE   │
    │ Master │ Verand │Kitchen │
    └────────┴────────┴────────┘
    """

    # Vastu-based room type to preferred direction mapping
    VASTU_ROOM_PLACEMENT = {
        'kitchen': ['southeast', 'east'],
        'master-bedroom': ['southwest', 'south'],
        'bedroom': ['southwest', 'south', 'northwest', 'west'],
        'pooja': ['northeast', 'north'],
        'living': ['northeast', 'north', 'east'],
        'living-room': ['northeast', 'north', 'east'],
        'dining': ['west', 'northwest'],
        'bathroom': ['northwest', 'west'],
        'attached-bathroom': ['northwest', 'west'],
        'common-bathroom': ['northwest', 'west'],
        'attached-bath': ['northwest', 'west'],
        'toilet': ['northwest', 'west'],
        'verandah': ['south', 'east'],  # Entrance side
        'veranda': ['south', 'east'],
        'courtyard': ['center'],
        'mutram': ['center'],
        'staircase': ['southwest', 'south', 'west'],
        'store': ['northwest', 'west'],
        'utility': ['northwest', 'southeast'],
    }

    def __init__(
        self,
        plot_width: float,
        plot_depth: float,
        vastu_zones: Optional[Dict[str, List[str]]] = None,
        road_side: str = 'south'
    ):
        self.plot_width = plot_width
        self.plot_depth = plot_depth
        self.vastu_zones = vastu_zones or {}
        self.road_side = road_side
        self.positions: Dict[str, Tuple[float, float]] = {}
        self.placed_rooms: Dict[str, RoomSpec] = {}

    def calculate_positions(self, rooms: List[RoomSpec]) -> Dict[str, Tuple[float, float]]:
        """
        Calculate (x, y) positions for each room using Vastu principles and adjacency.
        """
        self.positions = {}
        self.placed_rooms = {}

        # Build room lookup
        room_by_id = {r.id: r for r in rooms}
        room_by_type = {}
        for r in rooms:
            room_by_type.setdefault(r.type, []).append(r)

        # Build adjacency graph
        adjacency_graph = self._build_adjacency_graph(rooms)

        # Identify special rooms
        courtyard = self._find_room_by_type(rooms, 'courtyard') or self._find_room_by_type(rooms, 'mutram')
        verandah = self._find_room_by_type(rooms, 'verandah') or self._find_room_by_type(rooms, 'veranda')
        living = self._find_room_by_type(rooms, 'living') or self._find_room_by_type(rooms, 'living-room')

        # Calculate buildable envelope (inside setbacks)
        buildable_x = 0
        buildable_y = 0
        buildable_width = self.plot_width
        buildable_depth = self.plot_depth

        if courtyard:
            # Courtyard-centric layout
            self._place_courtyard_centric(rooms, courtyard, verandah, living, room_by_id)
        else:
            # Standard Vastu-zoned layout
            self._place_standard_layout(rooms, verandah, living)

        # Enforce adjacency constraints (adjust positions to share walls)
        self._enforce_adjacencies(rooms, adjacency_graph, room_by_id)

        # Final validation - ensure no overlaps and rooms are within plot
        self._validate_and_adjust(rooms)

        return self.positions

    def _find_room_by_type(self, rooms: List[RoomSpec], room_type: str) -> Optional[RoomSpec]:
        """Find first room matching the given type."""
        for room in rooms:
            if room.type == room_type or room.type.replace('-', '') == room_type.replace('-', ''):
                return room
        return None

    def _build_adjacency_graph(self, rooms: List[RoomSpec]) -> Dict[str, List[str]]:
        """Build bidirectional adjacency graph from room specs."""
        graph = {r.id: list(r.adjacent_to) for r in rooms}
        # Make bidirectional
        for room in rooms:
            for adj_id in room.adjacent_to:
                if adj_id not in graph:
                    graph[adj_id] = []
                if room.id not in graph[adj_id]:
                    graph[adj_id].append(room.id)
        return graph

    def _get_quadrant_bounds(self, quadrant: str) -> Tuple[float, float, float, float]:
        """
        Get (x_min, y_min, x_max, y_max) for a Vastu quadrant.

        Quadrants:
        - northeast: top-right
        - northwest: top-left
        - southeast: bottom-right
        - southwest: bottom-left
        - north: top-center
        - south: bottom-center
        - east: right-center
        - west: left-center
        - center: middle
        """
        w, d = self.plot_width, self.plot_depth
        third_w = w / 3
        third_d = d / 3

        quadrant_map = {
            'northeast': (2 * third_w, 2 * third_d, w, d),
            'north': (third_w, 2 * third_d, 2 * third_w, d),
            'northwest': (0, 2 * third_d, third_w, d),
            'east': (2 * third_w, third_d, w, 2 * third_d),
            'center': (third_w, third_d, 2 * third_w, 2 * third_d),
            'west': (0, third_d, third_w, 2 * third_d),
            'southeast': (2 * third_w, 0, w, third_d),
            'south': (third_w, 0, 2 * third_w, third_d),
            'southwest': (0, 0, third_w, third_d),
        }

        return quadrant_map.get(quadrant, (0, 0, w, d))

    def _get_entrance_side_quadrant(self) -> str:
        """Get the quadrant for entrance based on road side."""
        side_to_quadrant = {
            'south': 'south',
            'north': 'north',
            'east': 'east',
            'west': 'west'
        }
        return side_to_quadrant.get(self.road_side, 'south')

    def _place_room_in_quadrant(
        self,
        room: RoomSpec,
        quadrant: str,
        avoid_overlap: bool = True
    ) -> Tuple[float, float]:
        """Place a room within the specified Vastu quadrant."""
        x_min, y_min, x_max, y_max = self._get_quadrant_bounds(quadrant)

        # Start from the corner closest to the center of the quadrant
        # but ensure room fits within quadrant bounds
        x = max(x_min, min(x_max - room.width, x_min))
        y = max(y_min, min(y_max - room.depth, y_min))

        if avoid_overlap:
            # Adjust if overlapping with existing rooms
            x, y = self._find_non_overlapping_position(room, x, y, x_max, y_max)

        self.positions[room.id] = (x, y)
        self.placed_rooms[room.id] = room
        return (x, y)

    def _find_non_overlapping_position(
        self,
        room: RoomSpec,
        start_x: float,
        start_y: float,
        max_x: float,
        max_y: float
    ) -> Tuple[float, float]:
        """Find a position that doesn't overlap with existing rooms."""
        x, y = start_x, start_y

        for _ in range(20):  # Max iterations to avoid infinite loop
            overlap = False
            for placed_id, (px, py) in self.positions.items():
                if placed_id == room.id:
                    continue
                placed_room = self.placed_rooms.get(placed_id)
                if not placed_room:
                    continue

                # Check for overlap
                if (x < px + placed_room.width and
                    x + room.width > px and
                    y < py + placed_room.depth and
                    y + room.depth > py):
                    overlap = True
                    # Try placing next to the overlapping room
                    x = px + placed_room.width
                    if x + room.width > max_x:
                        x = start_x
                        y = py + placed_room.depth
                    break

            if not overlap:
                break

        return (x, y)

    def _place_courtyard_centric(
        self,
        rooms: List[RoomSpec],
        courtyard: RoomSpec,
        verandah: Optional[RoomSpec],
        living: Optional[RoomSpec],
        room_by_id: Dict[str, RoomSpec]
    ):
        """
        Place rooms around a central courtyard following Vastu principles.
        Rooms are placed in a compact, connected layout with shared walls.
        """
        # 1. Place courtyard in center
        center_x = (self.plot_width - courtyard.width) / 2
        center_y = (self.plot_depth - courtyard.depth) / 2
        self.positions[courtyard.id] = (center_x, center_y)
        self.placed_rooms[courtyard.id] = courtyard

        # 2. Place rooms around courtyard in a connected manner
        cx, cy = center_x, center_y
        cw, cd = courtyard.width, courtyard.depth

        # Get rooms by type for organized placement
        kitchen = self._find_room_by_type(rooms, 'kitchen')
        bedroom = self._find_room_by_type(rooms, 'bedroom') or self._find_room_by_type(rooms, 'double-bedroom')
        dining = self._find_room_by_type(rooms, 'dining')
        toilet = self._find_room_by_type(rooms, 'bathroom') or self._find_room_by_type(rooms, 'common-toilet') or self._find_room_by_type(rooms, 'toilet')
        staircase = self._find_room_by_type(rooms, 'staircase')

        # Place verandah at entrance side (west road means west entrance)
        if verandah:
            if self.road_side == 'west':
                # Verandah along west wall at ground level
                self.positions[verandah.id] = (0, 0)
            elif self.road_side == 'south':
                self.positions[verandah.id] = (0, 0)
            elif self.road_side == 'north':
                self.positions[verandah.id] = (0, self.plot_depth - verandah.depth)
            else:  # east
                self.positions[verandah.id] = (self.plot_width - verandah.width, 0)
            self.placed_rooms[verandah.id] = verandah

        # Place living adjacent to verandah
        if living and living.id not in self.positions:
            if verandah and verandah.id in self.positions:
                vx, vy = self.positions[verandah.id]
                if self.road_side == 'west':
                    # Living to the right of verandah (or below it if verandah is tall)
                    lx = vx + verandah.width
                    ly = vy
                elif self.road_side == 'south':
                    lx = vx + verandah.width
                    ly = vy
                else:
                    lx = vx
                    ly = vy + verandah.depth
                self.positions[living.id] = (lx, ly)
            else:
                self.positions[living.id] = (0, 0)
            self.placed_rooms[living.id] = living

        # Place dining adjacent to living
        if dining and dining.id not in self.positions:
            if living and living.id in self.positions:
                lx, ly = self.positions[living.id]
                # Dining to the right of living
                dx = lx + living.width
                dy = ly
                if dx + dining.width > self.plot_width:
                    # Place below instead
                    dx = lx
                    dy = ly + living.depth
                self.positions[dining.id] = (dx, dy)
            else:
                self._place_in_available_space(dining)
            self.placed_rooms[dining.id] = dining

        # Place kitchen in SE quadrant, adjacent to dining
        if kitchen and kitchen.id not in self.positions:
            if dining and dining.id in self.positions:
                dx, dy = self.positions[dining.id]
                # Kitchen to the right of dining or above it
                kx = dx + dining.width
                ky = dy
                if kx + kitchen.width > self.plot_width:
                    kx = dx
                    ky = dy + dining.depth
                self.positions[kitchen.id] = (kx, ky)
            else:
                # Place in SE quadrant
                self.positions[kitchen.id] = (self.plot_width - kitchen.width, 0)
            self.placed_rooms[kitchen.id] = kitchen

        # Place bedroom in SW/S quadrant
        if bedroom and bedroom.id not in self.positions:
            # Place above the living/dining row
            if living and living.id in self.positions:
                lx, ly = self.positions[living.id]
                bx = lx
                by = ly + living.depth
                self.positions[bedroom.id] = (bx, by)
            else:
                self.positions[bedroom.id] = (0, self.plot_depth - bedroom.depth)
            self.placed_rooms[bedroom.id] = bedroom

        # Place toilet adjacent to kitchen and bedroom
        if toilet and toilet.id not in self.positions:
            if kitchen and kitchen.id in self.positions:
                kx, ky = self.positions[kitchen.id]
                # Toilet above or next to kitchen
                tx = kx
                ty = ky + kitchen.depth
                if ty + toilet.depth > self.plot_depth:
                    tx = kx + kitchen.width
                    ty = ky
                self.positions[toilet.id] = (max(0, min(tx, self.plot_width - toilet.width)),
                                              max(0, min(ty, self.plot_depth - toilet.depth)))
            else:
                self._place_in_available_space(toilet)
            self.placed_rooms[toilet.id] = toilet

        # Place staircase near entrance or living
        if staircase and staircase.id not in self.positions:
            if living and living.id in self.positions:
                lx, ly = self.positions[living.id]
                # Staircase above living
                sx = lx + living.width
                sy = ly + living.depth
                if sx + staircase.width > self.plot_width:
                    sx = lx
                self.positions[staircase.id] = (max(0, min(sx, self.plot_width - staircase.width)),
                                                 max(0, min(sy, self.plot_depth - staircase.depth)))
            else:
                self._place_in_available_space(staircase)
            self.placed_rooms[staircase.id] = staircase

        # Place any remaining rooms
        for room in rooms:
            if room.id not in self.positions:
                self._place_in_available_space(room)

    def _place_standard_layout(
        self,
        rooms: List[RoomSpec],
        verandah: Optional[RoomSpec],
        living: Optional[RoomSpec]
    ):
        """
        Place rooms in a compact, connected layout following Vastu principles.
        Creates a row-based layout where rooms share walls.
        """
        # Get specific room types
        kitchen = self._find_room_by_type(rooms, 'kitchen')
        bedroom = self._find_room_by_type(rooms, 'bedroom') or self._find_room_by_type(rooms, 'double-bedroom')
        dining = self._find_room_by_type(rooms, 'dining')
        toilet = self._find_room_by_type(rooms, 'bathroom') or self._find_room_by_type(rooms, 'common-toilet') or self._find_room_by_type(rooms, 'toilet')
        staircase_room = self._find_room_by_type(rooms, 'staircase')

        # Track current position for row-based placement
        current_x = 0
        current_y = 0
        row_height = 0

        # ROW 1: Verandah + Living + Dining (front row, near entrance)
        if verandah:
            self.positions[verandah.id] = (current_x, current_y)
            self.placed_rooms[verandah.id] = verandah
            current_x += verandah.width
            row_height = max(row_height, verandah.depth)

        if living and living.id not in self.positions:
            self.positions[living.id] = (current_x, current_y)
            self.placed_rooms[living.id] = living
            current_x += living.width
            row_height = max(row_height, living.depth)

        if dining and dining.id not in self.positions:
            if current_x + dining.width <= self.plot_width:
                self.positions[dining.id] = (current_x, current_y)
                current_x += dining.width
            else:
                # Dining doesn't fit in row 1, will place in row 2
                pass
            self.placed_rooms[dining.id] = dining
            row_height = max(row_height, dining.depth)

        # Move to ROW 2
        current_x = 0
        current_y = row_height
        row_height = 0

        # ROW 2: Kitchen + Toilet + Staircase (or remaining rooms)
        # Check if dining was placed, if not place it first
        if dining and dining.id not in self.positions:
            self.positions[dining.id] = (current_x, current_y)
            self.placed_rooms[dining.id] = dining
            current_x += dining.width
            row_height = max(row_height, dining.depth)

        if kitchen and kitchen.id not in self.positions:
            self.positions[kitchen.id] = (current_x, current_y)
            self.placed_rooms[kitchen.id] = kitchen
            current_x += kitchen.width
            row_height = max(row_height, kitchen.depth)

        if toilet and toilet.id not in self.positions:
            if current_x + toilet.width <= self.plot_width:
                self.positions[toilet.id] = (current_x, current_y)
                current_x += toilet.width
            else:
                # Place toilet above kitchen
                if kitchen and kitchen.id in self.positions:
                    kx, ky = self.positions[kitchen.id]
                    self.positions[toilet.id] = (kx, ky + kitchen.depth)
            self.placed_rooms[toilet.id] = toilet
            row_height = max(row_height, toilet.depth)

        if staircase_room and staircase_room.id not in self.positions:
            if current_x + staircase_room.width <= self.plot_width:
                self.positions[staircase_room.id] = (current_x, current_y)
                current_x += staircase_room.width
            else:
                # Place at end of row 1 or above living
                if living and living.id in self.positions:
                    lx, ly = self.positions[living.id]
                    self.positions[staircase_room.id] = (lx + living.width - staircase_room.width, ly + living.depth)
            self.placed_rooms[staircase_room.id] = staircase_room
            row_height = max(row_height, staircase_room.depth)

        # Move to ROW 3
        current_x = 0
        current_y += row_height
        row_height = 0

        # ROW 3: Bedroom (private zone at back)
        if bedroom and bedroom.id not in self.positions:
            self.positions[bedroom.id] = (current_x, current_y)
            self.placed_rooms[bedroom.id] = bedroom
            current_x += bedroom.width
            row_height = max(row_height, bedroom.depth)

        # Place any remaining rooms that weren't handled above
        for room in rooms:
            if room.id not in self.positions:
                # Try to place adjacent to a related room
                placed = False
                for adj_id in room.adjacent_to:
                    if adj_id in self.positions:
                        new_pos = self._find_adjacent_position_for(room, adj_id)
                        if new_pos:
                            self.positions[room.id] = new_pos
                            self.placed_rooms[room.id] = room
                            placed = True
                            break

                if not placed:
                    self._place_in_available_space(room)

    def _find_adjacent_position_for(
        self,
        room: RoomSpec,
        adjacent_to_id: str
    ) -> Optional[Tuple[float, float]]:
        """Find a position for room adjacent to the specified room."""
        if adjacent_to_id not in self.positions:
            return None

        adj_room = self.placed_rooms.get(adjacent_to_id)
        if not adj_room:
            return None

        ax, ay = self.positions[adjacent_to_id]

        # Try each side of the adjacent room
        candidates = [
            (ax + adj_room.width, ay),  # East
            (ax - room.width, ay),  # West
            (ax, ay + adj_room.depth),  # North
            (ax, ay - room.depth),  # South
        ]

        for cx, cy in candidates:
            if (cx >= 0 and cy >= 0 and
                cx + room.width <= self.plot_width and
                cy + room.depth <= self.plot_depth):

                # Check for overlaps
                overlaps = False
                for placed_id, (px, py) in self.positions.items():
                    if placed_id == adjacent_to_id:
                        continue
                    placed = self.placed_rooms.get(placed_id)
                    if placed:
                        if (cx < px + placed.width and
                            cx + room.width > px and
                            cy < py + placed.depth and
                            cy + room.depth > py):
                            overlaps = True
                            break

                if not overlaps:
                    return (cx, cy)

        return None

    def _place_in_available_space(self, room: RoomSpec):
        """Place room in the first available space that fits."""
        # Try row-by-row placement
        y = 0
        while y + room.depth <= self.plot_depth:
            x = 0
            while x + room.width <= self.plot_width:
                # Check if this position overlaps with any placed room
                overlaps = False
                for placed_id, (px, py) in self.positions.items():
                    placed = self.placed_rooms.get(placed_id)
                    if placed:
                        if (x < px + placed.width and
                            x + room.width > px and
                            y < py + placed.depth and
                            y + room.depth > py):
                            overlaps = True
                            x = px + placed.width
                            break

                if not overlaps:
                    self.positions[room.id] = (x, y)
                    self.placed_rooms[room.id] = room
                    return

                x += 1

            y += max(1, room.depth / 2)

        # Last resort: place at origin with warning
        self.positions[room.id] = (0, 0)
        self.placed_rooms[room.id] = room

    def _enforce_adjacencies(
        self,
        rooms: List[RoomSpec],
        adjacency_graph: Dict[str, List[str]],
        room_by_id: Dict[str, RoomSpec]
    ):
        """
        Adjust room positions to ensure adjacent rooms share walls.
        """
        # Sort by number of adjacency constraints (most constrained first)
        room_ids = sorted(
            [r.id for r in rooms],
            key=lambda rid: len(adjacency_graph.get(rid, [])),
            reverse=True
        )

        for room_id in room_ids:
            if room_id not in self.positions:
                continue

            room = room_by_id.get(room_id)
            if not room:
                continue

            x, y = self.positions[room_id]
            adjacent_ids = adjacency_graph.get(room_id, [])

            for adj_id in adjacent_ids:
                if adj_id not in self.positions:
                    continue

                adj_room = room_by_id.get(adj_id)
                if not adj_room:
                    continue

                ax, ay = self.positions[adj_id]

                # Check if rooms share a wall (touching)
                shares_wall = self._rooms_share_wall(
                    x, y, room.width, room.depth,
                    ax, ay, adj_room.width, adj_room.depth
                )

                if not shares_wall:
                    # Try to move adjacent room to share a wall
                    new_pos = self._find_adjacent_position(room, adj_room)
                    if new_pos:
                        self.positions[adj_id] = new_pos

    def _rooms_share_wall(
        self,
        x1: float, y1: float, w1: float, d1: float,
        x2: float, y2: float, w2: float, d2: float,
        tolerance: float = 0.5
    ) -> bool:
        """Check if two rooms share a wall (are adjacent with no gap)."""
        # Check horizontal adjacency (side by side)
        if abs((x1 + w1) - x2) <= tolerance or abs((x2 + w2) - x1) <= tolerance:
            # Verify vertical overlap
            if y1 < y2 + d2 and y1 + d1 > y2:
                return True

        # Check vertical adjacency (top/bottom)
        if abs((y1 + d1) - y2) <= tolerance or abs((y2 + d2) - y1) <= tolerance:
            # Verify horizontal overlap
            if x1 < x2 + w2 and x1 + w1 > x2:
                return True

        return False

    def _find_adjacent_position(
        self,
        anchor_room: RoomSpec,
        room_to_move: RoomSpec
    ) -> Optional[Tuple[float, float]]:
        """Find a position for room_to_move that's adjacent to anchor_room."""
        ax, ay = self.positions[anchor_room.id]

        # Try each side of the anchor room
        candidates = [
            (ax + anchor_room.width, ay),  # East
            (ax - room_to_move.width, ay),  # West
            (ax, ay + anchor_room.depth),  # North
            (ax, ay - room_to_move.depth),  # South
        ]

        for cx, cy in candidates:
            # Verify within plot bounds
            if (cx >= 0 and cy >= 0 and
                cx + room_to_move.width <= self.plot_width and
                cy + room_to_move.depth <= self.plot_depth):

                # Check for overlaps with other rooms
                overlaps = False
                for placed_id, (px, py) in self.positions.items():
                    if placed_id in [anchor_room.id, room_to_move.id]:
                        continue
                    placed = self.placed_rooms.get(placed_id)
                    if placed:
                        if (cx < px + placed.width and
                            cx + room_to_move.width > px and
                            cy < py + placed.depth and
                            cy + room_to_move.depth > py):
                            overlaps = True
                            break

                if not overlaps:
                    return (cx, cy)

        return None

    def _validate_and_adjust(self, rooms: List[RoomSpec]):
        """Final validation to ensure no overlaps and all rooms within plot."""
        # Ensure all rooms are within plot bounds
        for room in rooms:
            if room.id not in self.positions:
                continue

            x, y = self.positions[room.id]

            # Clamp to plot bounds
            x = max(0, min(x, self.plot_width - room.width))
            y = max(0, min(y, self.plot_depth - room.depth))

            self.positions[room.id] = (x, y)

    def find_staircase_position(
        self,
        rooms: List[RoomSpec],
        positions: Dict[str, Tuple[float, float]]
    ) -> Tuple[float, float]:
        """
        Find optimal staircase position based on Vastu (SW preferred).
        """
        # Preferred: SW corner, near living room
        sw_x, sw_y, _, _ = self._get_quadrant_bounds('southwest')

        # Find living room for adjacency
        living_room = None
        for room in rooms:
            if room.type in ["living", "living-room"] or room.zone == "public":
                living_room = room
                break

        if living_room and living_room.id in positions:
            lx, ly = positions[living_room.id]
            # Place staircase adjacent to living room (prefer SW direction)
            return (max(0, lx - 4), ly)  # 4 feet for typical staircase width

        # Default: SW corner
        return (sw_x, sw_y)


# ============================================
# API Endpoints
# ============================================

@app.get("/", response_model=HealthResponse)
def read_root():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        service="Maiyuri Bricks CAD Engine",
        version="2.0.0"
    )


@app.get("/health", response_model=HealthResponse)
def health_check():
    """Detailed health check"""
    return HealthResponse(
        status="healthy",
        service="Maiyuri Bricks CAD Engine",
        version="2.0.0"
    )


class LegacySpecs(BaseModel):
    """Legacy input model for backward compatibility"""
    description: str


@app.post("/api/generate")
async def generate_blueprint(specs: LegacySpecs):
    """
    Legacy endpoint for simple blueprint generation.

    Maintains backward compatibility with the original API.
    """
    try:
        from ai_engine import GeminiClient

        # Mock rooms for legacy endpoint
        gen = CadGenerator()
        gen.add_room("Main Hall", 10, 8, (0, 0))
        gen.add_room("Kitchen", 5, 4, (10, 0))

        # Generate wireframe
        dxf_path = gen.generate_dxf()
        png_data = gen.generate_wireframe_image()

        # Save temp wireframe for AI
        temp_wireframe_path = os.path.join(OUTPUT_DIR, "temp_structure.png")
        with open(temp_wireframe_path, "wb") as f:
            f.write(png_data)

        # AI rendering
        ai_rendered_data = None
        try:
            client = GeminiClient()
            render_bytes = client.generate_blueprint_render(
                specs.description or "Professional blueprint style with blue background and white lines",
                temp_wireframe_path
            )
            if render_bytes:
                ai_rendered_data = base64.b64encode(render_bytes).decode('utf-8')
        except Exception as ai_err:
            print(f"AI rendering failed (falling back to wireframe): {ai_err}")

        final_image = ai_rendered_data if ai_rendered_data else base64.b64encode(png_data).decode('utf-8')

        return {
            "status": "success",
            "message": "Blueprint generated" + (" with AI rendering" if ai_rendered_data else " (wireframe only)"),
            "dxf_path": dxf_path,
            "image_data": f"data:image/png;base64,{final_image}",
            "ai_enhanced": ai_rendered_data is not None
        }

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/render-engineering-plan", response_model=RenderResult)
async def render_engineering_plan(plan: EngineeringPlanRenderInput):
    """
    Render engineering plan to professional blueprint.

    This is the main Backend Bridge endpoint that:
    1. Receives engineering plan JSON from TypeScript pipeline
    2. Generates precise CAD wireframe using ezdxf
    3. Optionally enhances with AI rendering via Gemini
    4. Returns DXF + PNG outputs

    Input matches EngineeringPlanOutput from the TypeScript planning pipeline.
    """
    try:
        # Generate unique ID for this render
        render_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = f"engineering_plan_{timestamp}_{render_id}"

        # Calculate plot dimensions if not provided
        if plan.plot_dimensions:
            plot_width = plan.plot_dimensions.width
            plot_depth = plan.plot_dimensions.depth
        else:
            # Estimate from rooms
            total_area = sum(r.area_sqft for r in plan.rooms)
            plot_width = max(30, total_area ** 0.5 * 1.5)
            plot_depth = max(40, total_area ** 0.5 * 1.5)

        # Initialize CAD generator
        cad = EngineeringCadGenerator(unit='feet')

        # Set wall system
        wall_system = WallSystem(
            external_thickness_inches=plan.wall_system.external_thickness_inches,
            internal_thickness_inches=plan.wall_system.internal_thickness_inches,
            material=plan.wall_system.material,
            load_bearing_walls=plan.wall_system.load_bearing_walls
        )
        cad.set_wall_system(wall_system)

        # Calculate room positions (with Vastu zones and road side)
        layout_calc = RoomLayoutCalculator(
            plot_width,
            plot_depth,
            vastu_zones=plan.vastu_zones,
            road_side=plan.road_side or 'south'
        )
        positions = layout_calc.calculate_positions(plan.rooms)

        # Draw rooms with walls
        total_area = 0
        for room_spec in plan.rooms:
            room = Room(
                id=room_spec.id,
                name=room_spec.name,
                type=room_spec.type,
                width=room_spec.width,
                depth=room_spec.depth,
                area_sqft=room_spec.area_sqft,
                zone=room_spec.zone,
                adjacent_to=room_spec.adjacent_to
            )

            origin = positions.get(room_spec.id, (0, 0))

            # Determine if external (edge of plot)
            is_external = (
                origin[0] == 0 or
                origin[1] == 0 or
                origin[0] + room_spec.width >= plot_width - 1 or
                origin[1] + room_spec.depth >= plot_depth - 1
            )

            # Add room with walls (doors and windows added separately below)
            cad.add_room_with_walls(
                room,
                origin,
                is_external=is_external
            )

            total_area += room_spec.area_sqft

        # Add doors and windows based on room type and adjacency
        for room_spec in plan.rooms:
            if room_spec.id not in positions:
                continue

            origin = positions[room_spec.id]

            # Determine which walls are external (at plot boundary)
            is_south_external = origin[1] <= 0.5
            is_north_external = origin[1] + room_spec.depth >= plot_depth - 0.5
            is_west_external = origin[0] <= 0.5
            is_east_external = origin[0] + room_spec.width >= plot_width - 0.5

            # Add entry door for living room on south (front) wall
            if room_spec.type in ['living', 'living-room'] and is_south_external:
                cad.add_door(room_spec.id, 'south', position=0.5, door_width=3.5)

            # Add doors for bedrooms (typically north or internal walls)
            if room_spec.type in ['bedroom', 'master-bedroom']:
                # Add door on internal wall (opposite to external window wall)
                if is_north_external:
                    cad.add_door(room_spec.id, 'south', position=0.5, door_width=3.0)
                elif is_south_external:
                    cad.add_door(room_spec.id, 'north', position=0.5, door_width=3.0)
                else:
                    cad.add_door(room_spec.id, 'south', position=0.5, door_width=3.0)

            # Add door for kitchen
            if room_spec.type == 'kitchen':
                cad.add_door(room_spec.id, 'west', position=0.5, door_width=3.0)

            # Add door for bathrooms
            if room_spec.type in ['bathroom', 'attached-bathroom', 'common-bathroom', 'attached-bath']:
                cad.add_door(room_spec.id, 'south', position=0.5, door_width=2.5)

            # Add windows on external walls for habitable rooms
            if room_spec.type in ['living', 'living-room', 'bedroom', 'master-bedroom', 'dining']:
                # Add windows on external walls
                if is_south_external and room_spec.type not in ['living', 'living-room']:
                    cad.add_window(room_spec.id, 'south', position=0.5, window_width=4.0)
                if is_north_external:
                    cad.add_window(room_spec.id, 'north', position=0.5, window_width=4.0)
                if is_east_external:
                    cad.add_window(room_spec.id, 'east', position=0.5, window_width=4.0)
                if is_west_external:
                    cad.add_window(room_spec.id, 'west', position=0.5, window_width=4.0)

            # Add smaller windows for kitchen and service areas
            if room_spec.type in ['kitchen', 'utility']:
                if is_east_external:
                    cad.add_window(room_spec.id, 'east', position=0.5, window_width=3.0)
                elif is_west_external:
                    cad.add_window(room_spec.id, 'west', position=0.5, window_width=3.0)
                elif is_north_external:
                    cad.add_window(room_spec.id, 'north', position=0.5, window_width=3.0)

            # Add ventilation windows for bathrooms (smaller, higher windows)
            if room_spec.type in ['bathroom', 'attached-bathroom', 'common-bathroom', 'attached-bath']:
                if is_north_external:
                    cad.add_window(room_spec.id, 'north', position=0.5, window_width=2.0)
                elif is_east_external:
                    cad.add_window(room_spec.id, 'east', position=0.5, window_width=2.0)
                elif is_west_external:
                    cad.add_window(room_spec.id, 'west', position=0.5, window_width=2.0)

        # Add furniture and fixtures to each room
        for room_spec in plan.rooms:
            cad.add_room_furniture(room_spec.id, room_spec.type)

        # Add staircase if multi-floor
        if plan.staircase and plan.staircase.width_feet > 0:
            staircase = Staircase(
                type=plan.staircase.type.value,
                position=plan.staircase.position,
                width_feet=plan.staircase.width_feet,
                riser_height_inches=plan.staircase.riser_height_inches,
                tread_width_inches=plan.staircase.tread_width_inches
            )

            # Calculate staircase position
            if plan.staircase_position:
                stair_origin = plan.staircase_position
            else:
                stair_origin = layout_calc.find_staircase_position(plan.rooms, positions)

            cad.add_staircase(staircase, stair_origin)

        # Add plumbing shafts
        if plan.plumbing_strategy and plan.plumbing_strategy.shaft_positions:
            # Place shafts near wet areas
            shaft_idx = 0
            for shaft_desc in plan.plumbing_strategy.shaft_positions:
                # Find a wet area to place near
                wet_room = next(
                    (r for r in plan.rooms if r.type in ['kitchen', 'attached-bathroom', 'common-bathroom']),
                    None
                )
                if wet_room and wet_room.id in positions:
                    rx, ry = positions[wet_room.id]
                    cad.add_plumbing_shaft(
                        (rx + wet_room.width + 0.5, ry + wet_room.depth / 2),
                        label=f"P{shaft_idx + 1}"
                    )
                    shaft_idx += 1

        # Add ventilation shafts
        for idx, vent_shaft in enumerate(plan.ventilation_shafts):
            if vent_shaft.serves_rooms:
                # Place near first served room
                served_room_id = vent_shaft.serves_rooms[0]
                served_room = next((r for r in plan.rooms if r.id == served_room_id), None)
                if served_room and served_room.id in positions:
                    rx, ry = positions[served_room.id]
                    cad.add_ventilation_shaft(
                        (rx + served_room.width / 2, ry + served_room.depth + 0.5),
                        label=f"V{idx + 1}"
                    )

        # Add north arrow
        north_rotation = {
            "north": 0,
            "south": 180,
            "east": 90,
            "west": 270
        }.get(plan.orientation.value if plan.orientation else "north", 0)

        cad.add_north_arrow(
            (plot_width + 3, plot_depth - 2),
            size=1.5,
            rotation=north_rotation
        )

        # Add overall dimensions
        cad.add_overall_dimensions(plot_width, plot_depth)

        # Add title block (positioned at bottom-right of drawing)
        total_built_area = sum(r.area_sqft for r in plan.rooms)
        orientation_str = plan.orientation.value if plan.orientation else "north"
        cad.add_title_block(
            position=(plot_width + 2, -6),  # Bottom-right, below the plot
            plot_width=plot_width,
            plot_depth=plot_depth,
            total_area=total_built_area,
            orientation=orientation_str,
            scale="1:100",
            project_name="ECO-VASTU FLOOR PLAN",
            drawing_no=f"FP-{base_filename[-8:]}"
        )

        # Generate DXF file
        dxf_path = os.path.join(OUTPUT_DIR, f"{base_filename}.dxf")
        cad.generate_dxf(dxf_path)

        # Generate wireframe image
        background = 'black' if plan.background == 'blueprint' else plan.background
        wireframe_bytes = cad.generate_wireframe_image(
            dpi=300,
            background=background
        )
        wireframe_base64 = base64.b64encode(wireframe_bytes).decode('utf-8')

        # Save wireframe for AI
        wireframe_path = os.path.join(OUTPUT_DIR, f"{base_filename}_wireframe.png")
        with open(wireframe_path, "wb") as f:
            f.write(wireframe_bytes)

        # AI rendering (if enabled)
        ai_rendered_base64 = None
        ai_enhanced = False

        if plan.ai_render:
            try:
                from ai_engine import GeminiClient

                client = GeminiClient()

                # Build context-aware prompt
                style_prompt = _build_ai_prompt(plan)

                render_bytes = client.generate_blueprint_render(
                    style_prompt,
                    wireframe_path
                )

                if render_bytes:
                    ai_rendered_base64 = base64.b64encode(render_bytes).decode('utf-8')
                    ai_enhanced = True

                    # Save AI rendered image
                    ai_path = os.path.join(OUTPUT_DIR, f"{base_filename}_ai_rendered.png")
                    with open(ai_path, "wb") as f:
                        f.write(render_bytes)

            except Exception as ai_err:
                print(f"AI rendering failed: {ai_err}")
                # Continue with wireframe only

        return RenderResult(
            success=True,
            message=f"Engineering plan rendered successfully" + (" with AI enhancement" if ai_enhanced else " (wireframe only)"),
            dxf_path=dxf_path,
            wireframe_base64=wireframe_base64,
            ai_rendered_base64=ai_rendered_base64,
            ai_enhanced=ai_enhanced,
            rooms_count=len(plan.rooms),
            total_area_sqft=total_area
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Engineering plan rendering failed: {str(e)}"
        )


def _build_ai_prompt(plan: EngineeringPlanRenderInput) -> str:
    """
    Build context-aware prompt for AI rendering based on engineering specs.
    """
    # Base style
    style_parts = [
        "Transform this architectural wireframe into a professional engineering blueprint."
    ]

    # Wall material context
    if plan.wall_system.material:
        style_parts.append(f"Construction: {plan.wall_system.material}.")

    # Structural context
    if plan.wall_system.load_bearing_walls:
        style_parts.append(f"Load-bearing walls shown in bold lines.")

    # Style preference
    if plan.style == "blueprint":
        style_parts.append("Style: Classic blue blueprint with white/cyan lines on dark blue background.")
    elif plan.style == "professional":
        style_parts.append("Style: Clean professional CAD drawing with black lines on white background.")
    else:
        style_parts.append("Style: Architectural sketch with hand-drawn feel.")

    # Requirements
    style_parts.extend([
        "Requirements:",
        "1. Maintain exact room proportions and positions",
        "2. Show wall thickness accurately",
        "3. Include room labels and area annotations",
        "4. Add proper architectural symbols for doors, stairs, and shafts",
        "5. Include dimension lines in feet-inches format (e.g., 10'-6\")",
        "6. Add north arrow and scale reference"
    ])

    return " ".join(style_parts)


# ============================================
# Additional Utility Endpoints
# ============================================

@app.get("/api/output/{filename}")
async def get_output_file(filename: str):
    """Serve generated output files"""
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Return file info (actual file serving would need StaticFiles or FileResponse)
    return {
        "filename": filename,
        "path": file_path,
        "exists": True
    }


@app.get("/api/outputs")
async def list_outputs():
    """List all generated output files"""
    files = []
    for f in os.listdir(OUTPUT_DIR):
        file_path = os.path.join(OUTPUT_DIR, f)
        files.append({
            "filename": f,
            "size_bytes": os.path.getsize(file_path),
            "modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
        })
    return {"files": sorted(files, key=lambda x: x["modified"], reverse=True)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
