import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractWebsiteSource,
  fetchWordPressModifiedDates,
  isCrawlableUrl,
  preserveUnchangedFetchedAt,
} from "../scripts/crawl-website";
import { websiteMarkdown } from "../scripts/prepare-knowledge";
import { canonicalizeOrgUrl } from "@/lib/config";
import { buildSystemInstruction } from "@/lib/gemini/prompts";
import type { WebsiteSource } from "@/lib/knowledge/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const FETCHED_AT = "2026-09-24T00:00:00.000Z";
const LONG_TEXT =
  "Summer camp runs Monday through Friday for campers ages 5 to 12, with small groups led by nature educators.";

// Mirrors the autreymill.org theme: chrome in plain <div>s, content in
// #sitemain, a membership sidebar repeated on every page.
function themedPage(content: string, footer = "") {
  return `<!doctype html><html><head><title>Summer Camp – Autrey Mill</title></head><body>
    <div class="header"><div class="nav"><ul class="menu"><li><a href="/about/hours/">Hours</a></li><li>Trails</li></ul></div></div>
    <div id="page-header-container"><h1>Summer Camp</h1></div>
    <div class="content-area"><div class="middle-align content_sidebar">
      <header class="entry-header"><h1>Summer Camp</h1></header>
      <div id="sitemain" class="site-main">${content}</div>
      <div id="sidebar"><aside class="widget"><h3 class="widget-title">Become a Member!</h3><ul><li>Discounts on programs</li></ul></aside></div>
    </div></div>
    <div class="page-bottom middle-align"></div>
    <div id="footer"><div class="footer-top"><h3>Hours</h3><p>Closed on major holidays and access may be restricted during events.</p>${footer}</div></div>
  </body></html>`;
}

describe("autreymill.org extraction", () => {
  it("keeps page content and strips the theme's menu, sidebar, and footer", () => {
    const source = extractWebsiteSource(
      themedPage(`<p>${LONG_TEXT}</p><a href="/programs/school-break-camps/">Break camps</a>`),
      "https://autreymill.org/programs/summer-camp/",
      FETCHED_AT,
    );

    expect(source?.text).toContain("Summer camp runs Monday through Friday");
    expect(source?.text).not.toContain("Trails");
    expect(source?.text).not.toContain("Become a Member!");
    expect(source?.text).not.toContain("Closed on major holidays");
    expect(source?.links).toEqual([
      { label: "Break camps", url: "https://autreymill.org/programs/school-break-camps/" },
    ]);
  });

  it("keeps the footer's hours and closures once, on the homepage", () => {
    // The homepage template uses a slider and sections instead of #sitemain.
    const html = `<html><head><title>Autrey Mill</title></head><body>
      <div class="header"><ul class="menu"><li>Hours</li><li>Trails</li></ul></div>
      <div id="home-slider-container"><p>Brand new birthday parties!</p></div>
      <section><p>${LONG_TEXT}</p></section>
      <div id="footer"><h3>Hours</h3><p>Closed on major holidays and access may be restricted during events.</p></div>
    </body></html>`;
    const home = extractWebsiteSource(html, "https://autreymill.org/", FETCHED_AT);
    expect(home?.text).toContain(LONG_TEXT);
    expect(home?.text).toContain("Closed on major holidays");
    expect(home?.text).not.toContain("Trails");
    expect(home?.text).not.toContain("Brand new birthday parties");

    const interior = extractWebsiteSource(html, "https://autreymill.org/about/hours/", FETCHED_AT);
    expect(interior?.text).not.toContain("Closed on major holidays");
  });

  it("falls back to .content-area for full-width pages without #sitemain", () => {
    const html = `<html><head><title>About – Autrey Mill</title></head><body>
      <div class="header"><ul class="menu"><li>Hours</li></ul></div>
      <div class="content-area"><p>${LONG_TEXT}</p></div>
      <div id="footer"><p>Closed on major holidays.</p></div></body></html>`;
    const source = extractWebsiteSource(html, "https://autreymill.org/about/", FETCHED_AT);
    expect(source?.text).toBe(LONG_TEXT);
  });

  it("drops repeated blocks from tab widgets and nested list markup", () => {
    const repeated = "Offered Every Thursday – Registration Required for ages 5-14.";
    const source = extractWebsiteSource(
      themedPage(`<p>${LONG_TEXT}</p><p>${repeated}</p><p>${repeated}</p><ul><li><p>${repeated}</p></li></ul>`),
      "https://autreymill.org/home-school-adventures/",
      FETCHED_AT,
    );
    expect(source?.text.split(repeated)).toHaveLength(2);
  });

  it("treats audio-only and photo-only pages as having no content", () => {
    expect(
      extractWebsiteSource(
        themedPage('<h1>Binx</h1><img src="/binx.jpg" alt="">'),
        "https://autreymill.org/binx/",
        FETCHED_AT,
      ),
    ).toBeUndefined();
  });
});

