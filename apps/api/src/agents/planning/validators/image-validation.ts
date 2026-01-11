/**
 * Image Validation Agent
 *
 * Validates generated floor plan images against input specifications
 * by using vision model to analyze the actual rendered output.
 *
 * This addresses the root cause failure where we validated PROMPTS
 * instead of validating actual IMAGE OUTPUT against INPUT.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ValidationInput {
  imagePath: string;
  originalRequirements: {
    surveyNo: string;
    dimensions: {
      north: string;
      south: string;
      east: string;
      west: string;
    };
    setbacks: {
      north: string;
      south: string;
      east: string;
      west: string;
    };
    road: {
      side: string;
      width: string;
    };
    rooms: {
      name: string;
      size: string;
    }[];
  };
}

export interface ValidationResult {
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  score: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  timestamp: string;
  imagePath: string;
}

export interface ValidationError {
  category: 'dimension' | 'room_name' | 'room_missing' | 'orientation' | 'proportion' | 'label';
  severity: 'critical' | 'major' | 'minor';
  expected: string;
  actual: string;
  description: string;
}

export interface ValidationWarning {
  category: string;
  description: string;
  recommendation: string;
}

/**
 * Validates a generated floor plan image against input requirements
 * using Claude's vision capabilities.
 */
export async function validateFloorPlanImage(
  input: ValidationInput
): Promise<ValidationResult> {
  const anthropic = new Anthropic();

  // Read the image file
  const fs = await import('fs');
  const imageData = fs.readFileSync(input.imagePath);
  const base64Image = imageData.toString('base64');

  // Determine media type from file magic bytes (not extension - Gemini sometimes returns JPEG with PNG extension)
  let mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = 'image/jpeg';
  if (imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47) {
    mediaType = 'image/png';
  } else if (imageData[0] === 0xFF && imageData[1] === 0xD8 && imageData[2] === 0xFF) {
    mediaType = 'image/jpeg';
  } else if (imageData[0] === 0x47 && imageData[1] === 0x49 && imageData[2] === 0x46) {
    mediaType = 'image/gif';
  } else if (imageData[0] === 0x52 && imageData[1] === 0x49 && imageData[2] === 0x46 && imageData[3] === 0x46) {
    mediaType = 'image/webp';
  }

  // Build the validation prompt
  const validationPrompt = buildValidationPrompt(input.originalRequirements);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: validationPrompt,
          },
        ],
      },
    ],
  });

  // Parse the response
  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseValidationResponse(responseText, input.imagePath);
}

function buildValidationPrompt(requirements: ValidationInput['originalRequirements']): string {
  return `You are a strict Quality Assurance validator for architectural floor plans.

TASK: Analyze this floor plan image and validate it against the following EXACT requirements.

## INPUT REQUIREMENTS (What was requested):

**Survey Number:** ${requirements.surveyNo}

**Plot Dimensions (MUST match exactly):**
- North: ${requirements.dimensions.north}
- South: ${requirements.dimensions.south}
- East: ${requirements.dimensions.east}
- West: ${requirements.dimensions.west}

**Setbacks:**
- North: ${requirements.setbacks.north}
- South: ${requirements.setbacks.south}
- East: ${requirements.setbacks.east}
- West: ${requirements.setbacks.west}

**Road:**
- Side: ${requirements.road.side}
- Width: ${requirements.road.width}

**Required Rooms (EXACT names must appear):**
${requirements.rooms.map(r => `- "${r.name}": ${r.size}`).join('\n')}

## VALIDATION RULES:

1. **Label Fidelity (CRITICAL)**: Room names must match EXACTLY as specified.
   - If input says "Double Bedroom", the image MUST show "Double Bedroom" (NOT "Master Bedroom")
   - Any semantic substitutions are FAILURES

2. **Dimension Accuracy**: All dimensions shown in the image must match input values.

3. **Orientation**: Compass direction and road position must be correct.

4. **Proportions**: Visual proportions should reflect the actual dimensions.
   - If North-South is shorter than East-West, the image should show that.

## OUTPUT FORMAT (Respond in JSON):

{
  "validation_summary": {
    "overall_status": "PASS" | "FAIL" | "PARTIAL",
    "score_percentage": <number 0-100>,
    "total_tests": <number>,
    "passed": <number>,
    "failed": <number>
  },
  "dimension_validation": {
    "north": {"expected": "<value>", "actual_in_image": "<value>", "match": true|false},
    "south": {"expected": "<value>", "actual_in_image": "<value>", "match": true|false},
    "east": {"expected": "<value>", "actual_in_image": "<value>", "match": true|false},
    "west": {"expected": "<value>", "actual_in_image": "<value>", "match": true|false}
  },
  "room_validation": [
    {
      "expected_name": "<exact name from requirements>",
      "actual_name_in_image": "<what is shown>",
      "expected_size": "<size>",
      "actual_size_in_image": "<what is shown>",
      "name_match": true|false,
      "size_match": true|false
    }
  ],
  "orientation_validation": {
    "compass_present": true|false,
    "north_direction": "<description of where N points>",
    "road_side_expected": "${requirements.road.side}",
    "road_side_actual": "<which side road appears>",
    "road_match": true|false
  },
  "proportion_validation": {
    "expected_longer_axis": "<East-West or North-South based on dimensions>",
    "actual_longer_axis_in_image": "<which axis appears longer>",
    "match": true|false
  },
  "errors": [
    {
      "category": "<dimension|room_name|room_missing|orientation|proportion|label>",
      "severity": "<critical|major|minor>",
      "expected": "<what was expected>",
      "actual": "<what was found>",
      "description": "<explanation>"
    }
  ],
  "warnings": [
    {
      "category": "<string>",
      "description": "<string>",
      "recommendation": "<string>"
    }
  ]
}

IMPORTANT: Be STRICT. Any deviation from exact requirements is a failure.
Room name "Master Bedroom" when input said "Double Bedroom" is a CRITICAL failure.`;
}

