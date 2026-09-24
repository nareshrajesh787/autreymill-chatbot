export const APPROVED_ORG_HOSTS = new Set([
  "autreymill.org",
  "www.autreymill.org",
]);

export function getApprovedWebsiteUrl(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !APPROVED_ORG_HOSTS.has(url.hostname)
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isApprovedWebsiteUrl(value: string): boolean {
  return getApprovedWebsiteUrl(value) !== undefined;
}

export function canonicalizeOrgUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!APPROVED_ORG_HOSTS.has(url.hostname)) return undefined;
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;

    url.protocol = "https:";
    url.hostname = "autreymill.org";
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    // autreymill.org is WordPress, whose permalinks end in "/". Matching that
    // form avoids a redirect on every crawl fetch and source-card click, while
    // file-style paths (e.g. uploaded PDFs) keep their exact form.
    const lastSegment = url.pathname.split("/").pop() || "";
    if (!lastSegment.includes(".")) {
      url.pathname = url.pathname.replace(/\/?$/, "/");
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
