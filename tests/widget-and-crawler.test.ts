import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  isAllowedByRobots,
  isCrawlableUrl,
  parseApprovedRemovalUrls,
  parseRobotsTxt,
} from "../scripts/crawl-website";
import { isValidWidgetUrl } from "@/lib/widget/url-validation";
import { parseEmbedPresentation } from "@/lib/widget/presentation";

describe("widget and crawler boundaries", () => {
  it("validates widget URLs and requires HTTPS outside localhost", () => {
    expect(isValidWidgetUrl("https://prototype.vercel.app/embed")).toBe(true);
    expect(isValidWidgetUrl("http://localhost:3000/embed")).toBe(true);
    expect(isValidWidgetUrl("http://example.com/embed")).toBe(false);
    expect(isValidWidgetUrl("javascript:alert(1)")).toBe(false);
  });

  it("constrains embed options to an allowlist", () => {
    expect(
      parseEmbedPresentation({
        theme: "url(javascript:bad)",
        launcher: "anything",
        position: "center",
      }),
    ).toEqual({
      theme: "light",
      launcherVisible: false,
      position: "bottom-right",
    });
  });

  it("uses the local Autrey Mill logo in the framework-independent launcher", () => {
    const loader = readFileSync("public/widget-loader.js", "utf8");
    expect(loader).toContain("/branding/autrey-mill-logo.png");
    expect(loader).not.toContain("the-place");
    expect(loader).not.toContain("thePlace");
    expect(loader).toContain('logoImage.alt = ""');
    expect(loader).toContain("chatbotUrl.origin !== scriptUrl.origin");
    expect(loader).toContain('resizeButton.addEventListener("pointerdown"');
    expect(loader).toContain('resizeButton.addEventListener("keydown"');
    expect(loader).toContain(".tp-resize{display:none}");
    expect(loader).toContain('script.getAttribute("data-prompt")');
    expect(loader).toContain('script.getAttribute("data-prompt-text")');
    expect(loader).toContain("autrey-mill-chatbot-nudge-seen");
    expect(loader).toContain("nudgeText.textContent = promptText");
    expect(loader).toContain('nudgeAction.addEventListener("click"');
    expect(loader).toContain('nudgeClose.addEventListener("click"');
    expect(loader).toContain('iframe.loading = "eager"');
    expect(loader).toContain("Loading Autrey Mill assistant");
    expect(loader).toContain('panel.setAttribute("data-ready", "true")');
    expect(loader).toContain('event.origin !== chatbotUrl.origin');
    expect(loader).toContain('event.source !== iframe.contentWindow');
    expect(loader).toContain('event.data.type !== EMBED_CLOSE_MESSAGE_TYPE');
    expect(loader).toContain('host.style.setProperty("opacity", "1", "important")');
  });

  it("uses Autrey Mill's brand colors, not The Place's or MentorMe's palette", () => {
    const loader = readFileSync("public/widget-loader.js", "utf8");
    const stalePlaceColors = ["#003b59", "#e15a9a", "#7d4b8e", "#b92f70", "#292f4c"];
    for (const color of stalePlaceColors) {
      expect(loader).not.toContain(color);
    }
    const staleMentorMeColors = ["#4a2268", "#632d8f", "#7d4bab", "#5a9418", "#2c2140"];
    for (const color of staleMentorMeColors) {
      expect(loader).not.toContain(color);
    }
    // Autrey Mill forest green (launcher) and gold accent (close hover).
    expect(loader).toContain("#2a611d");
    expect(loader).toContain("#a0661a");
  });

  it("gives embedded chat an opaque canvas so the host page cannot show through", () => {
    const styles = readFileSync("src/app/globals.css", "utf8");
    expect(styles).toContain(
      ".embed-page { width: 100%; min-height: 100dvh; margin: 0; background: var(--cream-50); }",
    );
  });

  it("keeps the crawler on public Autrey Mill HTML routes", () => {
    expect(isCrawlableUrl("https://autreymill.org/food-pantry/?utm_source=x")).toBe(
      true,
    );
    expect(isCrawlableUrl("https://autreymill.org/wp-admin/")).toBe(false);
    expect(isCrawlableUrl("https://example.com/food-pantry")).toBe(false);
    expect(isCrawlableUrl("https://autreymill.org/brochure.pdf")).toBe(false);
  });

  it("honors robots allow rules over shorter disallow rules", () => {
    const rules = parseRobotsTxt(
      "User-agent: *\nDisallow: /private\nAllow: /private/public\n",
    );
    expect(
      isAllowedByRobots("https://autreymill.org/private/page", rules),
    ).toBe(false);
    expect(
      isAllowedByRobots("https://autreymill.org/private/public/info", rules),
    ).toBe(true);
  });

  it("rejects malformed and duplicate removal approvals", () => {
    expect(() => parseApprovedRemovalUrls({ canonicalUrls: "not-an-array" })).toThrow(
      "canonicalUrls array",
    );
    expect(() =>
      parseApprovedRemovalUrls({
        canonicalUrls: [
          "https://autreymill.org/contact-us",
          "https://autreymill.org/contact-us/",
        ],
      }),
    ).toThrow("Duplicate approved removal");
  });
});