describe("autreymill.org URL rules", () => {
  it("canonicalizes to WordPress trailing-slash permalinks without touching files", () => {
    expect(canonicalizeOrgUrl("http://www.autreymill.org/about/hours?x=1#top")).toBe(
      "https://autreymill.org/about/hours/",
    );
    expect(canonicalizeOrgUrl("https://autreymill.org")).toBe("https://autreymill.org/");
    expect(
      canonicalizeOrgUrl("https://autreymill.org/wp-content/uploads/2016/07/AudioTourMap.pdf"),
    ).toBe("https://autreymill.org/wp-content/uploads/2016/07/AudioTourMap.pdf");
  });

  it.each([
    "https://autreymill.org/author/admin/",
    "https://autreymill.org/category/homenews/",
    "https://autreymill.org/testimonials/veolia-khafra/",
    "https://autreymill.org/wssf_social_feed/autrey-mill/",
    "https://autreymill.org/page/2/",
    "https://autreymill.org/new-event-test/",
    "https://autreymill.org/wp-json/wp/v2/pages",
  ])("does not crawl WordPress archives or test pages: %s", (url) => {
    expect(isCrawlableUrl(url)).toBe(false);
  });

  it("crawls ordinary pages and posts", () => {
    expect(isCrawlableUrl("https://autreymill.org/programs/summer-camp/")).toBe(true);
    expect(isCrawlableUrl("https://autreymill.org/spooky-mill/")).toBe(true);
  });
});

describe("last-updated dates", () => {
  function jsonResponse(body: unknown, url: string, totalPages = 1) {
    return {
      ok: true,
      url,
      headers: new Headers({ "x-wp-totalpages": String(totalPages) }),
      json: async () => body,
    };
  }

  it("reads page and post modified dates from the WordPress REST API", async () => {
    const fetchMock = vi.fn(async (input: URL) => {
      const type = input.pathname.endsWith("/pages") ? "pages" : "posts";
      return jsonResponse(
        type === "pages"
          ? [{ link: "https://autreymill.org/about/hours/", modified: "2026-02-27T19:35:35" }]
          : [
              { link: "https://autreymill.org/spooky-mill/", modified: "2026-09-04T20:29:04" },
              { link: "https://example.com/elsewhere/", modified: "2026-09-04T20:29:04" },
              { link: "https://autreymill.org/no-date/", modified: "not a date" },
            ],
        input.toString(),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const dates = await fetchWordPressModifiedDates();

    expect(Object.fromEntries(dates)).toEqual({
      "https://autreymill.org/about/hours/": "2026-02-27",
      "https://autreymill.org/spooky-mill/": "2026-09-04",
    });
    const requested = new URL(fetchMock.mock.calls[0]![0]);
    expect(requested.origin).toBe("https://autreymill.org");
    expect(requested.searchParams.get("_fields")).toBe("link,modified");
  }, 10_000);

  it("returns no dates instead of failing when the API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(fetchWordPressModifiedDates()).resolves.toEqual(new Map());
  });

  it("refuses API responses redirected off the Autrey Mill site", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          [{ link: "https://autreymill.org/about/hours/", modified: "2026-02-27T19:35:35" }],
          "https://example.com/wp-json/wp/v2/pages",
        ),
      ),
    );
    await expect(fetchWordPressModifiedDates()).resolves.toEqual(new Map());
  });

  it("puts the date in the retrieval document and treats a date change as new content", () => {
    const source: WebsiteSource = {
      id: "web-spooky-mill-12345678",
      title: "Spooky Mill – Autrey Mill",
      canonicalUrl: "https://autreymill.org/spooky-mill/",
      fetchedAt: "2026-09-01T00:00:00.000Z",
      text: LONG_TEXT,
      headings: [],
      links: [],
      lastUpdated: "2026-09-04",
      sourceType: "official_website",
    };
    expect(websiteMarkdown(source)).toContain(
      "Last updated on the Autrey Mill website: 2026-09-04",
    );
    expect(websiteMarkdown({ ...source, lastUpdated: undefined })).not.toContain(
      "Last updated",
    );

    const refetched = { ...source, fetchedAt: FETCHED_AT };
    expect(preserveUnchangedFetchedAt(refetched, source).fetchedAt).toBe(source.fetchedAt);
    expect(
      preserveUnchangedFetchedAt({ ...refetched, lastUpdated: "2026-09-20" }, source).fetchedAt,
    ).toBe(FETCHED_AT);
  });
});

describe("Autrey Mill grounding prompt", () => {
  it("never presents past-dated events as upcoming", () => {
    const instruction = buildSystemInstruction("2026-09-24");
    expect(instruction).toContain("Autrey Mill Nature Preserve & Heritage Center");
    expect(instruction).toContain(
      "Never present an event, camp session, or program date that falls before the current date as upcoming",
    );
    expect(instruction).toContain("dates before the current date are past, not upcoming");
    expect(instruction).toContain("678-366-3511");
    expect(instruction).not.toMatch(/mentor/i);
  });
});
