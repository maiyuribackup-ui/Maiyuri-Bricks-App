# CAD vs AI Image Generation for Floor Plans

**Date:** January 10, 2026
**Issue:** Proportion errors in AI-generated floor plans (27'6" appearing longer than 29')
**Status:** RESOLVED - Switched to Maker.js CAD-based generation

---

## The Critical Problem

### What Happened
When generating floor plans using Gemini's image generation AI:
- North side = 29'-0" (should appear LONGER)
- South side = 27'-6" (should appear SHORTER)
- **Actual Result:** South appeared longer than North in the image

This is a **CRITICAL ERROR** for construction-ready plans because:
1. Contractors will build to the drawing
2. Wrong proportions = wrong building
3. Legal issues, structural problems, wasted materials

### Why AI Image Generation CANNOT Be Used for Construction Plans

| Aspect | AI Image Generation | CAD Generation |
|--------|---------------------|----------------|
| **Method** | Statistical pattern matching | Mathematical coordinates |
| **Precision** | Approximate (learns from images) | Exact (computes from dimensions) |
| **Proportions** | Interpreted loosely | Mathematically guaranteed |
| **Repeatability** | Different each time | Identical every time |
| **Verification** | Cannot measure in image | Can measure in CAD software |
| **Industry Standard** | NO | YES (DXF format) |

### Technical Root Cause

AI image generation (Gemini, Midjourney, DALL-E, etc.) works by:

1. **Training on images** - learns visual patterns, not geometry
2. **Statistical generation** - produces "probable" images, not precise ones
3. **Prompt interpretation** - converts text to visual concepts loosely
4. **No mathematical constraints** - cannot enforce 29' > 27'6"

When we wrote "North = 29', South = 27'6'", the AI:
- Understood these as labels, not constraints
- Generated walls that "looked like" a floor plan
- Had no mechanism to ensure mathematical proportions
- Created visual output that violated dimensional requirements

---

## The Solution: Maker.js CAD Generation

### Why Maker.js

Maker.js was chosen because:

1. **CNC/Laser Cutting Origin** - Designed for manufacturing where precision is mandatory
2. **Mathematical Coordinates** - Every point is computed, not interpreted
3. **Industry Exports** - DXF (AutoCAD), SVG (web), PDF (printing)
4. **Verifiable** - Output can be measured in any CAD software
5. **TypeScript Support** - Integrates with our codebase

### How It Works

```
INPUT:                    OUTPUT:
North = 29.0             North line = [0,41] to [29,41]
South = 27.5             South line = [0,0] to [27.5,0]

                         MATHEMATICALLY:
                         Length(North) = 29.0
                         Length(South) = 27.5
                         29.0 > 27.5 ✓ GUARANTEED
```

### Code Architecture

```
src/agents/planning/generators/
├── cad-floor-plan-generator.ts  # Core Maker.js generator
│   ├── generateFloorPlan()      # Main generation function
│   ├── createPlotBoundary()     # Trapezoidal plot
│   ├── createRoom()             # Room with walls
│   ├── createDoor()             # Door with swing arc
│   ├── createWindow()           # Window symbol
│   ├── createDimensionLine()    # Dimension annotations
│   ├── exportToSVG()            # Web-viewable output
│   └── exportToDXF()            # CAD-compatible output
│
scripts/
└── generate-survey-63-cad-plan.ts  # Survey 63 specific script
```

---

## Output Files

### For Survey No. 63

| File Type | Purpose | Can Verify Dimensions? |
|-----------|---------|------------------------|
| `*.svg` | Web viewing, embedding | Yes (inspect viewBox) |
| `*.dxf` | CAD software (AutoCAD, FreeCAD, LibreCAD) | Yes (measure tool) |
| `*.md` | Validation report | Yes (documented) |

### Verification Steps

1. **Open DXF in CAD Software**
   - FreeCAD (free): https://www.freecad.org/
   - LibreCAD (free): https://librecad.org/
   - AutoCAD (commercial)

2. **Use Measure Tool**
   - Select the North line
   - Verify length = 29'-0" (or 348")
   - Select the South line
   - Verify length = 27'-6" (or 330")

3. **Confirm Visual Proportion**
   - North line MUST appear longer than South line
   - This is now mathematically guaranteed

---

## Comparison: Before vs After

### Before (AI Image Generation)

```
Method: Gemini gemini-3-pro-image-preview
Input: Text prompt with dimensions
Output: PNG image

PROBLEMS:
❌ No dimension guarantee
❌ South (27'6") appeared longer than North (29')
❌ Cannot measure in image
❌ Not CAD-compatible
❌ Different output each run
❌ Cannot be used for construction
```

### After (Maker.js CAD Generation)

```
Method: Maker.js mathematical generation
Input: Structured coordinates in feet
Output: SVG + DXF + Validation Report

BENEFITS:
✅ Mathematically exact proportions
✅ North (29') GUARANTEED longer than South (27'6")
✅ Can measure in any CAD software
✅ Industry-standard DXF format
✅ Identical output every run
✅ CONSTRUCTION-READY
```

---

## When to Use Each Approach

### Use AI Image Generation For:
- Concept visualization (early ideation)
- Marketing/presentation renders
- Mood boards
- Non-critical visuals
- Client communication (not construction)

### Use CAD Generation For:
- Construction documents
- Permit applications
- Contractor drawings
- Dimension-critical plans
- Legal/official submissions
- Any plan that will be built from

---

## Implementation Notes

### Scale Handling

```typescript
// 1:50 scale calculation
const scale = 50;
const realFeet = 29.0;
const drawingInches = (realFeet * 12) / scale; // 6.96"

// At 1:50, 29' = 6.96" on paper
// At 1:50, 27.5' = 6.60" on paper
// Difference = 0.36" (visible and measurable)
```

### Layer Organization

The DXF file uses standard CAD layers:
- `PLOT_BOUNDARY` - Property line
- `BUILDABLE_AREA` - After setbacks
- `WALLS` - All wall lines
- `DOORS` - Door openings and swings
- `WINDOWS` - Window symbols
- `DIMENSIONS` - Dimension annotations
- `LABELS` - Room names
- `SYMBOLS` - North arrow, etc.

### Future Enhancements

1. **PDF Export** - For printing at scale
2. **Hatch Patterns** - Material indication (concrete, tile)
3. **Elevation Views** - Side views from DXF
4. **3D Model** - Export to STL for 3D visualization
5. **Interactive Editor** - Web-based plan modification

---

## Lessons Learned

1. **AI image generation is NOT a CAD tool**
   - Beautiful visuals ≠ accurate dimensions
   - Pattern matching ≠ mathematical precision

2. **Construction plans require mathematical generation**
   - Every dimension must be computable
   - Every proportion must be verifiable

3. **Industry standards exist for a reason**
   - DXF format is universal
   - CAD software has verification tools
   - Professionals expect measurable drawings

4. **The right tool for the right job**
   - AI for ideation and visualization
   - CAD for construction documents

---

## References

- **Maker.js**: https://maker.js.org/
- **IS 962**: Indian Standard for Architectural Drawings
- **DXF Format**: AutoCAD Drawing Exchange Format
- **Research**: See parallel research agents' findings on AI limitations

---

**This document serves as the canonical reference for why we switched from AI image generation to CAD-based generation for floor plans.**
