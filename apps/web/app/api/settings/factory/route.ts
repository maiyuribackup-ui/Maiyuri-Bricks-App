import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, parseBody } from '@/lib/api-utils';
import {
  updateFactorySettingsSchema,
  type FactorySettings,
} from '@maiyuri/shared';

// GET /api/settings/factory - Get factory settings
export async function GET() {
  try {
    // Get the first (and only) factory settings record
    const { data, error: dbError } = await supabaseAdmin
      .from('factory_settings')
      .select('*')
      .limit(1)
      .single();

    if (dbError) {
      // If no settings exist, return default values
      if (dbError.code === 'PGRST116') {
        return success<FactorySettings | null>(null);
      }
      console.error('Database error:', dbError);
      return error('Failed to fetch factory settings', 500);
    }

    return success<FactorySettings>(data);
  } catch (err) {
    console.error('Error fetching factory settings:', err);
    return error('Internal server error', 500);
  }
}

// PUT /api/settings/factory - Update factory settings
export async function PUT(request: NextRequest) {
  try {
    const parsed = await parseBody(request, updateFactorySettingsSchema);
    if (parsed.error) return parsed.error;

    // Check if settings exist
    const { data: existing } = await supabaseAdmin
      .from('factory_settings')
      .select('id')
      .limit(1)
      .single();

    let result;
    if (existing) {
      // Update existing settings
      result = await supabaseAdmin
        .from('factory_settings')
        .update({
          ...parsed.data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Create new settings
      result = await supabaseAdmin
        .from('factory_settings')
        .insert(parsed.data)
        .select()
        .single();
    }

    if (result.error) {
      console.error('Database error:', result.error);
      return error('Failed to update factory settings', 500);
    }

    return success<FactorySettings>(result.data);
  } catch (err) {
    console.error('Error updating factory settings:', err);
    return error('Internal server error', 500);
  }
}

// POST /api/settings/factory - Initialize factory settings (for first-time setup)
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, updateFactorySettingsSchema);
    if (parsed.error) return parsed.error;

    // Check if settings already exist
    const { data: existing } = await supabaseAdmin
      .from('factory_settings')
      .select('id')
      .limit(1)
      .single();

    if (existing) {
      return error('Factory settings already exist. Use PUT to update.', 400);
    }

    const { data, error: dbError } = await supabaseAdmin
      .from('factory_settings')
      .insert(parsed.data)
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to create factory settings', 500);
    }

    return success<FactorySettings>(data);
  } catch (err) {
    console.error('Error creating factory settings:', err);
    return error('Internal server error', 500);
  }
}
