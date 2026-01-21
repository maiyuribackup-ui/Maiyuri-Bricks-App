"use client";

import { useState } from "react";
import {
  Search,
  ChevronRight,
  Lightbulb,
  PlayCircle,
  BookOpen,
  Home,
  Users,
  Brain,
  Palette,
  ListTodo,
  BarChart3,
  CheckCircle,
  Settings,
  Factory,
  Truck,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { getAllSections, type ManualContent } from "@/lib/user-manual";

// Section icons mapping
const sectionIcons: Record<string, React.ReactNode> = {
  "getting-started": <BookOpen className="h-5 w-5" />,
  dashboard: <Home className="h-5 w-5" />,
  leads: <Users className="h-5 w-5" />,
  "lead-detail": <Users className="h-5 w-5" />,
  "lead-new": <Users className="h-5 w-5" />,
  "lead-edit": <Users className="h-5 w-5" />,
  knowledge: <Brain className="h-5 w-5" />,
  coaching: <Lightbulb className="h-5 w-5" />,
  design: <Palette className="h-5 w-5" />,
  tasks: <ListTodo className="h-5 w-5" />,
  kpi: <BarChart3 className="h-5 w-5" />,
  approvals: <CheckCircle className="h-5 w-5" />,
  settings: <Settings className="h-5 w-5" />,
  production: <Factory className="h-5 w-5" />,
  deliveries: <Truck className="h-5 w-5" />,
  "smart-quote": <FileText className="h-5 w-5" />,
};

// Group sections by category
const sectionGroups = [
  {
    title: "Getting Started",
    sections: ["getting-started", "dashboard"],
  },
  {
    title: "Lead Management",
    sections: ["leads", "lead-detail", "lead-new", "lead-edit"],
  },
  {
    title: "AI & Knowledge",
    sections: ["knowledge", "coaching"],
  },
  {
    title: "Operations",
    sections: ["production", "deliveries", "smart-quote"],
  },
  {
    title: "Tools & Settings",
    sections: ["design", "tasks", "kpi", "approvals", "settings"],
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const allSections = getAllSections();

  // Filter sections based on search
  const filteredSections = allSections.filter(
    (section: ManualContent) =>
      section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.quickStart.some((item: string) =>
        item.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  const selectedContent = selectedSection
    ? allSections.find((s: ManualContent) => s.id === selectedSection)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-8 dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            User Manual
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Step-by-step guides to help you get the most out of Maiyuri Bricks
          </p>

          {/* Search */}
          <div className="relative mt-6 max-w-md">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search help topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {selectedSection ? (
          // Section Detail View
          <SectionDetail
            content={selectedContent!}
            onBack={() => setSelectedSection(null)}
          />
        ) : searchQuery ? (
          // Search Results
          <SearchResults
            results={filteredSections}
            onSelect={setSelectedSection}
          />
        ) : (
          // Section List by Category
          <SectionList
            groups={sectionGroups}
            sections={allSections}
            onSelect={setSelectedSection}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SECTION LIST
// ============================================================================

interface SectionListProps {
  groups: { title: string; sections: string[] }[];
  sections: ManualContent[];
  onSelect: (id: string) => void;
}

function SectionList({ groups, sections, onSelect }: SectionListProps) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            {group.title}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.sections.map((sectionId) => {
              const section = sections.find((s) => s.id === sectionId);
              if (!section) return null;

              return (
                <button
                  key={section.id}
                  onClick={() => onSelect(section.id)}
                  className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    {sectionIcons[section.id] || (
                      <BookOpen className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {section.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {section.description}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// SEARCH RESULTS
// ============================================================================

interface SearchResultsProps {
  results: ManualContent[];
  onSelect: (id: string) => void;
}

function SearchResults({ results, onSelect }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="py-12 text-center">
        <Search className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">
          No results found. Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {results.length} result{results.length !== 1 ? "s" : ""} found
      </p>
      <div className="space-y-3">
        {results.map((section) => (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            className="flex w-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              {sectionIcons[section.id] || <BookOpen className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-white">
                {section.title}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {section.description}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SECTION DETAIL
// ============================================================================

interface SectionDetailProps {
  content: ManualContent;
  onBack: () => void;
}

function SectionDetail({ content, onBack }: SectionDetailProps) {
  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        Back to all topics
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {sectionIcons[content.id] || <BookOpen className="h-6 w-6" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {content.title}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {content.description}
            </p>
          </div>
        </div>

        {/* Go to page link */}
        {content.path !== "/" && (
          <Link
            href={content.path}
            className="mt-4 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Go to {content.title} page
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Quick Start */}
      <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-900 dark:text-blue-100">
          <PlayCircle className="h-5 w-5" />
          Quick Start
        </h2>
        <div className="space-y-3">
          {content.quickStart.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="text-blue-800 dark:text-blue-200">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step by Step */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <ChevronRight className="h-5 w-5" />
          Step-by-Step Guide
        </h2>
        <div className="space-y-4">
          {content.steps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {step.action}
                  </p>
                  {step.result && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-green-600 dark:text-green-400">
                        Result:
                      </span>{" "}
                      {step.result}
                    </p>
                  )}
                  {step.tip && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                      <Lightbulb className="h-4 w-4" />
                      {step.tip}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      {content.tips && content.tips.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-amber-900 dark:text-amber-100">
            <Lightbulb className="h-5 w-5" />
            Pro Tips
          </h2>
          <ul className="space-y-3">
            {content.tips.map((tip, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-amber-800 dark:text-amber-200"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
