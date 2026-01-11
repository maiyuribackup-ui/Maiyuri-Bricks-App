/**
 * Indian House Engineering Rules
 *
 * Comprehensive rules for residential floor plan design in India,
 * specifically for Tamil Nadu. Covers:
 * - National Building Code (NBC) requirements
 * - Tamil Nadu Combined Development and Building Rules (TNCDBR) 2019
 * - Vastu Shastra principles
 * - Traditional architecture (mutram, thinnai)
 * - Practical engineering guidelines
 *
 * These rules are fed to planning agents for generating correct
 * engineering plans and diagrams.
 *
 * @see Research conducted: January 2026
 */

/**
 * Rule Priority Hierarchy
 *
 * When rules conflict, follow this priority order:
 * 1. SAFETY & CODE COMPLIANCE (Mandatory - Cannot be overridden)
 * 2. FUNCTIONAL REQUIREMENTS (Highly Recommended)
 * 3. VASTU COMPLIANCE (Optional - User Preference)
 * 4. TRADITIONAL DESIGN (Cultural/Aesthetic)
 */
export const RULE_PRIORITY = {
  SAFETY: 1,      // NBC, structural, fire safety
  FUNCTIONAL: 2,  // Room adjacency, circulation
  VASTU: 3,       // Directional placement
  TRADITIONAL: 4, // Cultural elements
} as const;

/**
 * National Building Code (NBC) Requirements
 *
 * These are MANDATORY and must not be violated.
 */
