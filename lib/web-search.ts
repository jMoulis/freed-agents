/**
 * FREED AGENTS — Web Search Utility
 *
 * Brave Search API wrapper for the PM agent's web_search tool.
 * API key injected from RunContext — never reads process.env directly.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

/**
 * Performs a web search using the Brave Search API.
 * @param query    Search query string
 * @param apiKey   Brave Search API key (from ctx.searchApiKey)
 * @param count    Number of results to return (default 5, max 20)
 */
export async function braveSearch(
  query: string,
  apiKey: string,
  count = 5,
): Promise<SearchResponse> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, 20)));
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("safesearch", "moderate");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    web?: {
      results?: Array<{
        title: string;
        url: string;
        description?: string;
        extra_snippets?: string[];
      }>;
    };
  };

  const results: SearchResult[] = (data.web?.results ?? [])
    .slice(0, count)
    .map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? r.extra_snippets?.[0] ?? "",
    }));

  return { query, results };
}
