'use client';

import { useState, useCallback } from 'react';
import { cn } from '@maiyuri/ui';

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  source: string;
  similarity?: number;
  createdAt: string;
}

export default function KnowledgePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<KnowledgeEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'ingest'>('search');
  const [ingestForm, setIngestForm] = useState({
    title: '',
    content: '',
    category: 'general',
    source: 'manual',
  });

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/knowledge?q=${encodeURIComponent(searchQuery)}&limit=10`
      );
      const data = await response.json();

      if (data.success && data.data) {
        setResults(data.data);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleIngest = useCallback(async () => {
    if (!ingestForm.title.trim() || !ingestForm.content.trim()) return;

    setIsIngesting(true);
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ingestForm.title,
          content: ingestForm.content,
          category: ingestForm.category,
          tags: [ingestForm.source],
        }),
      });
      const data = await response.json();

      if (data.success) {
        setIngestForm({ title: '', content: '', category: 'general', source: 'manual' });
        alert('Knowledge entry added successfully!');
      }
    } catch (err) {
      console.error('Ingestion failed:', err);
    } finally {
      setIsIngesting(false);
    }
  }, [ingestForm]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Search and manage your brick business knowledge
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('search')}
            className={cn(
              'py-4 px-1 border-b-2 font-medium text-sm',
              activeTab === 'search'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400'
            )}
          >
            Search Knowledge
          </button>
          <button
            onClick={() => setActiveTab('ingest')}
            className={cn(
              'py-4 px-1 border-b-2 font-medium text-sm',
              activeTab === 'ingest'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400'
            )}
          >
            Add Knowledge
          </button>
        </nav>
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Input */}
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ask a question about bricks, pricing, or construction..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSearching ? (
                <>
                  <LoadingSpinner />
                  Searching...
                </>
              ) : (
                <>
                  <SearchIcon className="h-5 w-5" />
                  Search
                </>
              )}
            </button>
          </div>

          {/* Search Results */}
          <div className="space-y-4">
            {results.length > 0 ? (
              results.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {entry.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                          {entry.category}
                        </span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          Source: {entry.source}
                        </span>
                      </div>
                    </div>
                    {entry.similarity !== undefined && (
                      <div className="text-right">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {Math.round(entry.similarity * 100)}%
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          match
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {entry.content}
                  </p>
                </div>
              ))
            ) : searchQuery && !isSearching ? (
              <div className="text-center py-12">
                <BookOpenIcon className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                  No results found
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Try a different search query or add new knowledge entries.
                </p>
              </div>
            ) : (
              <div className="text-center py-12">
                <SearchIcon className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                  Search your knowledge base
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Ask questions about brick types, pricing, construction methods, and more.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ingest Tab */}
      {activeTab === 'ingest' && (
        <div className="max-w-2xl">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Title
              </label>
              <input
                type="text"
                value={ingestForm.title}
                onChange={(e) =>
                  setIngestForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g., Standard Brick Dimensions"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Content
              </label>
              <textarea
                value={ingestForm.content}
                onChange={(e) =>
                  setIngestForm((prev) => ({ ...prev, content: e.target.value }))
                }
                rows={6}
                placeholder="Enter the knowledge content here..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Category
                </label>
                <select
                  value={ingestForm.category}
                  onChange={(e) =>
                    setIngestForm((prev) => ({ ...prev, category: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="general">General</option>
                  <option value="products">Products</option>
                  <option value="pricing">Pricing</option>
                  <option value="construction">Construction</option>
                  <option value="specifications">Specifications</option>
                  <option value="faq">FAQ</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Source
                </label>
                <select
                  value={ingestForm.source}
                  onChange={(e) =>
                    setIngestForm((prev) => ({ ...prev, source: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="manual">Manual Entry</option>
                  <option value="document">Document</option>
                  <option value="conversation">Conversation</option>
                  <option value="external">External Source</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleIngest}
              disabled={isIngesting || !ingestForm.title.trim() || !ingestForm.content.trim()}
              className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isIngesting ? (
                <>
                  <LoadingSpinner />
                  Adding...
                </>
              ) : (
                <>
                  <PlusIcon className="h-5 w-5" />
                  Add to Knowledge Base
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Icon components
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
