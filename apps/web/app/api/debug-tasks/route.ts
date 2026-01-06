import { NextResponse } from 'next/server';
import { services } from '@maiyuri/api';

export async function GET() {
  try {
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('Has Service Key:', hasServiceKey);
    
    const { data: tasks } = await services.supabase.supabase.from('tasks').select('*').order('created_at', { ascending: false });
    const { data: questions, error: qError } = await services.supabase.supabase.from('unanswered_questions').select('*').order('created_at', { ascending: false });

    return NextResponse.json({ tasks, questions, hasServiceKey, qError });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
