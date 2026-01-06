import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { updateTaskSchema } from '@maiyuri/shared';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    // Validate ID from params matches schema expectations if necessary, or just validate body
    const validation = updateTaskSchema.partial().safeParse({ ...body, id: params.id });

    if (!validation.success) {
      return NextResponse.json({ data: null, error: validation.error.message }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(validation.data)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Update task error:', error);
    console.error('Update task error:', error);
    return NextResponse.json({ data: null, error: error }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  return PUT(req, ctx);
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const { error } = await supabaseAdmin
        .from('tasks')
        .delete()
        .eq('id', params.id);
  
      if (error) throw error;
  
      return NextResponse.json({ data: true, error: null });
    } catch (error) {
      console.error('Delete task error:', error);
      return NextResponse.json({ data: null, error: 'Failed to delete task' }, { status: 500 });
    }
  }