export const NBC_REQUIREMENTS = `## NATIONAL BUILDING CODE (NBC) REQUIREMENTS - MANDATORY

### 1. MINIMUM ROOM DIMENSIONS

**Habitable Rooms (Living, Bedroom, Study):**
- Minimum: 2000mm × 2000mm (6.5' × 6.5')
- Single room dwelling minimum: 9.5 sq.m (102 sq.ft)
- Standard living room: 12'×18' to 15'×20' (200 sq.ft typical)

**Bedrooms:**
- Small/Children's: 10'×10' (3m × 3m) minimum
- Standard: 10'×12' to 12'×12'
- Master bedroom: 12'×15' to 15'×15'
- With queen bed (5'×6.5'): minimum 12'×12'
- With king bed (6'×6.5'): minimum 13'×15' recommended

**Kitchen:**
- Minimum window opening: 1 sq.m for ventilation
- Work triangle (sink-stove-fridge): 12-26 feet total

**Bathrooms:**
- WC + Bathroom combined: 30 sq.ft (2.8 sq.m)
- WC separate: 12 sq.ft (1.1 sq.m)
- Bathroom only: 18 sq.ft (1.7 sq.m)
- Minimum: 1.5 sq.m (16 sq.ft)
- Typical: 5'×7' to 6'×8'

### 2. CEILING HEIGHT

- Habitable rooms: MINIMUM 2.75m (9 feet) - MANDATORY
- Lofts: 2.4m minimum with proper ventilation
- No local variation below 2.75m for main floors

### 3. VENTILATION REQUIREMENTS

**Opening Area:**
- Habitable rooms: MINIMUM 10% of floor area
- Must open to exterior or open space (min 2.4m width)
- Kitchen: MINIMUM 1 sq.m window opening
- Bathroom: MINIMUM 0.37 sq.m window/opening

**Cross Ventilation:**
- Window-to-wall ratio (WWR): 20% optimal
- Openings on opposite or adjacent walls required
- Every habitable room MUST have cross-ventilation path

### 4. STAIRCASE REQUIREMENTS

**Dimensions (Residential):**
- Tread depth: MINIMUM 250mm (10 inches)
- Riser height: MAXIMUM 190mm (7.5 inches)
- Width: MINIMUM 900mm (3 feet), 1000mm recommended
- Maximum risers per flight: 15 steps
- Design formula: 2R + T = 600-630mm (R=riser, T=tread)

**Handrail:**
- Height: 1000-1200mm from tread center
- Baluster gap: MAXIMUM 100mm (4 inches)
- Required on both sides

**Fire Escape (if applicable):**
- Maximum angle: 45° to horizontal
- Minimum width: 750mm
- Non-slip surfaces mandatory

### 5. DOOR DIMENSIONS

**Bedroom Doors:**
- Width: 800-900mm clear
- Height: 2100mm (7 feet)

**Bathroom Doors:**
- Width: 700-760mm (800mm for accessibility)
- Height: 2100mm

**Main Entrance:**
- Width: 900-1000mm minimum
- Height: 2100-2400mm

### 6. CORRIDOR/PASSAGE WIDTH

- Primary corridors: 1000-1200mm optimal
- Kitchen/bath access: 750mm minimum
- Dwelling unit internal: 900mm minimum

### 7. DOOR SPECIFICATIONS (CPWD STANDARDS)

**Main Entrance Door:**
- Standard: 7'0" × 3'0" (2134 × 915mm) - Single
- Premium: 7'0" × 3'6" (2134 × 1067mm) - Single
- Double Door: 7'0" × 5'6" (2134 × 1676mm)
- Thickness: 40-45mm (solid wood), 30-35mm (flush)
- CPWD Code: 9DS20 or 10DS21

**Internal Room Doors:**
- Bedroom: 7'0" × 3'0" (2134 × 915mm) - CPWD: 9DS20
- Kitchen: 7'0" × 2'9" (2134 × 838mm) - CPWD: 8DS20
- Minimum Width: 800mm (2'8") for furniture passage

**Bathroom/Toilet Doors:**
- Standard: 7'0" × 2'6" (2134 × 762mm) - CPWD: 7.5DS20
- Compact: 6'6" × 2'3" (1950 × 685mm) - CPWD: 7DS20
- Opening: Outward (safety) or sliding

**Door Frame Standards:**
- Frame size: 100×75mm (4"×3") - traditional
- Threshold: Stone or hardwood, 50-75mm above floor

### 8. WINDOW SPECIFICATIONS (CPWD STANDARDS)

**Bedroom Windows:**
- Standard: 4'0" × 4'0" (1219 × 1219mm) - CPWD: 12W12
- Large/Master: 5'0" × 4'0" (1524 × 1219mm) - CPWD: 15W12
- Sill height: 2'0" to 2'6" (610-762mm) above floor
- Emergency egress: Minimum 20" × 24" opening (NBC)

**Living Room Windows:**
- Standard: 5'0" × 4'0" (1524 × 1219mm) - CPWD: 15W12
- Large: 6'0" × 4'0" (1829 × 1219mm)
- Bay/Feature: 8'0" × 5'0" (2438 × 1524mm)
- Sill height: 2'0" to 2'6" (610-762mm)

**Kitchen Windows:**
- Standard: 4'0" × 3'0" (1219 × 915mm) - CPWD: 12W9
- Above counter sill: 3'6" to 4'0" (1067-1219mm)
- Minimum opening: 1 sq.m (NBC requirement)

**Bathroom/Toilet Windows:**
- Standard: 2'0" × 1'6" (610 × 457mm) - CPWD: 6W5
- Privacy sill height: 5'0" (1524mm)
- Minimum: 0.37 sq.m (NBC requirement)

**Ventilators:**
- Standard: 2'0" × 1'6" (600 × 450mm) - CPWD: 6V5
- Kitchen: 2'0" × 2'0" (600 × 600mm) - CPWD: 6V6
- Placement: High on wall (6'6" to 7'0" from floor)

### VASTU FOR DOORS & WINDOWS

**Door Placement (Priority):**
1. BEST: Northeast, East, North
2. GOOD: West
3. AVOID: South, Southwest (main door)

**Window Placement by Direction:**
- North, East: Large windows (5'×4' or bigger)
- Northwest, Southeast: Medium windows (4'×4')
- South, West: Smaller windows (3'×3')
- Southwest: Minimal or no windows

**General Rules:**
- Main door should be LARGEST in house
- Even number of doors (avoid 10 or multiples of 8)
- Doors open INWARD in clockwise direction
- Windows opposite to doors for energy flow
`;

/**
 * Tamil Nadu Specific Regulations
 *
 * TNCDBR 2019 and CMDA requirements
 */
export const TAMIL_NADU_REGULATIONS = `## TAMIL NADU BUILDING REGULATIONS (TNCDBR 2019)

### 1. SETBACK REQUIREMENTS

**Non-High-Rise Buildings (up to 18.3m / 60 feet):**
- Minimum setback: 1.2-1.35m on all sides
- Front setback varies by road width (typically 3-5 feet)
- Side setbacks: Minimum 3 feet each
- Rear setback: 3-5 feet minimum

**High-Rise (above 18.3m):**
- Starting setback: 6.7m
- +1m for every additional 6m height above 30m

### 2. FLOOR SPACE INDEX (FSI) / FAR

**Residential:**
- Standard: 1.5 to 2.0
- Maximum permissible: 2.5 (standard), 3.25 (premium)
- Premium FSI: Up to 3.62 (with charges)
- Non-high-rise (≤75 sq.m units): Maximum 2.0

**Calculation:**
FSI = Total Built-up Area / Plot Area
MUST NOT exceed permissible FSI for zone

### 3. PLOT COVERAGE

- Maximum ground coverage varies by zone
- Typically 50-60% for residential
- Open space: Minimum 40-50% of plot area
- For plots under 1500 sq.ft: Minimum 50% open space

### 4. HEIGHT RESTRICTIONS

- Generally 15m or 4 floors for residential
- Varies by zone and road width
- Higher limits on wider roads (12m+ road width)
`;

