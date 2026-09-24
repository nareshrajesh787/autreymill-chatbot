import { describe, expect, it } from "vitest";

import { securityHeaders } from "../next.config";

describe("security headers", () => {
  it("sets browser hardening while allowing embedding on any site", () => {
    const headers = new Map(
      securityHeaders.map(({ key, value }) => [key.toLowerCase(), value]),
    );
    const csp = headers.get("content-security-policy") ?? "";

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    // Deliberately open (not restricted to autreymill.org): the widget is
    // meant to be embeddable on any site. See next.config.ts for the
    // clickjacking-tradeoff note.
    expect(csp).toContain("frame-ancestors *");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });
});
