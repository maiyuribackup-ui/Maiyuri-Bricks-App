/**
 * Archive Curator Kernel
 * Identifies leads that should be archived based on configurable rules
 * Generates suggestions for review before archiving
 */

import { supabase } from '../../services/supabase';
import type {
  CloudCoreResult,
  Lead,
  ArchiveConfig,
  ArchiveSuggestion,
  ArchiveCriteria,
  ArchiveSuggestionsRequest,
  ArchiveSuggestionsResponse,
  BatchArchiveRequest,
  BatchArchiveResponse,
  BatchRestoreRequest,
  BatchRestoreResponse,
  ProcessSuggestionsRequest,
  ProcessSuggestionsResponse,
} from '../../types';

export const KERNEL_CONFIG = {
  name: 'ArchiveCurator',
  description: 'Identifies and manages leads for archiving based on status and activity rules',
  version: '1.0.0',
};

// Default thresholds
const DEFAULT_CONFIG: ArchiveConfig = {
  converted_days: { days: 30, enabled: true },
  lost_days: { days: 14, enabled: true },
  cold_inactivity_days: { days: 30, enabled: true },
};

/**
 * Get archive configuration from database
 */
export async function getArchiveConfig(): Promise<CloudCoreResult<ArchiveConfig>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('archive_config')
      .select('config_key, config_value');

    if (error) {
      console.warn('Archive config not found, using defaults:', error.message);
      return {
        success: true,
        data: DEFAULT_CONFIG,
        meta: { processingTime: Date.now() - startTime },
      };
    }

    const config: ArchiveConfig = { ...DEFAULT_CONFIG };
    for (const row of data || []) {
      const key = row.config_key as keyof ArchiveConfig;
      if (key in config && row.config_value) {
        config[key] = row.config_value;
      }
    }

    return {
      success: true,
      data: config,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting archive config:', error);
    return {
      success: true,
      data: DEFAULT_CONFIG,
      meta: { processingTime: Date.now() - startTime },
    };
  }
}

/**
 * Update archive configuration
 */
export async function updateArchiveConfig(
  config: Partial<ArchiveConfig>,
  userId?: string
): Promise<CloudCoreResult<ArchiveConfig>> {
  const startTime = Date.now();

  try {
    const updates = Object.entries(config).map(([key, value]) => ({
      config_key: key,
      config_value: value,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    }));

    for (const update of updates) {
      const { error } = await supabase
        .from('archive_config')
        .upsert(update, { onConflict: 'config_key' });

      if (error) {
        throw error;
      }
    }

    // Fetch updated config
    const result = await getArchiveConfig();
    return {
      success: true,
      data: result.data || DEFAULT_CONFIG,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error updating archive config:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'UPDATE_CONFIG_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update archive config',
      },
    };
  }
}

/**
 * Generate archive suggestions based on current config
 */
