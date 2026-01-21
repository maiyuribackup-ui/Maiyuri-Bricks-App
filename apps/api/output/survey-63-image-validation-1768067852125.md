# FLOOR PLAN IMAGE VALIDATION REPORT

**Generated:** 2026-01-10T17:57:32.125Z
**Image:** /Users/ramkumaranganeshan/Documents/Maiyuri_Bricks_App/apps/api/output/survey-63-3d-isometric-1768067714388.png
**Status:** ❌ FAIL

---

## Summary

| Metric      | Value |
| ----------- | ----- |
| Total Tests | 18    |
| Passed      | 8     |
| Failed      | 10    |
| Score       | 44%   |

---

## Errors (3)

### 1. 🔴 ROOM_NAME (critical)

- **Expected:** Dining
- **Actual:** OPEN-TO-SKY DINING ROOM
- **Description:** Room name does not match exactly. Expected 'Dining' but found 'OPEN-TO-SKY DINING ROOM'

### 2. 🔴 ROOM_NAME (critical)

- **Expected:** Mutram
- **Actual:** Central courtyard space without proper Mutram label
- **Description:** Required room 'Mutram' is not properly labeled in the image, though the 8'×8' space exists

### 3. 🟠 SETBACK (major)

- **Expected:** North: 2'-0", South: 3'-0", East: 3'-6", West: 2'-0"
- **Actual:** Setbacks shown match the given values
- **Description:** Setbacks appear correct but need verification against plot boundaries

---

## Warnings (2)

### 1. labeling

- **Issue:** The central courtyard space appears to be the 'Mutram' but lacks proper identification label
- **Recommendation:** Add clear 'MUTRAM' label to the 8'×8' central courtyard space

### 2. room_naming

- **Issue:** Dining room is labeled as 'OPEN-TO-SKY DINING ROOM' instead of simple 'DINING'
- **Recommendation:** Change label to exactly match required name 'DINING'

---

## Validation Methodology

This validation was performed by:

1. Analyzing the actual generated IMAGE (not just the prompt)
2. Using vision AI to extract text and visual elements
3. Comparing extracted values against input requirements
4. Applying strict label fidelity rules (no semantic substitutions)

**Root Cause Prevention:** This methodology addresses the prior failure where
prompt text was validated instead of actual image output.
