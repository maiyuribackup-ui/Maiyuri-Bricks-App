/**
 * Route glue for /api/process/*: one place to map AuthError / ProcessError /
 * unexpected errors onto the {data,error} envelope.
 */
import { NextResponse } from "next/server";
import { error } from "@/lib/api-utils";
import { AuthError } from "@/lib/api-helpers";
import { ProcessError } from "./errors";

export function processErrorResponse(
  err: unknown,
  fallback = "Process operation failed",
): NextResponse {
  if (err instanceof AuthError) return error(err.message, err.status);
  if (err instanceof ProcessError) {
    const message = err.gateKey
      ? `${err.message} [${err.gateKey}]`
      : err.message;
    return error(message, err.status);
  }
  console.error("[ProcessOS]", fallback, err);
  return error(fallback, 500);
}

export async function runProcessRoute(
  fallback: string,
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    return processErrorResponse(err, fallback);
  }
}
