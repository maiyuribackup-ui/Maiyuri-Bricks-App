import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { ApiResponse } from '@maiyuri/shared';

// Standard API response helper
export function apiResponse<T>(
  data: T | null,
  error: string | null = null,
  status: number = 200,
  meta?: { total?: number; page?: number; limit?: number }
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error, meta }, { status });
}

// Success response
export function success<T>(data: T, meta?: { total?: number; page?: number; limit?: number }) {
  return apiResponse(data, null, 200, meta);
}

// Created response
export function created<T>(data: T) {
  return apiResponse(data, null, 201);
}

// Error response
export function error(message: string, status: number = 400) {
  return apiResponse(null, message, status);
}

// Not found response
export function notFound(message: string = 'Resource not found') {
  return apiResponse(null, message, 404);
}

// Unauthorized response
export function unauthorized(message: string = 'Unauthorized') {
  return apiResponse(null, message, 401);
}

// Forbidden response
export function forbidden(message: string = 'Forbidden') {
  return apiResponse(null, message, 403);
}

// Handle Zod validation errors
export function handleZodError(err: ZodError) {
  const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
  return error(messages.join(', '), 400);
}

// Parse request body with Zod schema
export async function parseBody<T>(
  request: Request,
  schema: { parse: (data: unknown) => T }
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { data, error: null };
  } catch (err) {
    if (err instanceof ZodError) {
      return { data: null, error: handleZodError(err) };
    }
    return { data: null, error: error('Invalid request body') };
  }
}

// Parse query params
export function parseQuery(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}
