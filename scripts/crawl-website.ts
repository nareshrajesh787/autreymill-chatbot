import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { load } from "cheerio";

import {
  canonicalizeOrgUrl,
  ORG,
} from "../src/lib/config";
import type { WebsiteSource } from "../src/lib/knowledge/types";

const USER_AGENT =
  "AutreyMillKnowledgeBot/1.0 (+https://autreymill.org; offline knowledge sync)";
// autreymill.org is a WordPress site with roughly 135 public pages and posts
// (plus author, category, testimonial, and social-feed archives that are
// excluded below). The cap leaves room for the steady stream of event posts
// while keeping every refresh bounded; see MAXIMUM_WEBSITE_PAGES in
// verify-knowledge.ts, which must match.
export const DEFAULT_MAX_PAGES = 250;
// A sanity floor to catch a badly broken crawl, not a size expectation.
const MINIMUM_FULL_CRAWL_PAGES = 40;
const MAXIMUM_FAILURE_RATIO = 0.25;
const REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_DELAY_MS = 300;

// WordPress's core sitemap (/wp-sitemap.xml) lists every public page and
// post, so it is the primary discovery source. extractWebsiteSource() strips
// the site menu before extracting links, so the main sections are also seeded
// explicitly in case the sitemap is ever unavailable.
const SEED_URLS = [
  "https://autreymill.org/",
  "https://autreymill.org/about/",
  "https://autreymill.org/about/hours/",
  "https://autreymill.org/about/directions/",
  "https://autreymill.org/programs/",
  "https://autreymill.org/plan-your-event/",
  "https://autreymill.org/special-events/",
  "https://autreymill.org/get-involved/",
  "https://autreymill.org/donate/",
];

// Besides private/utility routes, this excludes WordPress archives that only
// repeat other pages (authors, categories, tags, pagination), sponsor
// testimonials, and the embedded social-media feed.
const BLOCKED_PATH =
  /\/(?:wp-admin|wp-login|wp-content|wp-includes|admin|login|logout|checkout|cart|account|search|feed|xmlrpc|wp-json|author|category|tag|page|testimonials|wssf_social_feed|comments|trackback)(?:\/|$)/i;

// Individual public URLs that are known not to be real visitor information.
const EXCLUDED_PATHS = new Set(["/new-event-test/"]);
const BLOCKED_EXTENSION =
  /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|pptx?|svg|tiff?|txt|webm|webp|woff2?|xlsx?|xml)$/i;

interface RobotsRules {
  allows: string[];
  disallows: string[];
  sitemaps: string[];
}

export interface CrawlPageNote {
  url: string;
  reason: string;
}

export interface CrawlReportForHealth {
  maxPages: number;
  failedPages: CrawlPageNote[];
  duplicatePages: Array<{ url: string; duplicateOf: string }>;
  blockedPages: string[];
  retainedPages: CrawlPageNote[];
  approvedRemovedPages: string[];
  totalIndexed: number;
}

export function assertSafeCrawlSnapshot(
  sources: WebsiteSource[],
  report: CrawlReportForHealth,
  hasPreviousCrawl = true,
): void {
  if (report.totalIndexed !== sources.length) {
    throw new Error("Crawl report count does not match the indexed page count.");
  }
  // The minimum-page floor exists to stop a bad crawl from silently
  // replacing an already-established corpus. There is nothing to protect on
  // a first-ever crawl, so a small site isn't blocked from bootstrapping.
  if (
    hasPreviousCrawl &&
    report.maxPages >= MINIMUM_FULL_CRAWL_PAGES &&
    sources.length < MINIMUM_FULL_CRAWL_PAGES
  ) {
    throw new Error(
      `Refusing to replace the last-known-good crawl with only ${sources.length} pages.`,
    );
  }
  const attemptedPages = sources.length + report.failedPages.length;
  if (
    attemptedPages > 0 &&
    report.failedPages.length / attemptedPages > MAXIMUM_FAILURE_RATIO
  ) {
    throw new Error(
      "Refusing to replace the last-known-good crawl because more than 25% of attempted pages failed.",
    );
  }
}

export function crawlHealthSnapshot(report: CrawlReportForHealth) {
  return {
    maxPages: report.maxPages,
    totalIndexed: report.totalIndexed,
    retainedPages: [...report.retainedPages].sort((a, b) =>
      `${a.url}\u0000${a.reason}`.localeCompare(`${b.url}\u0000${b.reason}`),
    ),
    approvedRemovedPages: [...report.approvedRemovedPages].sort(),
  };
}

