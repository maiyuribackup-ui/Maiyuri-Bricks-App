export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { getEmployees, syncEmployeesFromOdoo } from "@/lib/production-service";
import type { Employee } from "@maiyuri/shared";

// GET /api/production/employees - List all active employees
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);
    const department = queryParams.department;

    const employees = await getEmployees(department);
    return success<Employee[]>(employees);
  } catch (err) {
    console.error("Error fetching employees:", err);
    return error("Failed to fetch employees", 500);
  }
}

// POST /api/production/employees - Sync employees from Odoo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const department = body.department as string | undefined;

    const result = await syncEmployeesFromOdoo(department);

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    return success(result.data, { total: result.data?.total as number });
  } catch (err) {
    console.error("Error syncing employees:", err);
    return error("Failed to sync employees from Odoo", 500);
  }
}
