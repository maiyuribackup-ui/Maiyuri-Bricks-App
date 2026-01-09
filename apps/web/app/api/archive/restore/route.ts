import { NextRequest } from 'next/server';
import { kernels } from '@maiyuri/api';
import { success, error, parseBody } from '@/lib/api-utils';
import { batchRestoreSchema } from '@maiyuri/shared';

// POST /api/archive/restore - Restore archived leads
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, batchRestoreSchema);
    if (parsed.error) return parsed.error;

    const result = await kernels.archiveCurator.batchRestore({
      lead_ids: parsed.data.lead_ids,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to restore leads', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Error restoring leads:', err);
    return error('Internal server error', 500);
  }
}