function isWebsiteSource(value: unknown): value is WebsiteSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === "string" &&
    typeof source.title === "string" &&
    typeof source.canonicalUrl === "string" &&
    typeof source.fetchedAt === "string" &&
    typeof source.text === "string" &&
    Array.isArray(source.headings) &&
    Array.isArray(source.links) &&
    (source.lastUpdated === undefined || typeof source.lastUpdated === "string") &&
    source.sourceType === "official_website"
  );
}

export function websiteContentFingerprint(source: WebsiteSource): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: source.id,
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        text: source.text,
        headings: source.headings,
        links: source.links,
        lastUpdated: source.lastUpdated,
        sourceType: source.sourceType,
      }),
    )
    .digest("hex");
}

export function preserveUnchangedFetchedAt(
  source: WebsiteSource,
  previous: WebsiteSource | undefined,
): WebsiteSource {
  if (
    previous &&
    previous.canonicalUrl === source.canonicalUrl &&
    websiteContentFingerprint(previous) === websiteContentFingerprint(source)
  ) {
    return { ...source, fetchedAt: previous.fetchedAt };
  }
  return source;
}

export function parseApprovedRemovalUrls(value: unknown): Set<string> {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as Record<string, unknown>).canonicalUrls)
  ) {
    throw new Error(
      "knowledge/source/approved-removals.json must contain a canonicalUrls array.",
    );
  }

  const canonicalUrls = (value as { canonicalUrls: unknown[] }).canonicalUrls;
  const approved = new Set<string>();
  for (const candidate of canonicalUrls) {
    if (typeof candidate !== "string") {
      throw new Error("Every approved removal must be a string URL.");
    }
    const canonical = canonicalizeOrgUrl(candidate);
    if (!canonical || !isCrawlableUrl(canonical)) {
      throw new Error(`Approved removal is not a public autreymill.org page: ${candidate}`);
    }
    if (approved.has(canonical)) {
      throw new Error(`Duplicate approved removal: ${canonical}`);
    }
    approved.add(canonical);
  }
  return approved;
}

export function hasSuspiciousContentLoss(
  previous: WebsiteSource | undefined,
  current: WebsiteSource,
): boolean {
  if (!previous) return false;
  const looksLikeErrorPage = /\b(?:404|page not found|access denied|temporarily unavailable)\b/i.test(
    `${current.title}\n${current.text.slice(0, 500)}`,
  );
  if (looksLikeErrorPage) return true;
  return previous.text.length >= 500 && current.text.length < previous.text.length * 0.6;
}

export function mergePreviouslyApprovedSources(values: {
  currentSources: WebsiteSource[];
  previousSources: WebsiteSource[];
  failedPages: CrawlPageNote[];
  blockedPages: string[];
  approvedRemovalUrls: ReadonlySet<string>;
  maxPages: number;
}): { sources: WebsiteSource[]; retainedPages: CrawlPageNote[] } {
  const sources = [...values.currentSources];
  const currentUrls = new Set(sources.map((source) => source.canonicalUrl));
  const failedByUrl = new Map(
    values.failedPages.map((failure) => [failure.url, failure.reason]),
  );
  const blocked = new Set(values.blockedPages);
  const retainedPages: CrawlPageNote[] = [];

  for (const previous of values.previousSources) {
    if (
      currentUrls.has(previous.canonicalUrl) ||
      values.approvedRemovalUrls.has(previous.canonicalUrl)
    ) {
      continue;
    }
    if (sources.length >= values.maxPages) {
      throw new Error(
        "Refusing to drop previously approved pages because the crawl capacity was exhausted.",
      );
    }
    const reason =
      failedByUrl.get(previous.canonicalUrl) ||
      (blocked.has(previous.canonicalUrl)
        ? "Robots policy blocked revalidation; previous approved content was retained pending review."
        : undefined) ||
      "The page was not successfully revalidated; previous approved content was retained.";
    sources.push(previous);
    currentUrls.add(previous.canonicalUrl);
    retainedPages.push({ url: previous.canonicalUrl, reason });
  }

  const previousOrder = new Map(
    values.previousSources.map((source, index) => [source.canonicalUrl, index]),
  );
  sources.sort((left, right) => {
    const leftOrder = previousOrder.get(left.canonicalUrl);
    const rightOrder = previousOrder.get(right.canonicalUrl);
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left.canonicalUrl.localeCompare(right.canonicalUrl);
  });

  return { sources, retainedPages };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function requireOrgFetchUrl(value: string): string {
  const canonical = canonicalizeOrgUrl(value);
  if (!canonical) {
    throw new Error("Refusing to fetch or follow a URL outside the Autrey Mill website.");
  }
  return canonical;
}

export function isCrawlableUrl(value: string): boolean {
  const canonical = canonicalizeOrgUrl(value);
  if (!canonical) return false;
  const url = new URL(canonical);
  return (
    !BLOCKED_PATH.test(url.pathname) &&
    !BLOCKED_EXTENSION.test(url.pathname) &&
    !EXCLUDED_PATHS.has(url.pathname)
  );
}

export function parseRobotsTxt(value: string): RobotsRules {
  const rules: RobotsRules = { allows: [], disallows: [], sitemaps: [] };
  let applies = false;
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const content = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      const agent = content.toLowerCase();
      applies = agent === "*" || USER_AGENT.toLowerCase().includes(agent);
    } else if (key === "allow" && applies && content) {
      rules.allows.push(content);
    } else if (key === "disallow" && applies && content) {
      rules.disallows.push(content);
    } else if (key === "sitemap" && content) {
      rules.sitemaps.push(content);
    }
  }
  return rules;
}