/**
 * Vastu Shastra Principles
 *
 * These are ADVISORY and can be relaxed if they conflict
 * with safety, regulations, or eco-design.
 */
export const VASTU_PRINCIPLES = `## VASTU SHASTRA PRINCIPLES (ADVISORY)

**IMPORTANT:** Vastu is a GUIDE, not a mandate. It must NEVER:
- Violate building setbacks or NBC requirements
- Compromise structural integrity
- Override mandatory eco-design (courtyard, ventilation)

### 1. ROOM PLACEMENT BY DIRECTION

**Kitchen:**
- IDEAL: Southeast (SE) corner (Agni Kona - Fire element)
- ALTERNATIVE: Northwest (NW) if SE not possible
- PROHIBITED: North, Northeast, East
- Stove facing: East direction
- Cook should face East while cooking

**Master Bedroom:**
- IDEAL: Southwest (SW) corner
- ALTERNATIVE: South, Northwest
- Bed head direction: East or South (NEVER North)
- Heavy furniture placement: South or West walls

**Living Room:**
- IDEAL: North or East direction
- Furniture placement: West or South walls
- Open and well-lit preferred

**Pooja Room (if required):**
- IDEAL: Northeast (NE) corner (Ishan Kona) - MOST auspicious
- ALTERNATIVE: East or North
- PROHIBITED: Southeast, South, Southwest
- Idol placement: Face West or East
- Elevation: Use raised platform, gap from wall

**Dining Room:**
- IDEAL: East, West, or South
- ADJACENT TO: Kitchen (direct access)
- Face East while eating preferred

**Bathroom/Toilet:**
- IDEAL: South-Southwest, Northwest
- PROHIBITED: Northeast, adjacent to kitchen, above/below pooja
- Drainage: North or West direction

**Staircase:**
- IDEAL: South, West, Southwest, Northwest
- PROHIBITED: Northeast (blocks positive energy), Center
- Climbing direction: CLOCKWISE (must turn right ascending)

**Guest Room:**
- IDEAL: Northwest
- ALTERNATIVE: West, North

**Children's Bedroom:**
- IDEAL: West, Northwest
- ALTERNATIVE: North

**Study/Office:**
- IDEAL: North, Northeast, East
- Face East or North while working

### 2. MAIN ENTRANCE (PADA SYSTEM)

**By Plot Orientation:**

| Plot Facing | Best Entrance Position | Notes |
|-------------|----------------------|-------|
| North | 5th pada (center-north), 3rd, 4th, 8th | Associated with wealth |
| East | Center of East wall, NE corner | Leave 6" from NE corner |
| South | Southeast, South-Southeast | Acceptable if road on South |
| West | West center, Northwest | |

**Universal Rules:**
- BEST: Northeast (most energetic), East, North
- WORST: Southwest - AVOID under ALL circumstances
- Door must open INWARD in CLOCKWISE direction
- Door should NOT face elevator, staircase, or mirror directly

### 3. BRAHMASTHAN (CENTER SPACE)

**Definition:** Central zone (exact geometrical center) of the house

**STRICTLY PROHIBITED in center:**
- Toilet/Bathroom
- Kitchen
- Staircase
- Pillars/Columns
- Heavy furniture
- Beams directly overhead

**RECOMMENDED:**
- Open courtyard (mutram)
- Light well / skylight
- Main circulation area
- Living room (if small plot)

### 4. STAIRCASE VASTU

**Location:**
- IDEAL: South, West, Southwest, Northwest
- PROHIBITED: Northeast, Center

**Design:**
- MUST turn CLOCKWISE when ascending
- Movement: North to South OR East to West
- Steps count: ALWAYS ODD number (9, 11, 15, 21)
- Avoid even numbers or multiples of 10

### 5. ROOM DIMENSION RATIOS (Vastu)

- Optimal ratios (width:length): 1:1, 1:1.25, 1:1.5, 1:2
- Shapes: Rectangle or square preferred
- Irregular shapes (triangular, L-shaped): Not recommended
`;

