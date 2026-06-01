/**
 * Lead Route Handlers
 */

import * as db from '../services/supabase';
import * as contracts from '../contracts';
import type {
  CloudCoreResult,
  Lead,
  LeadStatus,
  PipelineStage,
  LeadTemperature,
} from '../types';

// Map a legacy status value (cloudcore contract) into the V2 taxonomy.
function legacyStatusToV2(status: string): {
  lead_status: LeadStatus;
  pipeline_stage: PipelineStage;
  lead_temperature: LeadTemperature;
} {
  switch (status) {
    case 'converted':
      return { lead_status: 'closed', pipeline_stage: 'order_won', lead_temperature: 'warm' };
    case 'lost':
      return { lead_status: 'closed', pipeline_stage: 'closed_lost', lead_temperature: 'cold' };
    case 'hot':
      return { lead_status: 'follow_up_scheduled', pipeline_stage: 'new_inquiry', lead_temperature: 'hot' };
    case 'cold':
      return { lead_status: 'nurture_later', pipeline_stage: 'new_inquiry', lead_temperature: 'cold' };
    case 'follow_up':
      return { lead_status: 'follow_up_scheduled', pipeline_stage: 'new_inquiry', lead_temperature: 'warm' };
    default:
      return { lead_status: 'new_contact_pending', pipeline_stage: 'new_inquiry', lead_temperature: 'warm' };
  }
}

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

  const v2 = legacyStatusToV2(parsed.data.status);
  return db.createLead({
    name: parsed.data.name,
    contact: parsed.data.contact,
    source: parsed.data.source,
    lead_type: parsed.data.leadType,
    assigned_staff: parsed.data.assignedStaff || null,
    lead_status: v2.lead_status,
    pipeline_stage: v2.pipeline_stage,
    lead_temperature: v2.lead_temperature,
    factory_visit_status: "not_discussed",
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
  if (parsed.data.status) {
    const v2 = legacyStatusToV2(parsed.data.status);
    updates.lead_status = v2.lead_status;
    updates.lead_temperature = v2.lead_temperature;
  }
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
