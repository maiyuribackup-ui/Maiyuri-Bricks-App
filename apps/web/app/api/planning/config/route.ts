import { NextRequest } from 'next/server';
import { success } from '@/lib/api-utils';
import { planningService } from '@/lib/planning-service';

/**
 * GET /api/planning/config
 *
 * Returns the planning service configuration
 */
export async function GET(request: NextRequest) {
  return success({
    persistenceEnabled: planningService.isPersistenceEnabled(),
  });
}
