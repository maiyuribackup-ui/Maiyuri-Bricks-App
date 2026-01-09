import { NextRequest } from 'next/server';
import { kernels } from '@maiyuri/api';
import { success, error, parseBody, parseQuery } from '@/lib/api-utils';
import { archiveSuggestionActionSchema } from '@maiyuri/shared';

// GET /api/archive/suggestions - Get pending archive suggestions
export async function GET(request: NextRequest) {
  try {
    const query = parseQuery(request);
    const refresh = query.refresh === 'true';

    let result;
    if (refresh) {
      result = await kernels.archiveCurator.generateSuggestions({ refresh: true });
    } else {
      result = await kernels.archiveCurator.getSuggestions();
    }

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get suggestions', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Error getting archive suggestions:', err);
    return error('Internal server error', 500);
  }
}

// POST /api/archive/suggestions - Process suggestions (accept/dismiss)
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, archiveSuggestionActionSchema);
    if (parsed.error) return parsed.error;

    const result = await kernels.archiveCurator.processSuggestions({
      suggestion_ids: parsed.data.suggestion_ids,
      action: parsed.data.action,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to process suggestions', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Error processing archive suggestions:', err);
    return error('Internal server error', 500);
  }
}
