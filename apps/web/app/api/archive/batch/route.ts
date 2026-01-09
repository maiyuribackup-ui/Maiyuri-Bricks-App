import { NextRequest } from 'next/server';
import { kernels } from '@maiyuri/api';
import { success, error, parseBody } from '@/lib/api-utils';
import { batchArchiveSchema } from '@maiyuri/shared';

// POST /api/archive/batch - Batch archive multiple leads
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, batchArchiveSchema);
    if (parsed.error) return parsed.error;

    const result = await kernels.archiveCurator.batchArchive({
      lead_ids: parsed.data.lead_ids,
      reason: parsed.data.reason,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to archive leads', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Error batch archiving leads:', err);
    return error('Internal server error', 500);
  }
}
