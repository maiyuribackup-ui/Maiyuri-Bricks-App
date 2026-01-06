import { NextResponse } from 'next/server';
import { services } from '@maiyuri/api';

export async function GET() {
  try {
      const result = await services.tasks.createTask({
        title: 'Test Task Creation Route ' + Date.now(),
        description: 'Testing via route',
        priority: 'high',
        dueDate: new Date().toISOString()
      });

      return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