/**
 * Room Adjacency Rules
 *
 * Functional relationships between rooms
 */
export const ROOM_ADJACENCY_RULES = `## ROOM ADJACENCY RULES (FUNCTIONAL)

### 1. KITCHEN ADJACENCIES

**MUST be adjacent to:**
- Dining room (integrated or direct access)
- Service entry (if applicable)

**SHOULD be near:**
- Pantry/store
- Utility area
- Servant's room (if applicable)

**MUST NOT:**
- Be directly visible from main entrance
- Share wall with toilet/bathroom

### 2. BEDROOM ADJACENCIES

**Master Bedroom:**
- MUST have attached bathroom (ensuite)
- SHOULD NOT be directly visible from main entrance
- SHOULD have wardrobe/dressing space

**Children's/Guest Bedroom:**
- Buffer zone from main entrance
- Access via corridor preferred (privacy)
- Can share common bathroom

### 3. BATHROOM PLACEMENT

**Ensuite Bathroom:**
- Direct access from bedroom only
- Ventilation to exterior required

**Common Bathroom:**
- Accessible from public zone without entering private areas
- Near bedrooms via corridor
- NOT directly visible from living/dining

**Guest Toilet:**
- Near entrance/living area
- Accessible without entering private zones

### 4. SERVICE CLUSTERING

**Plumbing-intensive areas should cluster:**
- Kitchen + Utility + Bathroom on same plumbing stack
- Reduces cost and complexity
- Vertical alignment in multi-story

### 5. PUBLIC-PRIVATE ZONING

**Public Zone (near entrance):**
- Living room
- Dining (or semi-public)
- Guest toilet
- Verandah/Thinnai

**Semi-Private Zone:**
- Dining (can also be public)
- Kitchen (service access)
- Study

**Private Zone (away from entrance):**
- Master bedroom
- Children's bedrooms
- Attached bathrooms
- Dress room

**Service Zone:**
- Kitchen
- Utility
- Store
- Servant's room
`;

/**
 * Traditional Tamil Nadu Architecture
 */
export const TRADITIONAL_ELEMENTS = `## TRADITIONAL TAMIL NADU ARCHITECTURE

### 1. MUTRAM (CENTRAL COURTYARD) - MANDATORY FOR ECO-DESIGN

**Definition:**
- Open-to-sky courtyard at center of house
- Provides natural ventilation and light (stack effect)
- Fresh air enters through windows, hot air rises and escapes upward
- Heart of traditional Tamil Nadu house

**Structural Design (CRITICAL):**
- **FOUR PILLARS ONLY** at corners (not walls)
- **OPEN from ALL FOUR SIDES** - no enclosing walls
- Pillars support surrounding corridor roof, NOT the courtyard
- Traditional carved stone/wood pillars preferred
- Pillar height: Match corridor ceiling (typically 10-12 feet)
- Pillar material: Stone (granite/laterite) or carved wood

**Layout Requirements:**
- Minimum size: 8'×8' (64 sq.ft) for standard homes
- Recommended: 10'×10' to 12'×12' for better effect
- Surrounded by covered corridor/passage on all sides
- Corridor width: Minimum 4 feet, recommended 5-6 feet
- Floor level: Can be same as interior or slightly depressed (2-3 inches)

**Water Feature (Traditional):**
- Central sunken pool/basin (optional but recommended)
- Size: 4'×4' to 6'×6' depending on courtyard size
- Depth: 12-18 inches
- Stone/granite edge (parapet)
- Can include stepping stones
- Rainwater collection point

**Other Elements:**
- Tulsi plant pedestal (Tulsi Madam) - traditional, optional
- Decorative floor: Athangudi tiles or stone
- Drainage: Central or corner drain to soak pit
- Rainwater harvesting integration

**Vastu Integration:**
- Satisfies Brahmasthan (center space) requirement
- Energy flows from center to all directions
- Water element in center is auspicious
- Open sky allows cosmic energy entry

### 2. THINNAI (ENTRANCE VERANDAH)

**Definition:**
- Raised, shaded platform at entrance
- Transition between public street and private home

**Design Requirements:**
- Minimum width: 4 feet
- Along the entrance/road-facing side
- Shaded roof or deep overhang
- Can include seating (built-in bench)
- Traditional: stone/wood seating

**Functions:**
- Greeting and receiving visitors
- Social interaction space
- Weather protection at entrance
- Buffer from direct sun/rain

### 3. CLIMATE-RESPONSIVE FEATURES

**Passive Cooling:**
- High ceilings (10-12 feet) for heat rise
- Large openings for cross-ventilation
- Shaded verandahs on sun-facing sides
- Courtyard for stack ventilation
- Thick walls (9" or more) for thermal mass

**Material Recommendations:**
- CSEB (Compressed Stabilized Earth Blocks)
- Mud bricks with lime wash
- Terracotta/Mangalore roof tiles
- Athangudi floor tiles
- Natural stone plinth

**Roof Design:**
- Sloped roof preferred (better heat dissipation)
- Clay tiles over RCC slab
- Deep overhangs (2-3 feet) on sun-facing sides
`;