export function isAllowedByRobots(url: string, rules: RobotsRules): boolean {
  const pathname = new URL(url).pathname;
  const matchingAllow = rules.allows
    .filter((rule) => pathname.startsWith(rule))
    .sort((a, b) => b.length - a.length)[0];
  const matchingDisallow = rules.disallows
    .filter((rule) => pathname.startsWith(rule))
    .sort((a, b) => b.length - a.length)[0];
  if (!matchingDisallow) return true;
  return Boolean(matchingAllow && matchingAllow.length >= matchingDisallow.length);
}

export function sourceIdForUrl(url: string): string {
  const parsed = new URL(url);
  const slug =
    parsed.pathname
      .split("/")
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "home";
  const suffix = createHash("sha256").update(url).digest("hex").slice(0, 8);
  return `web-${slug}-${suffix}`;
}

function normalizedText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractWebsiteSource(
  html: string,
  requestedUrl: string,
  fetchedAt: string,
): WebsiteSource | undefined {
  const $ = load(html);
  const requestedCanonical = canonicalizeOrgUrl(requestedUrl);
  if (!requestedCanonical) return undefined;
  const declaredCanonical = $("link[rel='canonical']").attr("href");
  const canonicalUrl =
    (declaredCanonical && canonicalizeOrgUrl(declaredCanonical)) ||
    requestedCanonical;

  $(
    "script, style, noscript, template, iframe, svg, canvas, nav, footer, header, form, [aria-hidden='true'], .cookie, .cookies, .newsletter, .social-share",
  ).remove();
  // The Autrey Mill theme marks up its menu, page banner, sidebar, homepage
  // slider, and footer with plain <div>s rather than landmark elements, so
  // they are removed by their theme selectors. The sidebar repeats the same
  // membership promotion on every page. The footer is the only place that
  // states holiday closures alongside the hours and contact details, so it
  // is kept once, in the homepage document, instead of on every page.
  const isHomepage = canonicalUrl === `${ORG.canonicalOrigin}/`;
  $(
    `.header, #page-header-container, #sidebar, .page-bottom, #home-slider-container${isHomepage ? "" : ", #footer"}`,
  ).remove();

  // Standard pages and posts keep their content in #sitemain; full-width
  // pages (such as /about/) use .content-area; the homepage template has no
  // single content wrapper, so it falls back to <body> once the site chrome
  // above is removed.
  const root = $("#sitemain").first().length
    ? $("#sitemain").first()
    : $(".content-area").first().length
      ? $(".content-area").first()
      : $("main").first().length
        ? $("main").first()
        : $("article").first().length
          ? $("article").first()
          : $("body").first();
  const title = normalizedText(
    $("meta[property='og:title']").attr("content") ||
      $("title").text() ||
      root.find("h1").first().text() ||
      "Autrey Mill Nature Preserve & Heritage Center",
  );
  const headings = root
    .find("h1, h2, h3")
    .toArray()
    .map((element) => normalizedText($(element).text()))
    .filter(Boolean)
    .slice(0, 40);

  const links = root
    .find("a[href]")
    .toArray()
    .flatMap((anchor) => {
      const href = $(anchor).attr("href");
      if (!href) return [];
      let absolute: string;
      try {
        absolute = new URL(href, canonicalUrl).toString();
      } catch {
        return [];
      }
      const url = canonicalizeOrgUrl(absolute);
      if (!url) return [];
      const label = normalizedText($(anchor).text());
      return [{ label: label || url, url }];
    })
    .filter(
      (link, index, values) =>
        values.findIndex(
          (candidate) => candidate.url === link.url && candidate.label === link.label,
        ) === index,
    )
    .slice(0, 100);

  const blocks = root
    .find("h1, h2, h3, h4, p, li, dt, dd, address")
    .toArray()
    .map((element) => normalizedText($(element).text()))
    .filter((text) => text.length > 1)
    // Elementor tab widgets and <li><p> markup repeat identical blocks; keep
    // the first occurrence so retrieval text is not padded with copies.
    .filter((text, index, values) => values.indexOf(text) === index);
  const text = normalizedText(blocks.join("\n"));
  if (text.length < 80) return undefined;

  return {
    id: sourceIdForUrl(canonicalUrl),
    title,
    canonicalUrl,
    fetchedAt,
    text,
    headings,
    links,
    sourceType: "official_website",
  };
}

