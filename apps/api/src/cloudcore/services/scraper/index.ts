/**
 * Web Scraper Service
 * Fetches and extracts content from websites for knowledge base ingestion
 */

import * as cheerio from 'cheerio';
import type { CloudCoreResult } from '../../types';

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  links: string[];
  scrapedAt: string;
}

export interface ScrapeOptions {
  /** Maximum pages to crawl (default: 10) */
  maxPages?: number;
  /** Maximum depth to crawl (default: 2) */
  maxDepth?: number;
  /** Delay between requests in ms (default: 1000) */
  delayMs?: number;
  /** Only crawl pages under this path */
  pathPrefix?: string;
  /** CSS selectors to exclude (e.g., 'nav, footer, .sidebar') */
  excludeSelectors?: string;
  /** CSS selector for main content (default: 'main, article, .content, body') */
  contentSelector?: string;
}

const DEFAULT_OPTIONS: Required<ScrapeOptions> = {
  maxPages: 10,
  maxDepth: 2,
  delayMs: 1000,
  pathPrefix: '',
  excludeSelectors: 'nav, header, footer, aside, .sidebar, .menu, .navigation, script, style, noscript',
  contentSelector: 'main, article, .content, #content, .main-content, body',
};

/**
 * Extract text content from HTML
 */
function extractContent($: cheerio.CheerioAPI, options: Required<ScrapeOptions>): string {
  // Remove excluded elements
  $(options.excludeSelectors).remove();

  // Try to find main content area
  const selectors = options.contentSelector.split(',').map((s) => s.trim());
  let content = '';

  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      content = element.text();
      break;
    }
  }

  // Clean up whitespace
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return content;
}

/**
 * Extract all links from a page
 */
function extractLinks($: cheerio.CheerioAPI, baseUrl: string, pathPrefix: string): string[] {
  const links: Set<string> = new Set();
  const base = new URL(baseUrl);

  $('a[href]').each((_, element) => {
    try {
      const href = $(element).attr('href');
      if (!href) return;

      // Skip non-http links
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
        return;
      }

      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl);

      // Only include same-domain links
      if (absoluteUrl.hostname !== base.hostname) {
        return;
      }

      // Check path prefix filter
      if (pathPrefix && !absoluteUrl.pathname.startsWith(pathPrefix)) {
        return;
      }

      // Remove hash and query for deduplication
      absoluteUrl.hash = '';
      const cleanUrl = absoluteUrl.toString();

      links.add(cleanUrl);
    } catch {
      // Invalid URL, skip
    }
  });

  return Array.from(links);
}

/**
 * Fetch and parse a single page
 */
async function scrapePage(
  url: string,
  options: Required<ScrapeOptions>
): Promise<CloudCoreResult<ScrapedPage>> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MaiyuriBricks-KnowledgeBot/1.0 (Knowledge Base Crawler)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: {
          code: 'FETCH_ERROR',
          message: `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
        },
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return {
        success: false,
        data: null,
        error: {
          code: 'NOT_HTML',
          message: `URL ${url} is not HTML (${contentType})`,
        },
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('title').text().trim() || $('h1').first().text().trim() || url;
    const content = extractContent($, options);
    const links = extractLinks($, url, options.pathPrefix);

    return {
      success: true,
      data: {
        url,
        title,
        content,
        links,
        scrapedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: {
        code: 'SCRAPE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error during scrape',
      },
    };
  }
}

/**
 * Crawl a website starting from a URL
 */
export async function crawlWebsite(
  startUrl: string,
  options: ScrapeOptions = {}
): Promise<CloudCoreResult<ScrapedPage[]>> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const visited = new Set<string>();
  const results: ScrapedPage[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

  // Normalize start URL
  try {
    const normalized = new URL(startUrl);
    normalized.hash = '';
    queue[0].url = normalized.toString();
  } catch {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_URL',
        message: `Invalid start URL: ${startUrl}`,
      },
    };
  }

  while (queue.length > 0 && results.length < opts.maxPages) {
    const { url, depth } = queue.shift()!;

    // Skip if already visited
    if (visited.has(url)) continue;
    visited.add(url);

    console.log(`[Scraper] Crawling (depth=${depth}): ${url}`);

    const result = await scrapePage(url, opts);

    if (result.success && result.data) {
      // Only include pages with meaningful content
      if (result.data.content.length > 100) {
        results.push(result.data);
      }

      // Add child links to queue if not at max depth
      if (depth < opts.maxDepth) {
        for (const link of result.data.links) {
          if (!visited.has(link) && results.length + queue.length < opts.maxPages * 2) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }
    }

    // Respect rate limiting
    if (queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
  }

  return {
    success: true,
    data: results,
    meta: {
      processingTime: Date.now() - startTime,
      pagesScraped: results.length,
      pagesVisited: visited.size,
    },
  };
}

/**
 * Scrape a single URL (no crawling)
 */
export async function scrapeUrl(
  url: string,
  options: ScrapeOptions = {}
): Promise<CloudCoreResult<ScrapedPage>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return scrapePage(url, opts);
}

export default {
  crawlWebsite,
  scrapeUrl,
};