/**
 * Vernacular Architecture - Traditional Materials & Techniques
 *
 * Eco-friendly, locally sourced, sustainable building materials
 * specific to Tamil Nadu / South India.
 */
export const VERNACULAR_ARCHITECTURE = `## VERNACULAR ARCHITECTURE - TRADITIONAL MATERIALS

### 1. ATHANGUDI TILES (Karaikudi Tiles)

**Origin:** Athangudi village, Karaikudi, Tamil Nadu (Chettinad region)

**Characteristics:**
- Handmade cement tiles with embedded natural dyes
- Unique patterns: Geometric, floral, traditional motifs
- Each tile is individually crafted (no two exactly alike)
- Surface: Smooth, slightly porous
- Colors: Natural earth tones, indigo, ochre, terracotta, black

**Standard Sizes:**
- 6"×6" (150×150mm) - most common
- 8"×8" (200×200mm) - for larger patterns
- 12"×12" (300×300mm) - premium/feature areas
- Thickness: 15-20mm

**Application Areas:**
- IDEAL: Mutram/courtyard flooring
- Living room feature floors
- Verandah (Thinnai) flooring
- Corridor/passage floors
- Wall dadoing (decorative)

**Installation Notes:**
- Lay on cement mortar bed (1:4 ratio)
- Joint width: 2-3mm
- Grout: White or matching cement
- Sealing: Wax polish after 7 days curing
- NOT suitable for wet areas (bathrooms)

**Cost Range:** ₹80-200 per sq.ft (depending on design complexity)

### 2. CSEB (Compressed Stabilized Earth Blocks)

**Definition:** Machine-pressed blocks made from local soil + cement + water

**Composition:**
- Soil: 85-90% (locally sourced earth)
- Cement: 5-10% (stabilizer)
- Water: Optimal moisture content
- Optional: Lime, fly ash for enhanced strength

**Standard Block Sizes:**
- 300×150×100mm (12"×6"×4") - standard
- 230×190×100mm (9"×7.5"×4") - interlock type
- 300×200×150mm (12"×8"×6") - load-bearing

**Wall Specifications:**
- Single wall: 150mm (6") - partitions
- Double wall: 230mm (9") - load-bearing
- Cavity wall: 300mm (12") - external, thermal insulation

**Advantages:**
- Low embodied energy (80% less than fired bricks)
- Natural thermal mass (keeps interiors cool)
- Local material reduces transport
- Breathable walls (regulates humidity)
- Earthquake resistant (when properly built)

**Finish Options:**
- Exposed (natural earth color) - most eco-friendly
- Lime wash (traditional white/cream)
- Mud plaster + natural oxide
- Cement plaster only if required

**Compressive Strength:**
- Minimum: 3.5 N/mm² (class 30 blocks)
- Standard: 5-7 N/mm² (class 50-70)
- High strength: 10+ N/mm² (class 100)

**Cost Range:** ₹35-50 per block (cheaper than fired bricks)

### 3. OXIDE FLOORING (Cement Oxide / Red Oxide)

**Definition:** Traditional Indian cement flooring with natural oxide pigments

**Types:**
- **Red Oxide (IPS - Indian Patent Stone)**
  - Color: Deep maroon/red from iron oxide
  - Most traditional and common

- **Yellow Oxide**
  - Color: Ochre/mustard from iron hydroxide
  - Warmer appearance

- **Black Oxide**
  - Color: Dark grey/black from mangite oxide
  - Modern look, hides stains

- **Green Oxide**
  - Color: Sage green from chromium oxide
  - Less common, premium

**Standard Specifications:**
- Base: 100mm PCC (1:4:8) over compacted earth
- Screed: 40-50mm cement mortar (1:4)
- Finish: 6-10mm oxide layer (cement + oxide powder)
- Thickness total: 150-160mm

**Mix Ratio (Finish Layer):**
- Cement: 1 part
- Oxide powder: 1-2 kg per bag cement (for color intensity)
- Fine sand: 1-1.5 parts (optional, for texture)

**Application Process:**
1. Prepare PCC base, cure 7 days
2. Apply screed, level, cure 3 days
3. Apply oxide paste in 2 coats
4. Smooth with trowel while setting
5. Cure 7 days with wet cloth/jute
6. Polish with wax/coconut oil

**Finish Options:**
- Smooth polished (traditional)
- Semi-rough (anti-slip)
- Patterned (brass strips for borders)
- Embedded with brass/copper motifs

**Application Areas:**
- Living room, dining, bedrooms
- Verandah (Thinnai)
- Corridors/passages
- NOT recommended for wet areas

**Cost Range:** ₹50-80 per sq.ft (labor + material)

### 4. LIME PLASTER & LIME WASH

**Lime Plaster:**
- Composition: Lime putty + sand (1:2 or 1:3)
- Thickness: 12-20mm
- Properties: Breathable, flexible, antifungal
- Suitable for: CSEB walls, mud walls, brick walls

**Lime Wash (Chunam):**
- Composition: Lime putty + water
- Application: 2-3 coats by brush
- Colors: White, cream, light pastels (natural oxides)
- Properties: Antiseptic, reflective, maintenance-free

**Traditional Polished Lime (Araish):**
- Multiple coats of fine lime + marble dust
- Polished with stones to mirror finish
- Used in Chettinad mansions
- Very durable (100+ years)

### 5. MANGALORE/TERRACOTTA ROOF TILES

**Types:**
- **Mangalore Tiles:** Half-round interlocking clay tiles
- **Country Tiles:** Flat curved traditional tiles
- **Decorative Ridge Tiles:** For roof peaks

**Specifications:**
- Size: 260×170mm (standard Mangalore)
- Overlap: 75mm longitudinal, 50mm lateral
- Weight: 2.5-3 kg per tile
- Coverage: 15-18 tiles per sq.m

**Roof Pitch:**
- Minimum: 22° (for proper water runoff)
- Recommended: 25-35°
- Maximum: 45° (for heavy rainfall areas)

**Support Structure:**
- Rafters: 75×50mm wood at 600mm spacing
- Battens: 50×25mm wood at 200mm spacing
- OR steel tubular frame with hook bolts

### 6. NATURAL STONE ELEMENTS

**Granite (Karungal):**
- Application: Plinths, steps, window sills, flooring
- Finish: Polished, flamed, bush-hammered
- Colors: Black, grey, pink (local varieties)

**Laterite (Vettukal):**
- Application: Foundation, walls, paving
- Properties: Porous, breathable, excellent for humid climate
- Source: Malabar coast, parts of Tamil Nadu

**Kadappa Stone:**
- Application: Flooring, steps, basins
- Color: Grey-green to grey-blue
- Finish: Natural or polished

### 7. TRADITIONAL CEILING OPTIONS

**Jack Arch Ceiling:**
- Brick arches between steel/wood beams
- Very cool interior, no false ceiling needed
- Traditional Chettinad style

**Madras Terrace (Mud Terrace):**
- Brick over wood joists + lime concrete
- Excellent thermal insulation
- Traditional, requires more maintenance

**Exposed Terracotta:**
- Terracotta ceiling panels between wood beams
- Decorative patterns possible
- Good acoustics

### 8. WOODEN ELEMENTS (Traditional)

**Door & Window Frames:**
- Material: Teak, Rosewood, Neem, Burma Teak
- Frame size: 4"×3" (100×75mm) standard
- Threshold: Stone or hardwood

**Carved Elements:**
- Door panels with traditional motifs
- Window jalis (lattice work)
- Column capitals
- Ceiling beams with carvings

**Traditional Wood Finishes:**
- Raw linseed oil
- Country wood polish (coconut oil + beeswax)
- Natural varnish

### QUICK REFERENCE - VERNACULAR MATERIALS

| Area | Recommended Material | Alternative |
|------|---------------------|-------------|
| External Walls | CSEB (exposed/lime wash) | Mud brick + lime |
| Internal Walls | CSEB + lime plaster | Brick + lime |
| Living Floor | Red Oxide / Athangudi | Kadappa stone |
| Bedroom Floor | Red Oxide | Wooden flooring |
| Verandah Floor | Athangudi tiles | Stone / Red Oxide |
| Courtyard Floor | Athangudi / Stone | Red Oxide |
| Bathroom Floor | Kadappa / Granite | Anti-skid ceramic |
| Roof | Mangalore tiles | Country tiles |
| Ceiling | Jack arch / Terracotta | Exposed Madras terrace |
| Doors | Teak / Burma Teak | Neem / treated wood |
| Windows | Teak with jali | Wood + MS grill |
`;