async function fetchWithRetry(url: string): Promise<Response> {
  const requestUrl = requireOrgFetchUrl(url);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(requestUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.5",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      requireOrgFetchUrl(response.url);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error: unknown) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt === 0) await sleep(500);
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  return match?.[1];
}

/**
 * Reads WordPress's public REST API for each page's and post's last-modified
 * date, keyed by canonical URL. The HTML theme publishes no date metadata, and
 * the date lets the assistant tell a past event from an upcoming one. Dates
 * are optional: any failure returns what was collected so far, and callers
 * keep a page's previously approved date when a new one is unavailable.
 */
export async function fetchWordPressModifiedDates(): Promise<Map<string, string>> {
  const dates = new Map<string, string>();
  for (const type of ["pages", "posts"]) {
    for (let page = 1; page <= 5; page += 1) {
      const requestUrl = new URL(`${ORG.canonicalOrigin}/wp-json/wp/v2/${type}`);
      requestUrl.searchParams.set("per_page", "100");
      requestUrl.searchParams.set("page", String(page));
      requestUrl.searchParams.set("_fields", "link,modified");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(requestUrl, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          redirect: "follow",
          signal: controller.signal,
        });
        requireOrgFetchUrl(response.url);
        if (!response.ok) break;
        const value: unknown = await response.json();
        if (!Array.isArray(value)) break;
        for (const item of value) {
          if (!item || typeof item !== "object") continue;
          const record = item as Record<string, unknown>;
          const url =
            typeof record.link === "string"
              ? canonicalizeOrgUrl(record.link)
              : undefined;
          const modified = isoDate(record.modified);
          if (url && modified) dates.set(url, modified);
        }
        const totalPages = Number(response.headers.get("x-wp-totalpages"));
        if (!Number.isFinite(totalPages) || page >= totalPages) break;
      } catch {
        break;
      } finally {
        clearTimeout(timeout);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }
  return dates;
}

async function discoverSitemapUrls(
  initialSitemaps: string[],
  maxCandidates: number,
): Promise<string[]> {
  const sitemapQueue = initialSitemaps;
  const visitedSitemaps = new Set<string>();
  const pageUrls = new Set<string>();

  while (
    sitemapQueue.length > 0 &&
    visitedSitemaps.size < 12 &&
    pageUrls.size < maxCandidates
  ) {
    const sitemapUrl = sitemapQueue.shift();
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);
    try {
      const response = await fetchWithRetry(sitemapUrl);
      if (!response.ok) continue;
      const xml = await response.text();
      const $ = load(xml, { xmlMode: true });
      const locations = $("loc")
        .toArray()
        .map((element) => $(element).text().trim())
        .filter(Boolean);
      if ($("sitemapindex").length > 0) {
        sitemapQueue.push(
          ...locations.filter((url) => canonicalizeOrgUrl(url) !== undefined),
        );
      } else {
        for (const url of locations) {
          const canonical = canonicalizeOrgUrl(url);
          if (canonical && isCrawlableUrl(canonical)) pageUrls.add(canonical);
          if (pageUrls.size >= maxCandidates) break;
        }
      }
    } catch {
      // Sitemap discovery is optional; the same-origin link crawl continues.
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return [...pageUrls];
}

function pageMarkdown(source: WebsiteSource): string {
  const links = source.links
    .map((link) => `- ${link.label}: ${link.url}`)
    .join("\n");
  return [
    `# ${source.title}`,
    "",
    `Source ID: ${source.id}`,
    `Source type: ${source.sourceType}`,
    `Canonical URL: ${source.canonicalUrl}`,
    ...(source.lastUpdated ? [`Last updated: ${source.lastUpdated}`] : []),
    `Fetched at: ${source.fetchedAt}`,
    "",
    "## Page content",
    "",
    source.text,
    ...(links ? ["", "## Relevant links", "", links] : []),
    "",
  ].join("\n");
}

export async function crawlWebsite(
  maxPages = DEFAULT_MAX_PAGES,
  previousSources: WebsiteSource[] = [],
  approvedRemovalUrls: ReadonlySet<string> = new Set(),
) {
  const robotsUrl = `${ORG.canonicalOrigin}/robots.txt`;
  let robots: RobotsRules = { allows: [], disallows: [], sitemaps: [] };
  try {
    const robotsResponse = await fetchWithRetry(robotsUrl);
    if (robotsResponse.ok) robots = parseRobotsTxt(await robotsResponse.text());
  } catch {
    // An unavailable robots file is treated as allowing public pages.
  }

  const sitemapSeeds = [
    ...robots.sitemaps,
    `${ORG.canonicalOrigin}/sitemap.xml`,
    `${ORG.canonicalOrigin}/wp-sitemap.xml`,
    `${ORG.canonicalOrigin}/sitemap_index.xml`,
  ].filter((value, index, values) => values.indexOf(value) === index);
  const sitemapUrls = await discoverSitemapUrls(sitemapSeeds, maxPages * 3);
  const previousUrls = previousSources.map((source) => source.canonicalUrl);
  const queue = [
    ...new Set(
      [...previousUrls, ...SEED_URLS, ...sitemapUrls]
        .map(canonicalizeOrgUrl)
        .filter(
          (url): url is string =>
            Boolean(url) && !approvedRemovalUrls.has(String(url)),
        ),
    ),
  ];
  const visited = new Set<string>();
  const queued = new Set(queue);
  const contentHashes = new Map<string, string>();
  const previousByUrl = new Map(
    previousSources.map((source) => [source.canonicalUrl, source]),
  );
  const sources: WebsiteSource[] = [];
  const failedPages: CrawlPageNote[] = [];
  const duplicatePages: Array<{ url: string; duplicateOf: string }> = [];
  const blockedPages: string[] = [];
  const thinPages: CrawlPageNote[] = [];
  const modifiedDates = await fetchWordPressModifiedDates();

  while (queue.length > 0 && sources.length < maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (!isCrawlableUrl(current) || !isAllowedByRobots(current, robots)) {
      blockedPages.push(current);
      continue;
    }

    try {
      const response = await fetchWithRetry(current);
      if (!response.ok) {
        failedPages.push({ url: current, reason: `HTTP ${response.status}` });
        continue;
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        failedPages.push({ url: current, reason: `Unsupported content type: ${contentType || "unknown"}` });
        continue;
      }
      const finalUrl = canonicalizeOrgUrl(response.url) || current;
      const extractedSource = extractWebsiteSource(
        await response.text(),
        finalUrl,
        new Date().toISOString(),
      );
      if (!extractedSource) {
        // Several Autrey Mill pages are intentionally text-free (audio-tour
        // stops, photo-only animal profiles). They are skipped rather than
        // counted as failures, unless they previously had approved content,
        // in which case the loss is a failure and the old content is retained.
        const previouslyApproved =
          previousByUrl.has(current) || previousByUrl.has(finalUrl);
        (previouslyApproved ? failedPages : thinPages).push({
          url: current,
          reason: "No meaningful public page content found",
        });
        continue;
      }
      const previousSource = previousByUrl.get(extractedSource.canonicalUrl);
      const lastUpdated =
        modifiedDates.get(extractedSource.canonicalUrl) ??
        previousSource?.lastUpdated;
      const source = preserveUnchangedFetchedAt(
        lastUpdated ? { ...extractedSource, lastUpdated } : extractedSource,
        previousSource,
      );
      if (
        hasSuspiciousContentLoss(
          previousByUrl.get(extractedSource.canonicalUrl),
          source,
        )
      ) {
        failedPages.push({
          url: current,
          reason:
            "Extracted content looked incomplete; previous approved content was retained.",
        });
        continue;
      }

      const hash = createHash("sha256").update(source.text).digest("hex");
      const duplicateOf = contentHashes.get(hash);
      if (duplicateOf) {
        duplicatePages.push({ url: current, duplicateOf });
        if (
          previousByUrl.has(source.canonicalUrl) &&
          !sources.some(
            (candidate) => candidate.canonicalUrl === source.canonicalUrl,
          )
        ) {
          sources.push(source);
        }
      } else {
        contentHashes.set(hash, source.canonicalUrl);
        if (
          !sources.some(
            (candidate) => candidate.canonicalUrl === source.canonicalUrl,
          )
        ) {
          sources.push(source);
        }
      }

      for (const link of source.links) {
        if (
          !queued.has(link.url) &&
          !visited.has(link.url) &&
          !approvedRemovalUrls.has(link.url) &&
          isCrawlableUrl(link.url)
        ) {
          queued.add(link.url);
          queue.push(link.url);
        }
      }
    } catch (error: unknown) {
      failedPages.push({
        url: current,
        reason: error instanceof Error ? error.message : "Request failed",
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const merged = mergePreviouslyApprovedSources({
    currentSources: sources,
    previousSources,
    failedPages,
    blockedPages,
    approvedRemovalUrls,
    maxPages,
  });
  const approvedRemovedPages = previousSources
    .map((source) => source.canonicalUrl)
    .filter((url) => approvedRemovalUrls.has(url));

  return {
    sources: merged.sources,
    report: {
      startedFrom: ORG.canonicalOrigin,
      crawledAt: new Date().toISOString(),
      maxPages,
      indexedPages: merged.sources.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.canonicalUrl,
        fetchedAt: source.fetchedAt,
      })),
      failedPages,
      thinPages,
      duplicatePages,
      blockedPages,
      retainedPages: merged.retainedPages,
      approvedRemovedPages,
      totalIndexed: merged.sources.length,
    },
  };
}

async function main() {
  const maxArgument = process.argv.find((argument) => argument.startsWith("--max-pages="));
  const requestedMax = maxArgument
    ? Number(maxArgument.slice("--max-pages=".length))
    : DEFAULT_MAX_PAGES;
  const maxPages = Number.isFinite(requestedMax)
    ? Math.min(DEFAULT_MAX_PAGES, Math.max(1, Math.floor(requestedMax)))
    : DEFAULT_MAX_PAGES;
  const root = process.cwd();
  const outputDir = path.resolve(root, "knowledge/generated");
  const websiteDir = path.join(outputDir, "website");
  let previousSources: WebsiteSource[] = [];
  let approvedRemovalUrls = new Set<string>();
  try {
    const previousValue: unknown = JSON.parse(
      await readFile(path.join(outputDir, "crawl-data.json"), "utf8"),
    );
    if (Array.isArray(previousValue)) {
      previousSources = previousValue.filter(isWebsiteSource);
    }
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as Error & { code?: string }).code !== "ENOENT"
    ) {
      throw error;
    }
  }
  try {
    const removalValue: unknown = JSON.parse(
      await readFile(
        path.resolve(root, "knowledge/source/approved-removals.json"),
        "utf8",
      ),
    );
    approvedRemovalUrls = parseApprovedRemovalUrls(removalValue);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as Error & { code?: string }).code === "ENOENT"
    ) {
      throw new Error(
        "knowledge/source/approved-removals.json is missing; refusing to infer removals.",
      );
    }
    throw error;
  }
  const { sources, report } = await crawlWebsite(
    maxPages,
    previousSources,
    approvedRemovalUrls,
  );
  assertSafeCrawlSnapshot(sources, report, previousSources.length > 0);

  await rm(websiteDir, { recursive: true, force: true });
  await mkdir(websiteDir, { recursive: true });
  await Promise.all(
    sources.map((source) =>
      writeFile(
        path.join(websiteDir, `${source.id}.md`),
        pageMarkdown(source),
        "utf8",
      ),
    ),
  );
  await Promise.all([
    writeFile(
      path.join(outputDir, "crawl-data.json"),
      `${JSON.stringify(sources, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "crawl-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "crawl-health.json"),
      `${JSON.stringify(crawlHealthSnapshot(report), null, 2)}\n`,
      "utf8",
    ),
  ]);
  process.stdout.write(
    `Indexed ${sources.length} public HTML pages from ${ORG.canonicalOrigin}.\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown crawl error";
    process.stderr.write(`Website crawl failed: ${message}\n`);
    process.exitCode = 1;
  });
}

