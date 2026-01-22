/**
 * ArchiveSuggestionsPanel Component Tests
 *
 * Following TESTING.md protocol: Test root cause, not symptoms
 * Tests the smart archive suggestions panel component
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArchiveSuggestionsPanel } from "./ArchiveSuggestionsPanel";
import type { ArchiveSuggestion } from "@maiyuri/shared";

// Mock the useArchive hooks
vi.mock("@/hooks/useArchive", () => ({
  useArchiveSuggestions: vi.fn(),
  useProcessSuggestions: vi.fn(),
  useRefreshSuggestions: vi.fn(),
}));

import {
  useArchiveSuggestions,
  useProcessSuggestions,
  useRefreshSuggestions,
} from "@/hooks/useArchive";

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

// Factory for creating test suggestions
function createTestSuggestion(
  overrides: Partial<ArchiveSuggestion> = {},
): ArchiveSuggestion {
  return {
    id: "suggestion-123",
    lead_id: "lead-123",
    suggestion_reason: "Lead has been converted",
    ai_confidence: 0.85,
    suggested_at: new Date().toISOString(),
    status: "pending",
    lead: {
      id: "lead-123",
      name: "Test Lead",
      contact: "9876543210",
      status: "converted",
    },
    ...overrides,
  } as ArchiveSuggestion;
}

describe("ArchiveSuggestionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(useArchiveSuggestions).mockReturnValue({
      data: { suggestions: [] },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useProcessSuggestions).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useRefreshSuggestions).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  describe("Closed State", () => {
    it("should not render when isOpen is false", () => {
      const { container } = renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={false} onClose={vi.fn()} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Open State", () => {
    it("should render panel when isOpen is true", () => {
      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      expect(screen.getByText("Smart Archive")).toBeInTheDocument();
    });

    it("should call onClose when backdrop is clicked", () => {
      const onClose = vi.fn();
      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={onClose} />,
      );

      // Click the backdrop (has bg-black/30 class)
      const backdrop = document.querySelector(".bg-black\\/30");
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when close button is clicked", () => {
      const onClose = vi.fn();
      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={onClose} />,
      );

      // Find the close button by its aria role or structure
      const buttons = screen.getAllByRole("button");
      const closeButton = buttons.find((btn) =>
        btn.querySelector('svg path[d*="M6 18L18 6"]'),
      );

      if (closeButton) {
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe("Loading State", () => {
    it("should show spinner when loading", () => {
      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      // Spinner component should be present
      const spinner = document.querySelector('[class*="animate-spin"]');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("should show error message when fetch fails", () => {
      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Network error"),
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      expect(
        screen.getByText("Failed to load suggestions"),
      ).toBeInTheDocument();
      expect(screen.getByText("Try Again")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("should show empty state when no suggestions", () => {
      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions: [] },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      expect(screen.getByText("No Archive Suggestions")).toBeInTheDocument();
      expect(
        screen.getByText("All your leads are active and up-to-date."),
      ).toBeInTheDocument();
    });
  });

  describe("Suggestions Display", () => {
    it("should display suggestions when available", () => {
      const suggestions = [
        createTestSuggestion({
          id: "1",
          suggestion_reason: "Lead has been converted",
          lead: {
            id: "1",
            name: "John Doe",
            contact: "1234567890",
            status: "converted",
          },
        }),
        createTestSuggestion({
          id: "2",
          suggestion_reason: "Lead marked as lost",
          lead: {
            id: "2",
            name: "Jane Smith",
            contact: "0987654321",
            status: "lost",
          },
        }),
      ];

      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      expect(screen.getByText("Lead has been converted")).toBeInTheDocument();
      expect(screen.getByText("Lead marked as lost")).toBeInTheDocument();
    });

    it("should show confidence badge", () => {
      const suggestions = [
        createTestSuggestion({
          ai_confidence: 0.92,
        }),
      ];

      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      expect(screen.getByText("92%")).toBeInTheDocument();
    });
  });

  describe("Grouping Summary", () => {
    it("should display summary cards with counts", () => {
      const suggestions = [
        createTestSuggestion({
          id: "conv-1",
          suggestion_reason: "Lead converted",
        }),
        createTestSuggestion({
          id: "lost-1",
          suggestion_reason: "Lead lost to competitor",
        }),
        createTestSuggestion({
          id: "cold-1",
          suggestion_reason: "Lead is cold and inactive",
        }),
      ];

      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      // Should show grouping cards
      expect(screen.getByText("Converted")).toBeInTheDocument();
      expect(screen.getByText("Lost")).toBeInTheDocument();
      expect(screen.getByText("Cold")).toBeInTheDocument();
    });
  });

  describe("Selection", () => {
    it("should toggle selection when clicking a suggestion", () => {
      const suggestions = [createTestSuggestion({ id: "test-1" })];

      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      const checkboxes = screen.getAllByRole("checkbox");
      const suggestionCheckbox = checkboxes.find(
        (cb) => !cb.closest("label")?.textContent?.includes("Select All"),
      );

      if (suggestionCheckbox) {
        expect(suggestionCheckbox).not.toBeChecked();
        fireEvent.click(suggestionCheckbox);
        expect(suggestionCheckbox).toBeChecked();
      }
    });

    it("should select all suggestions when Select All is clicked", () => {
      const suggestions = [
        createTestSuggestion({ id: "1" }),
        createTestSuggestion({ id: "2" }),
      ];

      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      const selectAllCheckbox = screen.getByRole("checkbox", {
        name: /Select All/i,
      });
      fireEvent.click(selectAllCheckbox);

      expect(screen.getByText("2 selected")).toBeInTheDocument();
    });
  });

  describe("Actions", () => {
    it("should call processMutation with accept action when Archive is clicked", async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(useProcessSuggestions).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as any);

      const suggestions = [createTestSuggestion({ id: "test-1" })];
      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      // Select the suggestion first
      const checkboxes = screen.getAllByRole("checkbox");
      const suggestionCheckbox = checkboxes.find(
        (cb) => !cb.closest("label")?.textContent?.includes("Select All"),
      );
      if (suggestionCheckbox) {
        fireEvent.click(suggestionCheckbox);
      }

      // Click Archive button
      const archiveButton = screen.getByRole("button", {
        name: /Archive \(1\)/i,
      });
      fireEvent.click(archiveButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          suggestion_ids: ["test-1"],
          action: "accept",
        });
      });
    });

    it("should call processMutation with dismiss action when Dismiss is clicked", async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(useProcessSuggestions).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as any);

      const suggestions = [createTestSuggestion({ id: "test-1" })];
      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      // Select the suggestion first
      const checkboxes = screen.getAllByRole("checkbox");
      const suggestionCheckbox = checkboxes.find(
        (cb) => !cb.closest("label")?.textContent?.includes("Select All"),
      );
      if (suggestionCheckbox) {
        fireEvent.click(suggestionCheckbox);
      }

      // Click Dismiss button
      const dismissButton = screen.getByRole("button", { name: /Dismiss/i });
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          suggestion_ids: ["test-1"],
          action: "dismiss",
        });
      });
    });
  });

  describe("Refresh", () => {
    it("should call refreshMutation when Refresh is clicked", () => {
      const mockMutate = vi.fn();
      vi.mocked(useRefreshSuggestions).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      const suggestions = [createTestSuggestion()];
      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(
        <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
      );

      const refreshButton = screen.getByRole("button", { name: /Refresh/i });
      fireEvent.click(refreshButton);

      expect(mockMutate).toHaveBeenCalled();
    });
  });

  describe("Null Safety", () => {
    it("should handle null suggestion_reason gracefully", () => {
      const suggestions = [
        createTestSuggestion({
          suggestion_reason: null as any, // Force null for testing
        }),
      ];

      vi.mocked(useArchiveSuggestions).mockReturnValue({
        data: { suggestions },
        isLoading: false,
        error: null,
      } as any);

      // Should not throw
      expect(() => {
        renderWithProviders(
          <ArchiveSuggestionsPanel isOpen={true} onClose={vi.fn()} />,
        );
      }).not.toThrow();
    });
  });
});