/**
 * Structural Engineering Rules
 */
export const STRUCTURAL_RULES = `## STRUCTURAL ENGINEERING RULES

### 1. LOAD-BEARING WALLS

**Definition:** Walls that support building weight (roof, floors)

**Placement Rules:**
- Exterior perimeter walls are typically load-bearing
- Interior load-bearing walls for additional support
- MUST NOT be removed or breached without structural review
- Plumbing should NOT cut completely through load-bearing walls

### 2. COLUMN GRID

**Placement Principles:**
- Columns at building corners
- At intersection of beams and walls
- Typical residential grid: 3m×3m to 5m×5m
- Avoid columns in Brahmasthan (Vastu)

**Column Sizing (by load):**
- Light loads (<500kN): 230×230mm (9"×9")
- Medium loads: 300×300mm to 450×450mm
- Heavy loads: 600×600mm and above

### 3. BEAM CONSIDERATIONS

- Exposed beams affect ceiling height
- Plan beams along room boundaries where possible
- Avoid beams across living/dining center
- Coordinate with false ceiling design

### 4. PLUMBING STACK ALIGNMENT

**Vertical Alignment:**
- Bathrooms/toilets should stack vertically
- Kitchen above kitchen (multi-story)
- Single plumbing chase preferred
- Reduces cost and maintenance

**Clustering:**
- Group wet areas (kitchen, bathrooms, utility)
- Shared drainage runs
- Single external sewer connection

### 5. EXPANSION PROVISIONS

**For Future Vertical Expansion:**
- Foundation designed for +1 or +2 floors
- Columns extended with rebar for future
- Staircase positioned for upper floor access
- Water tank space on terrace planned
`;

