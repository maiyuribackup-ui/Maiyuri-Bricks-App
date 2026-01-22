export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  success,
  created,
  error,
  parseBody,
  parseQuery,
} from "@/lib/api-utils";
import {
  createProductSchema,
  updateProductSchema,
  type Product,
} from "@maiyuri/shared";

// GET /api/products - List all active products
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);
    const activeOnly = queryParams.active_only !== "false";
    const category = queryParams.category;

    let query = supabaseAdmin
      .from("products")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error: dbError } = await query;

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to fetch products", 500);
    }

    return success<Product[]>(data || []);
  } catch (err) {
    console.error("Error fetching products:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/products - Create a new product (founders only)
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, createProductSchema);
    if (parsed.error) return parsed.error;

    const { data: product, error: dbError } = await supabaseAdmin
      .from("products")
      .insert(parsed.data)
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to create product", 500);
    }

    return created<Product>(product);
  } catch (err) {
    console.error("Error creating product:", err);
    return error("Internal server error", 500);
  }
}

// PUT /api/products - Update a product (founders only)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return error("Product ID is required", 400);
    }

    const parsed = updateProductSchema.safeParse(updateData);
    if (!parsed.success) {
      return error(parsed.error.errors.map((e) => e.message).join(", "), 400);
    }

    const { data: product, error: dbError } = await supabaseAdmin
      .from("products")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to update product", 500);
    }

    return success<Product>(product);
  } catch (err) {
    console.error("Error updating product:", err);
    return error("Internal server error", 500);
  }
}
