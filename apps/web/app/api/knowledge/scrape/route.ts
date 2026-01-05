import { NextRequest } from 'next/server';
import { kernels } from '@maiyuri/api';
import { success, error } from '@/lib/api-utils';
import { z } from 'zod';

const ScrapeRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  maxPages: z.number().min(1).max(50).optional().default(10),
  maxDepth: z.number().min(0).max(5).optional().default(2),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  pathPrefix: z.string().optional(),
});

// POST /api/knowledge/scrape - Scrape website and ingest into knowledge base
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = ScrapeRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return error(validationResult.error.errors[0].message, 400);
    }

    const { url, maxPages, maxDepth, category, tags, pathPrefix } = validationResult.data;

    console.log(`[API] Starting scrape of ${url} (maxPages=${maxPages}, maxDepth=${maxDepth})`);

    const result = await kernels.knowledgeCurator.scrapeWebsite(url, {
      maxPages,
      maxDepth,
      category,
      tags,
      pathPrefix,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Scraping failed', 500);
    }

    return success({
      pagesScraped: result.data.pagesScraped,
      entriesCreated: result.data.entriesCreated,
      errors: result.data.errors,
      entries: result.data.entries.map((e) => ({
        id: e.id,
        question: e.question,
        answer: e.answer.slice(0, 200) + (e.answer.length > 200 ? '...' : ''),
      })),
    });
  } catch (err) {
    console.error('Error in scrape API:', err);
    return error('Internal server error', 500);
  }
}

// GET /api/knowledge/scrape?url= - Scrape single URL
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
      return error('URL parameter is required', 400);
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return error('Invalid URL format', 400);
    }

    const category = searchParams.get('category') || undefined;
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || undefined;

    const result = await kernels.knowledgeCurator.scrapeUrl(url, {
      category,
      tags,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Scraping failed', 500);
    }

    return success({
      entry: {
        id: result.data.id,
        question: result.data.question,
        answer: result.data.answer,
      },
    });
  } catch (err) {
    console.error('Error in single URL scrape API:', err);
    return error('Internal server error', 500);
  }
}