/**
 * Complete Engineering Rules Summary
 *
 * This is the master prompt injected into planning agents.
 */
export const ENGINEERING_RULES_SUMMARY = `## INDIAN HOUSE ENGINEERING RULES - COMPLETE REFERENCE

### PRIORITY HIERARCHY (When Rules Conflict)

1. **SAFETY & NBC COMPLIANCE** (Mandatory - Cannot Override)
   - Minimum dimensions, ceiling heights
   - Ventilation percentages
   - Staircase safety standards
   - Structural integrity

2. **FUNCTIONAL REQUIREMENTS** (Highly Recommended)
   - Room adjacency (kitchen-dining, bedroom-bathroom)
   - Privacy zoning (public-private separation)
   - Circulation efficiency
   - Cross-ventilation paths

3. **VASTU COMPLIANCE** (Optional - User Preference)
   - Directional room placement
   - Entrance pada (position)
   - Brahmasthan (center) rules
   - Staircase direction and count

4. **TRADITIONAL DESIGN** (Cultural/Aesthetic)
   - Mutram (courtyard) design
   - Thinnai (verandah) style
   - Material choices

### QUICK REFERENCE - CRITICAL DIMENSIONS

| Element | Minimum | Recommended |
|---------|---------|-------------|
| Habitable room | 6.5'×6.5' | 10'×10'+ |
| Ceiling height | 9 feet | 10-12 feet |
| Stair tread | 10 inches | 11 inches |
| Stair riser | Max 7.5" | 6-7 inches |
| Stair width | 3 feet | 3.5 feet |
| Door width | 2.5 feet | 3 feet |
| Door height | 7 feet | 7 feet |
| Corridor | 3 feet | 3.5-4 feet |
| Ventilation | 10% floor area | 15%+ |

### QUICK REFERENCE - VASTU PLACEMENT

| Room | Ideal Direction | Avoid |
|------|-----------------|-------|
| Kitchen | Southeast | NE, N, E |
| Master Bed | Southwest | NE |
| Living | North, East | - |
| Pooja | Northeast | SE, S, SW |
| Toilet | NW, S-SW | NE, near kitchen |
| Staircase | S, W, SW, NW | NE, Center |
| Entrance | E, N, NE | SW |

### QUICK REFERENCE - TAMIL NADU REGULATIONS

| Parameter | Requirement |
|-----------|-------------|
| Setback (non-high-rise) | 1.2-1.35m all sides |
| FSI (residential) | 1.5-2.5 |
| Max ground coverage | 50-60% |
| Open space | 40-50% minimum |
| Height (residential) | 15m / 4 floors typical |

### MANDATORY ECO-DESIGN ELEMENTS

1. **Central Courtyard (Mutram)** - Natural ventilation, light
2. **Verandah (Thinnai)** - Shaded entrance transition
3. **Cross-Ventilation** - Every room must have airflow path
4. **West Wall Minimization** - Buffer against afternoon heat
5. **Rainwater Harvesting** - Provision in design
6. **Expansion-Ready** - Foundation for future floors
`;

