import { NextRequest } from 'next/server';
import { kernels } from '@maiyuri/api';
import { success, error, parseBody } from '@/lib/api-utils';
import { updateArchiveConfigSchema } from '@maiyuri/shared';

// GET /api/archive/config - Get archive configuration
export async function GET() {
  try {
    const result = await kernels.archiveCurator.getArchiveConfig();

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get config', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Error getting archive config:', err);
    return error('Internal server error', 500);
  }
}

// PUT /api/archive/config - Update archive configuration
export async function PUT(request: NextRequest) {
  try {
    const parsed = await parseBody(request, updateArchiveConfigSchema);
    if (parsed.error) return parsed.error;

    const result = await kernels.archiveCurator.updateArchiveConfig(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to update config', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Error updating archive config:', err);
    return error('Internal server error', 500);
  }
}
