import {
  APPROVED_ORG_HOSTS,
  canonicalizeOrgUrl,
  isApprovedWebsiteUrl,
} from "@/lib/security/source-url";

export const ORG = {
  name: "Autrey Mill Nature Preserve & Heritage Center",
  shortName: "Autrey Mill",
  canonicalOrigin: "https://autreymill.org",
  allowedHosts: APPROVED_ORG_HOSTS,
  contact: {
    phone: "678-366-3511",
    email: "info@autreymill.org",
    address: "9770 Autrey Mill Road, Johns Creek, GA 30022",
    url: "https://autreymill.org/about/directions/",
  },
} as const;

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export interface RuntimeConfig {
  apiKey?: string;
  fileSearchStore?: string;
  model: string;
  siteUrl: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
    fileSearchStore:
      process.env.GEMINI_FILE_SEARCH_STORE?.trim() || undefined,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    siteUrl:
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      "https://autrey-mill-chatbot.vercel.app",
  };
}

export { canonicalizeOrgUrl, isApprovedWebsiteUrl };
