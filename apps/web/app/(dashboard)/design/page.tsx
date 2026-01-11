'use client';

/**
 * Design Page
 *
 * AI-powered floor plan design chatbot that guides users through
 * creating custom floor plans for residential, compound wall, or commercial projects.
 *
 * Features:
 * - Conversational UI for collecting requirements
 * - Smart defaults based on plot size and local building practices
 * - Real-time floor plan generation with progress updates
 * - Iterative modifications based on user feedback
 */

import { FloorPlanChatbot } from '@/components/FloorPlanChatbot';
import type { GeneratedImages, DesignContextSummary } from '@/components/FloorPlanChatbot/types';

export default function DesignPage() {
  const handleDesignComplete = (images: GeneratedImages, context: DesignContextSummary) => {
    // Could show detailed view or trigger download
    console.log('Design complete:', { images, context });
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative max-w-4xl mx-auto px-4 py-6">
        {/* Page Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-3">
            <span className="text-4xl">🏠</span>
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              AI Floor Plan Designer
            </span>
          </h1>
          <p className="text-slate-400 mt-2">
            Chat with our AI architect to design your dream home
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          <span className="px-3 py-1 bg-amber-500/10 text-amber-400 text-xs font-medium rounded-full border border-amber-500/20">
            Vastu Compliant
          </span>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full border border-emerald-500/20">
            Eco-Friendly
          </span>
          <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-medium rounded-full border border-blue-500/20">
            Tamil Nadu Style
          </span>
          <span className="px-3 py-1 bg-purple-500/10 text-purple-400 text-xs font-medium rounded-full border border-purple-500/20">
            AI-Powered
          </span>
        </div>

        {/* Main Chatbot */}
        <FloorPlanChatbot
          className="h-[calc(100vh-240px)]"
          onDesignComplete={handleDesignComplete}
        />

        {/* Footer */}
        <div className="text-center mt-4 text-xs text-slate-500">
          Powered by Maiyuri Bricks AI - Your partner in sustainable building
        </div>
      </div>
    </div>
  );
}
