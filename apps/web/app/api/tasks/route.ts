import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createTaskSchema, taskFiltersSchema } from '@maiyuri/shared';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const assignee = searchParams.get('assigned_to');
  const leadId = searchParams.get('lead_id');

  try {
    let query = supabaseAdmin
      .from('tasks')
      .select('*, assignee:users!tasks_assigned_to_fkey(*)'); // Join assignee details

    if (status) query = query.eq('status', status);
    if (assignee) query = query.eq('assigned_to', assignee);
    if (leadId) query = query.eq('lead_id', leadId);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
       console.error('Error fetching tasks:', error);
       return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    return NextResponse.json({ data: null, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = createTaskSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ data: null, error: validation.error.message }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert(validation.data)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ data: null, error: 'Failed to create task' }, { status: 500 });
  }
}