function parseValidationResponse(responseText: string, imagePath: string): ValidationResult {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return createErrorResult(imagePath, 'Could not parse validation response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const errors: ValidationError[] = (parsed.errors || []).map((e: any) => ({
      category: e.category,
      severity: e.severity,
      expected: e.expected,
      actual: e.actual,
      description: e.description,
    }));

    const warnings: ValidationWarning[] = (parsed.warnings || []).map((w: any) => ({
      category: w.category,
      description: w.description,
      recommendation: w.recommendation,
    }));

    return {
      status: parsed.validation_summary.overall_status,
      score: parsed.validation_summary.score_percentage,
      totalTests: parsed.validation_summary.total_tests,
      passedTests: parsed.validation_summary.passed,
      failedTests: parsed.validation_summary.failed,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
      imagePath,
    };
  } catch (error) {
    return createErrorResult(imagePath, `Parse error: ${error}`);
  }
}

function createErrorResult(imagePath: string, errorMessage: string): ValidationResult {
  return {
    status: 'FAIL',
    score: 0,
    totalTests: 0,
    passedTests: 0,
    failedTests: 1,
    errors: [{
      category: 'label',
      severity: 'critical',
      expected: 'Valid validation response',
      actual: errorMessage,
      description: 'Validation system error',
    }],
    warnings: [],
    timestamp: new Date().toISOString(),
    imagePath,
  };
}

/**
 * Generates a markdown validation report
 */
export function generateValidationReport(result: ValidationResult): string {
  const statusEmoji = result.status === 'PASS' ? '✅' : result.status === 'PARTIAL' ? '⚠️' : '❌';

  let report = `# FLOOR PLAN IMAGE VALIDATION REPORT

**Generated:** ${result.timestamp}
**Image:** ${result.imagePath}
**Status:** ${statusEmoji} ${result.status}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${result.totalTests} |
| Passed | ${result.passedTests} |
| Failed | ${result.failedTests} |
| Score | ${result.score}% |

---

## Errors (${result.errors.length})

`;

  if (result.errors.length === 0) {
    report += '*No errors found.*\n';
  } else {
    result.errors.forEach((error, i) => {
      const severityEmoji = error.severity === 'critical' ? '🔴' : error.severity === 'major' ? '🟠' : '🟡';
      report += `### ${i + 1}. ${severityEmoji} ${error.category.toUpperCase()} (${error.severity})

- **Expected:** ${error.expected}
- **Actual:** ${error.actual}
- **Description:** ${error.description}

`;
    });
  }

  report += `---

## Warnings (${result.warnings.length})

`;

  if (result.warnings.length === 0) {
    report += '*No warnings.*\n';
  } else {
    result.warnings.forEach((warning, i) => {
      report += `### ${i + 1}. ${warning.category}

- **Issue:** ${warning.description}
- **Recommendation:** ${warning.recommendation}

`;
    });
  }

  report += `---

## Validation Methodology

This validation was performed by:
1. Analyzing the actual generated IMAGE (not just the prompt)
2. Using vision AI to extract text and visual elements
3. Comparing extracted values against input requirements
4. Applying strict label fidelity rules (no semantic substitutions)

**Root Cause Prevention:** This methodology addresses the prior failure where
prompt text was validated instead of actual image output.
`;

  return report;
}
