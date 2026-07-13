/**
 * Wiki sources for the search_wiki tool.
 * -----------------------------------------------------------------------------
 * A "wiki source" is anything that can answer a text query with a list of
 * documentation results. Microsoft Learn is enabled by default. To add an
 * internal wiki later, implement `WikiSource` and register it in
 * `getWikiSources()` (see the Azure DevOps example below).
 */

export type WikiResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

export interface WikiSource {
  name: string;
  search(query: string, limit: number): Promise<WikiResult[]>;
}

/**
 * Microsoft Learn — public documentation search API.
 * https://learn.microsoft.com/  (search endpoint returns JSON results)
 */
export const microsoftLearnSource: WikiSource = {
  name: "Microsoft Learn",
  async search(query, limit) {
    const url = new URL("https://learn.microsoft.com/api/search");
    url.searchParams.set("search", query);
    url.searchParams.set("locale", "en-us");
    url.searchParams.set("$top", String(limit));

    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Microsoft Learn search failed (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; description?: string }>;
    };
    const results = Array.isArray(data.results) ? data.results : [];

    return results.slice(0, limit).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: (r.description ?? "").trim(),
      source: "Microsoft Learn",
    }));
  },
};

/**
 * Example scaffold for an Azure DevOps project wiki. Not enabled by default —
 * uncomment its registration in `getWikiSources()` and provide the env vars.
 *
 * Requires:
 *   ADO_ORG          e.g. "contoso"
 *   ADO_PROJECT      e.g. "Platform"
 *   ADO_WIKI_ID      the wiki identifier
 *   ADO_PAT          a personal access token with wiki read scope
 */
export function createAzureDevOpsWikiSource(): WikiSource {
  const org = process.env.ADO_ORG ?? "";
  const project = process.env.ADO_PROJECT ?? "";
  const wikiId = process.env.ADO_WIKI_ID ?? "";
  const pat = process.env.ADO_PAT ?? "";

  return {
    name: "Azure DevOps Wiki",
    async search(query, limit) {
      if (!org || !project || !wikiId || !pat) {
        throw new Error(
          "Azure DevOps wiki not configured (ADO_ORG/ADO_PROJECT/ADO_WIKI_ID/ADO_PAT)."
        );
      }
      // Uses the Search extension's wiki search API.
      const url = `https://almsearch.dev.azure.com/${org}/${project}/_apis/search/wikisearchresults?api-version=7.1`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
        },
        body: JSON.stringify({ searchText: query, $top: limit }),
      });
      if (!res.ok) {
        throw new Error(`Azure DevOps wiki search failed (HTTP ${res.status}).`);
      }
      const data = (await res.json()) as {
        results?: Array<{
          fileName?: string;
          path?: string;
          wiki?: { name?: string };
          hits?: Array<{ highlights?: string[] }>;
        }>;
      };
      const results = Array.isArray(data.results) ? data.results : [];
      return results.slice(0, limit).map((r) => ({
        title: r.fileName ?? r.path ?? "Untitled",
        url: r.path ?? "",
        snippet: (r.hits?.[0]?.highlights?.join(" … ") ?? "").replace(
          /<\/?highlighthit>/g,
          ""
        ),
        source: "Azure DevOps Wiki",
      }));
    },
  };
}

/**
 * The set of wiki sources search_wiki queries. Microsoft Learn is always on;
 * add internal sources here (guarded by their own config).
 */
export function getWikiSources(): WikiSource[] {
  const sources: WikiSource[] = [microsoftLearnSource];

  // Enable an internal Azure DevOps wiki when it's configured:
  if (process.env.ADO_ORG && process.env.ADO_PAT) {
    sources.push(createAzureDevOpsWikiSource());
  }

  return sources;
}
