/**
 * KPI Route Handlers
 */

import * as kpiScorer from '../kernels/kpi-scorer';
import * as contracts from '../contracts';
import type {
  CloudCoreResult,
  LeadKPIResponse,
  StaffKPIResponse,
  BusinessKPIResponse,
  KPIDashboardResponse,
} from '../types';

/**
 * Get lead KPI scores
 */
export async function getLeadKPI(
  data: contracts.LeadKPIRequest
): Promise<CloudCoreResult<LeadKPIResponse>> {
  const parsed = contracts.LeadKPIRequestSchema.safeParse(data);
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

  return kpiScorer.calculateLeadKPI(parsed.data);
}

/**
 * Get staff KPI scores
 */
export async function getStaffKPI(
  data: contracts.StaffKPIRequest
): Promise<CloudCoreResult<StaffKPIResponse>> {
  const parsed = contracts.StaffKPIRequestSchema.safeParse(data);
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

  return kpiScorer.calculateStaffKPI(parsed.data);
}

/**
 * Get business KPI scores
 */
export async function getBusinessKPI(
  data: contracts.BusinessKPIRequest
): Promise<CloudCoreResult<BusinessKPIResponse>> {
  const parsed = contracts.BusinessKPIRequestSchema.safeParse(data);
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

  return kpiScorer.calculateBusinessKPI(parsed.data);
}

/**
 * Get complete KPI dashboard
 */
export async function getDashboard(): Promise<CloudCoreResult<KPIDashboardResponse>> {
  return kpiScorer.getDashboardKPIs();
}

export default {
  getLeadKPI,
  getStaffKPI,
  getBusinessKPI,
  getDashboard,
};
