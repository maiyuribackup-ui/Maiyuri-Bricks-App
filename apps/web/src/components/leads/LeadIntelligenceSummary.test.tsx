/**
 * LeadIntelligenceSummary Component Tests
 *
 * Following TESTING.md protocol: Test root cause, not symptoms
 * Tests the decision cockpit component that displays consolidated lead intelligence
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadIntelligenceSummary } from './LeadIntelligenceSummary';
import type { Lead } from '@maiyuri/shared';

// Mock fetch
global.fetch = vi.fn();

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

// Factory for creating test leads
function createTestLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'test-lead-123',
    name: 'Test Lead',
    contact: '9876543210',
    source: 'Website',
    lead_type: 'residential',
    assigned_staff: null,
    status: 'new',
    ai_score: null,
    urgency: null,
    dominant_objection: null,
    best_conversion_lever: null,
    lost_reason: null,
    next_action: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('LeadIntelligenceSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    it('should show generate prompt when no intelligence data exists', () => {
      const lead = createTestLead();
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText('Generate Lead Intelligence')).toBeInTheDocument();
      expect(screen.getByText('Analyze calls and notes to understand this lead')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Analyze' })).toBeInTheDocument();
    });

    it('should trigger analyze mutation when Analyze button is clicked', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { lead: createTestLead({ ai_score: 0.75 }) } }),
      } as Response);

      const lead = createTestLead();
      const onRefresh = vi.fn();
      renderWithProviders(<LeadIntelligenceSummary lead={lead} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/leads/test-lead-123/analyze',
          { method: 'POST' }
        );
      });
    });
  });

  describe('Intelligence Display', () => {
    it('should render score ring with conversion probability', () => {
      const lead = createTestLead({
        ai_score: 0.75,
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('Conversion')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument(); // getScoreLabel(0.75) = "High"
    });

    it('should show correct score labels based on score value', () => {
      // Test various score ranges
      const testCases = [
        { score: 0.85, label: 'Very High' },
        { score: 0.65, label: 'High' },
        { score: 0.45, label: 'Medium' },
        { score: 0.25, label: 'Low' },
        { score: 0.1, label: 'Very Low' },
      ];

      for (const { score, label } of testCases) {
        const lead = createTestLead({ ai_score: score });
        const { unmount } = renderWithProviders(<LeadIntelligenceSummary lead={lead} />);
        expect(screen.getByText(label)).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe('UrgencyBadge', () => {
    it('should render immediate urgency with danger variant', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        urgency: 'immediate',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText('Urgency')).toBeInTheDocument();
      const badge = screen.getByText(/Immediate/);
      expect(badge).toBeInTheDocument();
    });

    it('should render 1-3 months urgency', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        urgency: '1-3_months',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText('1-3 months')).toBeInTheDocument();
    });

    it('should render 3-6 months urgency', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        urgency: '3-6_months',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText('3-6 months')).toBeInTheDocument();
    });

    it('should render unknown urgency', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        urgency: 'unknown',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('ObjectionPill', () => {
    it('should render dominant objection when present', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        dominant_objection: 'Price is too high',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText('Objection')).toBeInTheDocument();
      expect(screen.getByText('Price is too high')).toBeInTheDocument();
    });

    it('should truncate long objection text', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        dominant_objection: 'This is a very long objection that should be truncated in the display',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      // Objection pill has max-w-[150px] and truncate class
      const objectionText = screen.getByText(/This is a very long objection/);
      expect(objectionText).toHaveClass('truncate');
    });
  });

  describe('LeverIndicator', () => {
    const leverTestCases = [
      { lever: 'proof', label: 'Show Proof' },
      { lever: 'price', label: 'Negotiate Price' },
      { lever: 'visit', label: 'Site Visit' },
      { lever: 'relationship', label: 'Build Trust' },
      { lever: 'timeline', label: 'Fast Delivery' },
    ] as const;

    for (const { lever, label } of leverTestCases) {
      it(`should render ${lever} lever as "${label}"`, () => {
        const lead = createTestLead({
          ai_score: 0.5,
          best_conversion_lever: lever,
        });
        renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

        expect(screen.getByText('Best Approach')).toBeInTheDocument();
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    }
  });

  describe('Next Action Recommendation', () => {
    it('should render next action when present', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        next_action: 'Schedule a site visit to show brick quality',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.getByText(/Next:/)).toBeInTheDocument();
      expect(screen.getByText('Schedule a site visit to show brick quality')).toBeInTheDocument();
    });

    it('should not render next action section when not present', () => {
      const lead = createTestLead({
        ai_score: 0.5,
        next_action: null,
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      expect(screen.queryByText(/Next:/)).not.toBeInTheDocument();
    });
  });

  describe('Complete Intelligence Display', () => {
    it('should render all intelligence fields when populated', () => {
      const lead = createTestLead({
        ai_score: 0.72,
        urgency: 'immediate',
        dominant_objection: 'Comparing with competitor',
        best_conversion_lever: 'proof',
        next_action: 'Send sample photos from recent project',
      });
      renderWithProviders(<LeadIntelligenceSummary lead={lead} />);

      // Score
      expect(screen.getByText('72%')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();

      // Urgency
      expect(screen.getByText(/Immediate/)).toBeInTheDocument();

      // Objection
      expect(screen.getByText('Comparing with competitor')).toBeInTheDocument();

      // Lever
      expect(screen.getByText('Show Proof')).toBeInTheDocument();

      // Next Action
      expect(screen.getByText('Send sample photos from recent project')).toBeInTheDocument();
    });
  });

  describe('Refresh Button', () => {
    it('should call onRefresh callback after successful analysis', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { lead: createTestLead({ ai_score: 0.8 }) } }),
      } as Response);

      const lead = createTestLead({ ai_score: 0.5 }); // Has intelligence, shows refresh button
      const onRefresh = vi.fn();
      renderWithProviders(<LeadIntelligenceSummary lead={lead} onRefresh={onRefresh} />);

      // Click the refresh button (ghost variant in the card)
      const refreshButton = screen.getByRole('button');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/leads/test-lead-123/analyze',
          { method: 'POST' }
        );
      });
    });
  });
});
