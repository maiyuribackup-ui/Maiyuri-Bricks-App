/** Master switch for the coaching AI layer. Default ON; set COACH_AI_ENABLED=false to disable. */
export function isCoachAiEnabled(): boolean {
  return process.env.COACH_AI_ENABLED !== "false";
}