export async function generateSuggestions(
  request: ArchiveSuggestionsRequest = {}
): Promise<CloudCoreResult<ArchiveSuggestionsResponse>> {
  const startTime = Date.now();

  try {
    // Get current config
    const configResult = await getArchiveConfig();
    const config = configResult.data || DEFAULT_CONFIG;

    const now = new Date();
    const suggestions: Omit<ArchiveSuggestion, 'id' | 'lead'>[] = [];
    const criteria: ArchiveCriteria[] = [];

    // Find converted leads past threshold
    if (config.converted_days.enabled) {
      const thresholdDate = new Date(now.getTime() - config.converted_days.days * 24 * 60 * 60 * 1000);

      const { data: convertedLeads, error } = await supabase
        .from('leads')
        .select('id, name, status, updated_at')
        .eq('status', 'converted')
        .eq('is_archived', false)
        .lt('updated_at', thresholdDate.toISOString());

      if (!error && convertedLeads) {
        for (const lead of convertedLeads) {
          const daysSince = Math.floor((now.getTime() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
          suggestions.push({
            lead_id: lead.id,
            suggestion_reason: `Converted ${daysSince} days ago`,
            suggested_at: now.toISOString(),
            ai_confidence: 0.95, // High confidence for status-based rules
            status: 'pending',
          });
        }
        criteria.push({
          type: 'converted',
          days: config.converted_days.days,
          count: convertedLeads.length,
        });
      }
    }

    // Find lost leads past threshold
    if (config.lost_days.enabled) {
      const thresholdDate = new Date(now.getTime() - config.lost_days.days * 24 * 60 * 60 * 1000);

      const { data: lostLeads, error } = await supabase
        .from('leads')
        .select('id, name, status, updated_at')
        .eq('status', 'lost')
        .eq('is_archived', false)
        .lt('updated_at', thresholdDate.toISOString());

      if (!error && lostLeads) {
        for (const lead of lostLeads) {
          const daysSince = Math.floor((now.getTime() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
          suggestions.push({
            lead_id: lead.id,
            suggestion_reason: `Lost ${daysSince} days ago`,
            suggested_at: now.toISOString(),
            ai_confidence: 0.9,
            status: 'pending',
          });
        }
        criteria.push({
          type: 'lost',
          days: config.lost_days.days,
          count: lostLeads.length,
        });
      }
    }

    // Find cold leads with no activity past threshold
    if (config.cold_inactivity_days.enabled) {
      const thresholdDate = new Date(now.getTime() - config.cold_inactivity_days.days * 24 * 60 * 60 * 1000);

      // Get cold leads
      const { data: coldLeads, error: coldError } = await supabase
        .from('leads')
        .select('id, name, status, updated_at')
        .eq('status', 'cold')
        .eq('is_archived', false);

      if (!coldError && coldLeads) {
        // For each cold lead, check last activity (including notes)
        for (const lead of coldLeads) {
          // Get latest note for this lead
          const { data: latestNote } = await supabase
            .from('notes')
            .select('created_at')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          const lastActivity = latestNote?.created_at
            ? new Date(Math.max(new Date(lead.updated_at).getTime(), new Date(latestNote.created_at).getTime()))
            : new Date(lead.updated_at);

          if (lastActivity < thresholdDate) {
            const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
            suggestions.push({
              lead_id: lead.id,
              suggestion_reason: `Cold lead, no activity for ${daysSince} days`,
              suggested_at: now.toISOString(),
              ai_confidence: 0.85,
              status: 'pending',
            });
          }
        }

        // Count for criteria
        const coldInactiveCount = suggestions.filter(s =>
          s.suggestion_reason.includes('Cold lead')
        ).length;

        if (coldInactiveCount > 0) {
          criteria.push({
            type: 'cold_inactive',
            days: config.cold_inactivity_days.days,
            count: coldInactiveCount,
          });
        }
      }
    }

    // Insert new suggestions
    if (suggestions.length > 0) {
      const leadIds = suggestions.map(s => s.lead_id);

      // Clear existing pending suggestions for these leads
      const { error: deleteError } = await supabase
        .from('archive_suggestions')
        .delete()
        .in('lead_id', leadIds)
        .eq('status', 'pending');

      if (deleteError) {
        console.warn('Error clearing old suggestions:', deleteError.message);
      }

      // Insert new suggestions
      const { error: insertError } = await supabase
        .from('archive_suggestions')
        .insert(
          suggestions.map(s => ({
            lead_id: s.lead_id,
            suggestion_reason: s.suggestion_reason,
            suggested_at: s.suggested_at,
            ai_confidence: s.ai_confidence,
            status: s.status,
          }))
        );

      if (insertError) {
        console.warn('Error inserting suggestions:', insertError.message);
      }
    }

    // Fetch full suggestions with lead data
    const { data: fullSuggestions, error: fetchError } = await supabase
      .from('archive_suggestions')
      .select(`
        id,
        lead_id,
        suggestion_reason,
        suggested_at,
        ai_confidence,
        status,
        processed_at,
        processed_by,
        leads:lead_id (
          id, name, contact, source, lead_type, status,
          ai_score, updated_at, created_at
        )
      `)
      .eq('status', 'pending')
      .order('ai_confidence', { ascending: false });

    if (fetchError) {
      throw fetchError;
    }

    // Transform response
    const transformedSuggestions: ArchiveSuggestion[] = (fullSuggestions || []).map(s => ({
      id: s.id,
      lead_id: s.lead_id,
      suggestion_reason: s.suggestion_reason,
      suggested_at: s.suggested_at,
      ai_confidence: s.ai_confidence,
      status: s.status as 'pending' | 'accepted' | 'dismissed',
      processed_at: s.processed_at,
      processed_by: s.processed_by,
      lead: s.leads as unknown as Lead,
    }));

    return {
      success: true,
      data: {
        suggestions: transformedSuggestions,
        criteria,
        total_candidates: transformedSuggestions.length,
        generated_at: now.toISOString(),
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error generating archive suggestions:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GENERATE_SUGGESTIONS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate archive suggestions',
      },
    };
  }
}

/**
 * Get pending archive suggestions
 */
export async function getSuggestions(): Promise<CloudCoreResult<ArchiveSuggestionsResponse>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('archive_suggestions')
      .select(`
        id,
        lead_id,
        suggestion_reason,
        suggested_at,
        ai_confidence,
        status,
        processed_at,
        processed_by,
        leads:lead_id (
          id, name, contact, source, lead_type, status,
          ai_score, updated_at, created_at
        )
      `)
      .eq('status', 'pending')
      .order('ai_confidence', { ascending: false });

    if (error) {
      throw error;
    }

    const suggestions: ArchiveSuggestion[] = (data || []).map(s => ({
      id: s.id,
      lead_id: s.lead_id,
      suggestion_reason: s.suggestion_reason,
      suggested_at: s.suggested_at,
      ai_confidence: s.ai_confidence,
      status: s.status as 'pending' | 'accepted' | 'dismissed',
      processed_at: s.processed_at,
      processed_by: s.processed_by,
      lead: s.leads as unknown as Lead,
    }));

    // Get criteria counts
    const convertedCount = suggestions.filter(s => s.suggestion_reason.includes('Converted')).length;
    const lostCount = suggestions.filter(s => s.suggestion_reason.includes('Lost')).length;
    const coldCount = suggestions.filter(s => s.suggestion_reason.includes('Cold lead')).length;

    const criteria: ArchiveCriteria[] = [];
    if (convertedCount > 0) criteria.push({ type: 'converted', days: 30, count: convertedCount });
    if (lostCount > 0) criteria.push({ type: 'lost', days: 14, count: lostCount });
    if (coldCount > 0) criteria.push({ type: 'cold_inactive', days: 30, count: coldCount });

    return {
      success: true,
      data: {
        suggestions,
        criteria,
        total_candidates: suggestions.length,
        generated_at: new Date().toISOString(),
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting archive suggestions:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_SUGGESTIONS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get archive suggestions',
      },
    };
  }
}

/**
 * Process suggestions (accept or dismiss)
 */
export async function processSuggestions(
  request: ProcessSuggestionsRequest
): Promise<CloudCoreResult<ProcessSuggestionsResponse>> {
  const startTime = Date.now();

  try {
    const now = new Date().toISOString();

    if (request.action === 'accept') {
      // Get lead IDs from suggestions
      const { data: suggestions, error: fetchError } = await supabase
        .from('archive_suggestions')
        .select('lead_id')
        .in('id', request.suggestion_ids)
        .eq('status', 'pending');

      if (fetchError) {
        throw fetchError;
      }

      const leadIds = (suggestions || []).map(s => s.lead_id);

      // Archive the leads
      if (leadIds.length > 0) {
        const { error: archiveError } = await supabase
          .from('leads')
          .update({
            is_archived: true,
            archived_at: now,
            archived_by: request.user_id || null,
            archive_reason: 'Archived via smart suggestions',
          })
          .in('id', leadIds);

        if (archiveError) {
          throw archiveError;
        }
      }

      // Update suggestions status
      const { error: updateError } = await supabase
        .from('archive_suggestions')
        .update({
          status: 'accepted',
          processed_at: now,
          processed_by: request.user_id || null,
        })
        .in('id', request.suggestion_ids);

      if (updateError) {
        throw updateError;
      }

      return {
        success: true,
        data: {
          processed_count: request.suggestion_ids.length,
          archived_count: leadIds.length,
        },
        meta: { processingTime: Date.now() - startTime },
      };
    } else {
      // Dismiss suggestions
      const { error } = await supabase
        .from('archive_suggestions')
        .update({
          status: 'dismissed',
          processed_at: now,
          processed_by: request.user_id || null,
        })
        .in('id', request.suggestion_ids);

      if (error) {
        throw error;
      }

      return {
        success: true,
        data: {
          processed_count: request.suggestion_ids.length,
        },
        meta: { processingTime: Date.now() - startTime },
      };
    }
  } catch (error) {
    console.error('Error processing suggestions:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'PROCESS_SUGGESTIONS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to process suggestions',
      },
    };
  }
}

/**
 * Batch archive leads
 */
export async function batchArchive(
  request: BatchArchiveRequest
): Promise<CloudCoreResult<BatchArchiveResponse>> {
  const startTime = Date.now();

  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('leads')
      .update({
        is_archived: true,
        archived_at: now,
        archived_by: request.archived_by || null,
        archive_reason: request.reason || 'Manually archived',
      })
      .in('id', request.lead_ids)
      .eq('is_archived', false)
      .select('id');

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: {
        archived_count: data?.length || 0,
        lead_ids: (data || []).map(l => l.id),
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error batch archiving leads:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'BATCH_ARCHIVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to batch archive leads',
      },
    };
  }
}

/**
 * Batch restore leads
 */
export async function batchRestore(
  request: BatchRestoreRequest
): Promise<CloudCoreResult<BatchRestoreResponse>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({
        is_archived: false,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .in('id', request.lead_ids)
      .eq('is_archived', true)
      .select('id');

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: {
        restored_count: data?.length || 0,
        lead_ids: (data || []).map(l => l.id),
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error batch restoring leads:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'BATCH_RESTORE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to batch restore leads',
      },
    };
  }
}

export default {
  KERNEL_CONFIG,
  getArchiveConfig,
  updateArchiveConfig,
  generateSuggestions,
  getSuggestions,
  processSuggestions,
  batchArchive,
  batchRestore,
};
