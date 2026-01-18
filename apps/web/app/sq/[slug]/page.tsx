import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SmartQuoteView } from "@/components/smart-quote";
import type { SmartQuoteWithImages } from "@maiyuri/shared";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Get base URL for API calls
 * Priority: NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost
 */
function getBaseUrl(): string {
  // Explicit app URL (highest priority)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Vercel deployment URL (production/preview)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Local development fallback
  return "http://localhost:3000";
}

/**
 * Fetch Smart Quote data by slug
 */
async function getSmartQuote(
  slug: string,
): Promise<SmartQuoteWithImages | null> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/sq/${slug}`, {
      cache: "no-store", // Always fetch fresh data
    });

    if (!response.ok) {
      console.error("[SmartQuotePage] API returned:", response.status);
      return null;
    }

    const data = await response.json();
    return data.data as SmartQuoteWithImages;
  } catch (error) {
    console.error("[SmartQuotePage] Error fetching quote:", error);
    return null;
  }
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const quote = await getSmartQuote(slug);

  if (!quote) {
    return {
      title: "Quote Not Found | Maiyuri Bricks",
    };
  }

  // Get headline from copy map (prefer English for SEO)
  const headline = quote.copy_map.en["entry.hero_headline"] ?? "Maiyuri Bricks";

  return {
    title: `${headline} | Maiyuri Bricks`,
    description:
      quote.copy_map.en["entry.belief_breaker"] ??
      "Eco-friendly interlocking bricks for your dream home",
    openGraph: {
      title: headline,
      description:
        quote.copy_map.en["climate.core_insight"] ??
        "Build cooler, healthier homes with earth blocks",
      type: "website",
      images: quote.images.entry
        ? [
            {
              url: quote.images.entry.image_url,
              width: 1200,
              height: 630,
              alt: headline,
            },
          ]
        : undefined,
    },
    robots: {
      index: false, // Don't index personalized quotes
      follow: false,
    },
  };
}

/**
 * Smart Quote customer-facing page
 *
 * Route: /sq/[slug]
 *
 * This page displays a personalized Smart Quote for a lead.
 * No authentication required - secured by unguessable slug.
 */
export default async function SmartQuotePage({ params }: PageProps) {
  const { slug } = await params;

  // Validate slug format
  if (!slug || slug.length < 10) {
    notFound();
  }

  // Fetch quote data
  const quote = await getSmartQuote(slug);

  if (!quote) {
    notFound();
  }

  return <SmartQuoteView quote={quote} slug={slug} />;
}