/**
 * Validation Rules for Programmatic Enforcement
 *
 * These rules can be checked programmatically against floor plans.
 */
export const VALIDATION_RULES = {
  // NBC Mandatory Rules
  nbc: {
    minHabitableRoomDimension: { width: 6.5, depth: 6.5, unit: 'feet' },
    minCeilingHeight: { height: 9, unit: 'feet' },
    minVentilationPercentage: 10, // of floor area
    minStairTread: { depth: 10, unit: 'inches' },
    maxStairRiser: { height: 7.5, unit: 'inches' },
    minStairWidth: { width: 3, unit: 'feet' },
    minDoorWidth: { width: 2.5, unit: 'feet' },
    minDoorHeight: { height: 7, unit: 'feet' },
    minCorridorWidth: { width: 3, unit: 'feet' },
  },

  // Tamil Nadu Regulations
  tamilNadu: {
    minSetback: { distance: 4, unit: 'feet' },
    maxFSI: 2.5,
    maxGroundCoverage: 60, // percentage
    minOpenSpace: 40, // percentage
  },

  // Vastu Placement Rules
  vastu: {
    kitchen: {
      ideal: ['southeast'],
      acceptable: ['northwest'],
      avoid: ['northeast', 'north', 'east'],
    },
    masterBedroom: {
      ideal: ['southwest'],
      acceptable: ['south', 'northwest'],
      avoid: ['northeast'],
    },
    living: {
      ideal: ['north', 'east'],
      acceptable: ['west', 'northeast'],
      avoid: [],
    },
    pooja: {
      ideal: ['northeast'],
      acceptable: ['east', 'north'],
      avoid: ['southeast', 'south', 'southwest'],
    },
    toilet: {
      ideal: ['northwest', 'south-southwest'],
      acceptable: ['west'],
      avoid: ['northeast', 'adjacent-to-kitchen'],
    },
    staircase: {
      ideal: ['south', 'west', 'southwest', 'northwest'],
      acceptable: [],
      avoid: ['northeast', 'center'],
      additionalRules: {
        climbingDirection: 'clockwise',
        stepCount: 'odd', // 9, 11, 15, 21 preferred
      },
    },
    entrance: {
      ideal: ['east', 'north', 'northeast'],
      acceptable: ['west', 'south-southeast'],
      avoid: ['southwest'],
    },
    center: {
      ideal: ['courtyard', 'open-space'],
      avoid: ['toilet', 'kitchen', 'staircase', 'pillar'],
    },
  },

  // Room Adjacency Rules
  adjacency: {
    kitchen: {
      mustBeAdjacentTo: ['dining'],
      shouldBeNear: ['utility', 'store'],
      mustNotBeAdjacentTo: ['toilet', 'bathroom'],
    },
    masterBedroom: {
      mustBeAdjacentTo: ['attached-bathroom'],
      shouldNotBeVisibleFrom: ['main-entrance'],
    },
    guestToilet: {
      mustBeAccessibleFrom: ['public-zone'],
      mustNotRequireEntering: ['private-zone'],
    },
  },

  // Traditional Elements
  traditional: {
    courtyard: {
      required: true,
      minArea: 36, // sq.ft (6'×6')
      openToSky: true,
    },
    verandah: {
      required: true,
      minWidth: 4, // feet
      location: 'entrance-side',
    },
  },
} as const;

/**
 * Export combined rules for agent prompts
 */
export const INDIAN_HOUSE_ENGINEERING_RULES = `${NBC_REQUIREMENTS}

${TAMIL_NADU_REGULATIONS}

${VASTU_PRINCIPLES}

${ROOM_ADJACENCY_RULES}

${TRADITIONAL_ELEMENTS}

${VERNACULAR_ARCHITECTURE}

${STRUCTURAL_RULES}

${ENGINEERING_RULES_SUMMARY}`;
