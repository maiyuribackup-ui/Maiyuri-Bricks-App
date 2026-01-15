/**
 * Lead Intelligence Feature Tests
 * Following TESTING.md protocol: Test root cause, not symptoms
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { updateLeadFromCallInsights } from './index';
import type { CallRecordingInsights, LeadUrgency, ConversionLever } from '../../types';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env from apps/web/.env.local (where Supabase vars are)
config({ path: resolve(__dirname, '../../../../../../apps/web/.env.local') });

// Test configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

describe('Lead Intelligence Feature', () => {
  let supabase: SupabaseClient;
  let testLeadId: string;

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials for testing');
    }
    supabase = createClient(supabaseUrl, supabaseKey);

    // Get a real lead for testing
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .limit(1);

    if (!leads || leads.length === 0) {
      throw new Error('No leads found for testing');
    }
    testLeadId = leads[0].id;
  });

  describe('Database Schema', () => {
    it('should have urgency column with valid CHECK constraint values', async () => {
      const validValues: (LeadUrgency | null)[] = ['immediate', '1-3_months', '3-6_months', 'unknown', null];

      for (const value of validValues) {
        const { error } = await supabase
          .from('leads')
          .update({ urgency: value })
          .eq('id', testLeadId);

        expect(error).toBeNull();
      }
    });

    it('should have best_conversion_lever column with valid CHECK constraint values', async () => {
      const validValues: (ConversionLever | null)[] = ['proof', 'price', 'visit', 'relationship', 'timeline', null];

      for (const value of validValues) {
        const { error } = await supabase
          .from('leads')
          .update({ best_conversion_lever: value })
          .eq('id', testLeadId);

        expect(error).toBeNull();
      }
    });

    it('should have dominant_objection column (TEXT, accepts any string)', async () => {
      const testValues = ['Price too high', 'Need more samples', 'Comparing with competitors', null];

      for (const value of testValues) {
        const { error } = await supabase
          .from('leads')
          .update({ dominant_objection: value })
          .eq('id', testLeadId);

        expect(error).toBeNull();
      }
    });

    it('should have lost_reason column (TEXT, accepts any string)', async () => {
      const { error } = await supabase
        .from('leads')
        .update({ lost_reason: 'Went with competitor' })
        .eq('id', testLeadId);

      expect(error).toBeNull();

      // Reset
      await supabase.from('leads').update({ lost_reason: null }).eq('id', testLeadId);
    });

    it('should reject invalid urgency values', async () => {
      const { error } = await supabase
        .from('leads')
        .update({ urgency: 'invalid_value' as LeadUrgency })
        .eq('id', testLeadId);

      expect(error).not.toBeNull();
      expect(error?.message).toContain('check');
    });

    it('should reject invalid best_conversion_lever values', async () => {
      const { error } = await supabase
        .from('leads')
        .update({ best_conversion_lever: 'invalid_lever' as ConversionLever })
        .eq('id', testLeadId);

      expect(error).not.toBeNull();
      expect(error?.message).toContain('check');
    });
  });

  describe('updateLeadFromCallInsights', () => {
    it('should map urgency_signal to lead urgency', async () => {
      const insights: CallRecordingInsights = {
        urgency_signal: 'immediate',
      };

      const result = await updateLeadFromCallInsights(testLeadId, insights);

      expect(result.success).toBe(true);
      expect(result.data?.urgency).toBe('immediate');
    });

    it('should map key_objection to dominant_objection', async () => {
      const insights: CallRecordingInsights = {
        key_objection: 'Price is 20% higher than competitor',
      };

      const result = await updateLeadFromCallInsights(testLeadId, insights);

      expect(result.success).toBe(true);
      expect(result.data?.dominant_objection).toBe('Price is 20% higher than competitor');
    });

    it('should map primary_intent to best_conversion_lever', async () => {
      const intentMappings: Array<{ intent: CallRecordingInsights['primary_intent']; lever: ConversionLever }> = [
        { intent: 'price_enquiry', lever: 'price' },
        { intent: 'technical_validation', lever: 'proof' },
        { intent: 'site_visit', lever: 'visit' },
        { intent: 'comparison', lever: 'price' },
        { intent: 'research', lever: 'proof' },
        { intent: 'complaint', lever: 'relationship' },
        { intent: 'order_follow_up', lever: 'timeline' },
      ];

      for (const { intent, lever } of intentMappings) {
        const insights: CallRecordingInsights = {
          primary_intent: intent,
        };

        const result = await updateLeadFromCallInsights(testLeadId, insights);

        expect(result.success).toBe(true);
        expect(result.data?.best_conversion_lever).toBe(lever);
      }
    });

    it('should update ai_score when scoreImpact is provided (0-1 scale)', async () => {
      // First set a known score (0.5 = 50%)
      await supabase.from('leads').update({ ai_score: 0.5 }).eq('id', testLeadId);

      const insights: CallRecordingInsights = {
        sentiment: 'positive',
      };

      const result = await updateLeadFromCallInsights(testLeadId, insights, {
        updateAIScore: true,
        scoreImpact: 0.1, // +10%
      });

      expect(result.success).toBe(true);
      expect(result.data?.ai_score).toBe(0.6);
    });

    it('should cap ai_score at 1.0 (100%)', async () => {
      await supabase.from('leads').update({ ai_score: 0.95 }).eq('id', testLeadId);

      const result = await updateLeadFromCallInsights(
        testLeadId,
        {},
        { updateAIScore: true, scoreImpact: 0.2 }
      );

      expect(result.success).toBe(true);
      expect(result.data?.ai_score).toBe(1);
    });

    it('should floor ai_score at 0', async () => {
      await supabase.from('leads').update({ ai_score: 0.1 }).eq('id', testLeadId);

      const result = await updateLeadFromCallInsights(
        testLeadId,
        {},
        { updateAIScore: true, scoreImpact: -0.2 }
      );

      expect(result.success).toBe(true);
      expect(result.data?.ai_score).toBe(0);
    });

    it('should return current lead when no updates needed', async () => {
      const result = await updateLeadFromCallInsights(testLeadId, {});

      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
    });

    it('should handle non-existent lead gracefully', async () => {
      const result = await updateLeadFromCallInsights(
        '00000000-0000-0000-0000-000000000000',
        { urgency_signal: 'immediate' }
      );

      // Should fail gracefully
      expect(result.success).toBe(false);
    });
  });

  afterAll(async () => {
    // Reset test lead to clean state
    if (testLeadId) {
      await supabase.from('leads').update({
        urgency: null,
        dominant_objection: null,
        best_conversion_lever: null,
        lost_reason: null,
      }).eq('id', testLeadId);
    }
  });
});
