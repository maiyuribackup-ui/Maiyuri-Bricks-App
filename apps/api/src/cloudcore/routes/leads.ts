/**
 * Lead Route Handlers
 */

import * as db from '../services/supabase';
import * as contracts from '../contracts';
import type { CloudCoreResult, Lead } from '../types';

/**
 * Get all leads with optional filters
 */
export async function getLeads(params: {
  status?: string;
  assignedStaff?: string;
  page?: number;
  limit?: number;
}): Promise<CloudCoreResult<Lead[]>> {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  return db.getLeads({
    status: params.status,
    assignedStaff: params.assignedStaff,
    limit,
    offset,
  });
}

/**
 * Get a single lead by ID
 */
export async function getLead(id: string): Promise<CloudCoreResult<Lead | null>> {
  // Validate ID
  const parsed = contracts.UUIDSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid lead ID format',
      },
    };
  }

  return db.getLead(id);
}

/**
 * Create a new lead
 */
export async function createLead(
  data: contracts.CreateLeadRequest
): Promise<CloudCoreResult<Lead>> {
  // Validate request
  const parsed = contracts.CreateLeadRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  return db.createLead({
    name: parsed.data.name,
    contact: parsed.data.contact,
    source: parsed.data.source,
    lead_type: parsed.data.leadType,
    assigned_staff: parsed.data.assignedStaff || null,
    status: parsed.data.status,
  });
}

/**
 * Update a lead
 */
export async function updateLead(
  id: string,
  data: contracts.UpdateLeadRequest
): Promise<CloudCoreResult<Lead>> {
  // Validate ID
  const idParsed = contracts.UUIDSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid lead ID format',
      },
    };
  }

  // Validate request
  const parsed = contracts.UpdateLeadRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  const updates: Partial<Lead> = {};
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.contact) updates.contact = parsed.data.contact;
  if (parsed.data.source) updates.source = parsed.data.source;
  if (parsed.data.leadType) updates.lead_type = parsed.data.leadType;
  if (parsed.data.assignedStaff !== undefined) updates.assigned_staff = parsed.data.assignedStaff;
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.followUpDate) updates.follow_up_date = parsed.data.followUpDate;

  return db.updateLead(id, updates);
}

/**
 * Get lead statistics for dashboard
 */
export async function getLeadStats(): Promise<CloudCoreResult<{
  total: number;
  byStatus: Record<string, number>;
  dueToday: number;
  overdue: number;
}>> {
  return db.getLeadStats();
}

export default {
  getLeads,
  getLead,
  createLead,
  updateLead,
  getLeadStats,
};
