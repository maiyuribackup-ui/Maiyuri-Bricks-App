/**
 * LeadActivityTimeline Component Tests
 *
 * Critical tests for the activity timeline that displays notes, calls, and Odoo syncs.
 * Tests null safety and proper rendering of various activity types.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadActivityTimeline } from "./LeadActivityTimeline";
import type { Note, CallRecording } from "@maiyuri/shared";

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
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// Factory for creating test notes
function createTestNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Date.now()}-${Math.random()}`,
    lead_id: "lead-123",
    text: "Test note content",
    source_type: "manual",
    confidence_score: null,
    ai_summary: null,
    created_at: "2026-01-17T10:00:00Z",
    updated_at: "2026-01-17T10:00:00Z",
    ...overrides,
  };
}

// Factory for creating test call recordings
function createTestCallRecording(
  overrides: Partial<CallRecording> = {},
): CallRecording {
  return {
    id: `call-${Date.now()}-${Math.random()}`,
    lead_id: "lead-123",
    file_path: "/recordings/test.mp3",
    duration_seconds: 120,
    transcription: "Test transcription",
    ai_summary: null,
    sentiment_score: null,
    created_at: "2026-01-17T10:00:00Z",
    updated_at: "2026-01-17T10:00:00Z",
    ...overrides,
  };
}

describe("LeadActivityTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful empty sync logs fetch
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ recentLogs: [] }),
    } as Response);
  });

  describe("Empty State", () => {
    it("should render empty state when no activities", () => {
      renderWithProviders(
        <LeadActivityTimeline
          notes={[]}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
    });

    it("should render without crashing with empty arrays", () => {
      expect(() =>
        renderWithProviders(
          <LeadActivityTimeline
            notes={[]}
            callRecordings={[]}
            leadId="lead-123"
          />,
        ),
      ).not.toThrow();
    });
  });

  describe("Notes Display", () => {
    it("should render notes correctly", () => {
      const notes = [
        createTestNote({ text: "First note content", id: "note-1" }),
        createTestNote({ text: "Second note content", id: "note-2" }),
      ];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText("First note content")).toBeInTheDocument();
      expect(screen.getByText("Second note content")).toBeInTheDocument();
    });

    it("should display confidence badge when present", () => {
      const notes = [createTestNote({ confidence_score: 0.85 })];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText("85% confidence")).toBeInTheDocument();
    });

    it("should display AI summary when present", () => {
      const notes = [
        createTestNote({ ai_summary: "Customer interested in bulk order" }),
      ];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(
        screen.getByText("Customer interested in bulk order"),
      ).toBeInTheDocument();
    });

    it("should handle long note text with show more/less", () => {
      const longText =
        "This is a very long note that exceeds 200 characters. ".repeat(10);
      const notes = [createTestNote({ text: longText })];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText("Show more")).toBeInTheDocument();
    });
  });

  describe("Null Safety", () => {
    it("should handle notes with null confidence_score", () => {
      const notes = [createTestNote({ confidence_score: null })];

      expect(() =>
        renderWithProviders(
          <LeadActivityTimeline
            notes={notes}
            callRecordings={[]}
            leadId="lead-123"
          />,
        ),
      ).not.toThrow();
    });

    it("should handle notes with undefined ai_summary", () => {
      const notes = [createTestNote({ ai_summary: undefined as any })];

      expect(() =>
        renderWithProviders(
          <LeadActivityTimeline
            notes={notes}
            callRecordings={[]}
            leadId="lead-123"
          />,
        ),
      ).not.toThrow();
    });

    it("should handle call recordings with null values", () => {
      const recordings = [
        createTestCallRecording({
          transcription: null as any,
          ai_summary: null,
          sentiment_score: null,
        }),
      ];

      expect(() =>
        renderWithProviders(
          <LeadActivityTimeline
            notes={[]}
            callRecordings={recordings}
            leadId="lead-123"
          />,
        ),
      ).not.toThrow();
    });
  });

  describe("Activity Count", () => {
    it("should display correct item count for notes only", () => {
      const notes = [
        createTestNote({ id: "n1" }),
        createTestNote({ id: "n2" }),
        createTestNote({ id: "n3" }),
      ];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText("3 items")).toBeInTheDocument();
    });

    it("should display correct item count for mixed activities", () => {
      const notes = [
        createTestNote({ id: "n1" }),
        createTestNote({ id: "n2" }),
      ];
      const recordings = [createTestCallRecording({ id: "c1" })];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={recordings}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText("3 items")).toBeInTheDocument();
    });

    it('should display singular "item" for single activity', () => {
      const notes = [createTestNote()];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText("1 item")).toBeInTheDocument();
    });
  });

  describe("Filter Functionality", () => {
    it("should filter to show only notes", async () => {
      const notes = [createTestNote({ text: "Note content" })];
      const recordings = [createTestCallRecording()];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={recordings}
          leadId="lead-123"
        />,
      );

      const filterSelect = screen.getByRole("combobox");
      fireEvent.change(filterSelect, { target: { value: "notes" } });

      expect(screen.getByText("Note content")).toBeInTheDocument();
    });

    it("should show empty message when filter has no results", async () => {
      const notes = [createTestNote()];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      const filterSelect = screen.getByRole("combobox");
      fireEvent.change(filterSelect, { target: { value: "calls" } });

      expect(screen.getByText("No call recordings yet.")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("should show loading spinner when loading is true", () => {
      renderWithProviders(
        <LeadActivityTimeline
          notes={[]}
          callRecordings={[]}
          leadId="lead-123"
          loading={true}
        />,
      );

      // The Spinner component should be rendered
      expect(
        document.querySelector('[class*="animate-spin"]'),
      ).toBeInTheDocument();
    });
  });

  describe("Action Buttons", () => {
    it("should render Add Note button when onAddNote is provided", () => {
      const onAddNote = vi.fn();

      renderWithProviders(
        <LeadActivityTimeline
          notes={[]}
          callRecordings={[]}
          leadId="lead-123"
          onAddNote={onAddNote}
        />,
      );

      expect(screen.getByText("Add Note")).toBeInTheDocument();
    });

    it("should call onAddNote when Add Note button is clicked", () => {
      const onAddNote = vi.fn();

      renderWithProviders(
        <LeadActivityTimeline
          notes={[]}
          callRecordings={[]}
          leadId="lead-123"
          onAddNote={onAddNote}
        />,
      );

      fireEvent.click(screen.getByText("Add Note"));
      expect(onAddNote).toHaveBeenCalledTimes(1);
    });

    it("should show Cancel text when showNoteForm is true", () => {
      const onAddNote = vi.fn();

      renderWithProviders(
        <LeadActivityTimeline
          notes={[]}
          callRecordings={[]}
          leadId="lead-123"
          onAddNote={onAddNote}
          showNoteForm={true}
        />,
      );

      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
  });

  describe("Date Grouping", () => {
    it("should group activities by date", () => {
      const today = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString();

      const notes = [
        createTestNote({ id: "n1", created_at: today }),
        createTestNote({ id: "n2", created_at: yesterday }),
      ];

      renderWithProviders(
        <LeadActivityTimeline
          notes={notes}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("Yesterday")).toBeInTheDocument();
    });
  });

  describe("Odoo Sync Integration", () => {
    it("should fetch and display Odoo sync logs", async () => {
      const mockSyncLogs = [
        {
          id: "sync-1",
          lead_id: "lead-123",
          sync_type: "quote_pull",
          status: "success",
          odoo_response: {
            quotes: [{ number: "Q001", amount: 50000 }],
          },
          created_at: new Date().toISOString(),
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ recentLogs: mockSyncLogs }),
      } as Response);

      renderWithProviders(
        <LeadActivityTimeline
          notes={[]}
          callRecordings={[]}
          leadId="lead-123"
        />,
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/odoo/sync/lead-123");
      });
    });

    it("should handle failed sync logs fetch gracefully", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      expect(() =>
        renderWithProviders(
          <LeadActivityTimeline
            notes={[]}
            callRecordings={[]}
            leadId="lead-123"
          />,
        ),
      ).not.toThrow();
    });
  });
});
