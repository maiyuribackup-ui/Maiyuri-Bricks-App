/**
 * Print a built-in process definition as JSON (validated), for the SQL test
 * suites and manual imports:  bun apps/web/scripts/dump-process-definition.ts LEAD_TO_DELIVERY
 */
import { processDefinitionInputSchema } from "../../../packages/shared/src/process";
import { BUILT_IN_DEFINITIONS } from "../src/lib/process/definitions/lead-to-delivery";

const key = process.argv[2] ?? "LEAD_TO_DELIVERY";
const def = BUILT_IN_DEFINITIONS[key];
if (!def) {
  console.error(
    `Unknown definition ${key}. Known: ${Object.keys(BUILT_IN_DEFINITIONS).join(", ")}`,
  );
  process.exit(1);
}
process.stdout.write(JSON.stringify(processDefinitionInputSchema.parse(def)));
