# Autrey Mill Information Assistant

A grounded chatbot for Autrey Mill Nature Preserve & Heritage Center in Johns Creek, Georgia. The application answers only from a prepared Gemini File Search store containing Autrey Mill's public website (`autreymill.org`) and any staff-provided FAQ entries. Unsupported, uncited, sensitive, or conflicting questions are routed to Autrey Mill instead of being guessed.

This repository is adapted from [mentorme-chatbot](https://github.com/nareshrajesh787/mentorme-chatbot) (itself forked from [theplacechatbot](https://github.com/shreyasboddani/theplacechatbot)), with the same features, architecture, and safeguards, rebranded and retargeted for Autrey Mill. It is a prototype for review — it is not a registration, booking, or membership system, cannot check camp availability or a visitor's registration, and is not represented as a final production service.

## What is included

- A polished standalone demonstration at `/`
- A responsive iframe experience at `/embed`
- A framework-independent floating widget loader at `/widget-loader.js`
- A visible Auto / English / Español response-language selector
- Bounded desktop resizing for both the demo panel and integration widget
- A dismissible, once-per-session launcher suggestion
- `POST /api/chat` with File Search-only Gemini grounding
- `GET /api/health` with non-secret configuration status
- A robots-aware, same-origin WordPress-aware website crawler (targets `autreymill.org`) that records each page's last-updated date
- A fail-closed daily GitHub Actions refresh that commits only bounded, verified website changes
- Optional staff DOCX FAQ parsing (approved/pending separation) — no-ops cleanly if no doc is present
- Prepared website/FAQ Markdown and checksum-verified official documents
- Gemini File Search create/reuse, upload, list, and manual-delete scripts
- Local sensitive-data detection, Zod validation, source URL allowlisting, and best-effort rate limiting
- Automated tests and a manual review checklist

Website knowledge refresh is automated without placing Gemini credentials in GitHub. See [Knowledge automation setup and operations](docs/knowledge-automation.md) for its guardrails, one-time repository setting, Vercel handoff, and failure behavior.

## Architecture

```text
src/app/                 Next.js pages and route handlers
src/components/chatbot/  Interactive chat UI
src/lib/gemini/          Gemini request, prompt, citation, and response logic
src/lib/knowledge/       Shared knowledge and manifest contracts
src/lib/security/        Validation, privacy detection, and rate limiting
src/generated/           Build-time source manifest
knowledge/source/        Staff FAQ source (optional) plus durable official document sources
knowledge/generated/     Crawl, FAQ, prepared corpus, and sync reports
scripts/                 Offline crawl, parse, prepare, and File Search tools
public/widget-loader.js  Dependency-free host-site integration
tests/                   Vitest coverage for trust-boundary logic
docs/                    Manual test checklist
```

Runtime visitor questions never trigger website crawling. The chat route calls Gemini's current Interactions API with exactly one tool: the configured File Search store. It uses `store: false`, requests a constrained JSON result, and separately maps File Search annotations to the checked-in source manifest. An `answered` response is released only when at least one citation maps to an approved source.

Standalone greetings, thanks, questions about what the assistant can do, and availability questions that uniquely match a registered official document are answered locally with the corresponding validated source. They do not consume a Gemini request. Document-content and other organization-specific questions still use the grounded File Search path.

Before a grounded request, harmless greeting and courtesy wrappers are removed while the substantive wording is preserved. The grounding instruction explicitly resolves obvious spelling mistakes, repeated letters, chat shorthand, and clear follow-ups into a standalone retrieval query and tries one reasonable paraphrase before reporting a confirmed knowledge miss. A malformed model response or an answer without a mapped citation uses separate source-verification wording; it does not claim that the information is absent from the corpus.

The language selector defaults to **Auto**. Auto detects the visitor's language from the current message and recent conversational context, including common phonetic or transliterated language written with Latin letters, and asks Gemini to reply in the same language and script style. English and Español explicitly override automatic detection. The selector value is a validated enum carried separately from untrusted message text; language translation never relaxes File Search retrieval, citation mapping, sensitive-data blocking, or contact-fallback rules. The browser interface, quick actions, status text, and deterministic fallbacks are localized in Spanish when Español is selected. No additional environment variable is required.

On desktop, the floating panel can be resized from its inward-facing top corner. The handle supports pointer dragging and arrow-key resizing, including larger Shift+Arrow steps. Width and height are clamped to usable minimums, maximums, and the current viewport; the panel is fitted again if the browser window shrinks. Embedded and mobile layouts stay viewport-sized so resizing cannot interfere with touch scrolling or host-page layout. The same behavior is implemented in the framework-independent widget loader.

## Requirements

- Node.js 20 or newer (the official `@google/genai` SDK requires Node 20+)
- npm
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- A Gemini project with sufficient File Search/model quota for the sync and prototype traffic

No database, authentication provider, Redis service, or paid third-party dependency is required by the prototype.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. (Optional) Add a staff FAQ document at `knowledge/source/staff-faq.docx`. This isn't required to run the app — the website crawl alone produces a usable knowledge base. When you do write one, format it as a Word doc with each item as a question paragraph ending in `?`, followed by its answer in the following paragraph(s); the parser detects entries by that pattern rather than a fixed question list.

3. Copy the environment template without committing the result:

   PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   macOS/Linux:

   ```bash
   cp .env.example .env.local
   ```

4. Add the real values to `.env.local` after the knowledge store is created.

## Environment variables

```dotenv
GEMINI_API_KEY=
GEMINI_FILE_SEARCH_STORE=
GEMINI_MODEL=gemini-3.5-flash-lite
NEXT_PUBLIC_SITE_URL=https://autrey-mill-chatbot.vercel.app
```

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Gemini credential used for production knowledge synchronization and grounded runtime answers. Never prefix it with `NEXT_PUBLIC_`. |
| `GEMINI_FILE_SEARCH_STORE` | Resource name printed by the sync command, such as `fileSearchStores/...`. |
| `GEMINI_MODEL` | Central model configuration. Defaults to stable `gemini-3.5-flash-lite`. |
| `NEXT_PUBLIC_SITE_URL` | Public deployment origin used in documentation/integration context. It contains no secret. |

The application still renders without Gemini configuration. `/api/chat` returns a non-technical service-unavailable response with Autrey Mill's official contact path. `/api/health` returns only `ok` or `unavailable`; it does not disclose the model or which credential is missing.

### Gemini model selection

The chatbot uses the stable [`gemini-3.5-flash-lite`](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) model by default. Google lists it as a production-ready, low-latency, cost-efficient model with File Search and structured-output support. Every request explicitly uses the `minimal` thinking level. Short questions are limited to 224 output tokens and longer multi-part questions to 384; the prompt asks for 25-70 words for simple answers and 60-120 when important details require more context. File Search retrieves 6 results for a fresh simple question, 8 for a contextual follow-up, and up to 10 for a complex question.

Prompt size is bounded by sending only the four most recent valid conversation messages (two complete turns). Google can change model and free-tier limits, so review the current [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) before production use. Changing the runtime model does not require recreating the File Search store or uploading the knowledge corpus again.

## Knowledge synchronization

The synchronization pipeline has four explicit stages so each can be inspected independently.

### 1. Parse the staff FAQ (optional)

```bash
npm run knowledge:parse-faq
```

If `knowledge/source/staff-faq.docx` doesn't exist yet, this prints a message and exits cleanly — it does not block the rest of the pipeline. Once you do add a doc, this writes structured FAQ JSON plus:

- `knowledge/generated/manager-faq-approved.md`
- `knowledge/generated/manager-faq-pending.md`
- `knowledge/generated/manager-faq-report.json`

Only entries with a detected answer paragraph become `approved` and are eligible to become prepared File Search documents; anything else is flagged `needs_review` for a human to fill in.

### 2. Crawl the official website

```bash
npm run knowledge:crawl
```

The default and hard cap are 250 pages. autreymill.org currently has about 135 public pages and posts, of which roughly 115 have text content; the cap leaves room for the steady stream of event posts while keeping every refresh bounded. A smaller review crawl can be run with:

```bash
npm run knowledge:crawl -- --max-pages=25
```

The crawler reads `robots.txt`, uses WordPress's core sitemap (`/wp-sitemap.xml`) as its primary page list, revalidates previously approved URLs first, follows only canonicalized `autreymill.org` pages, waits between requests, avoids blocked/private/asset routes, and records per-page timestamps and failures. It never submits forms. A failed or suspiciously incomplete refresh retains the last-known-good document; permanent removal requires a human-reviewed entry in `knowledge/source/approved-removals.json`.

Autrey Mill-specific behavior (all in `scripts/crawl-website.ts`):

- **Theme-aware extraction.** The site's theme uses plain `<div>`s rather than `<main>`/`<nav>`/`<header>`, so the menu (`.header`), page banner, membership sidebar (`#sidebar`), homepage slider, and footer are removed by selector. Content is read from `#sitemain`, falling back to `.content-area` (full-width pages such as `/about/`) and then `<body>` (the homepage). The footer's hours, holiday-closure, and contact details are kept once, in the homepage document. Identical repeated blocks (Elementor tabs, nested list markup) are kept only once.
- **Excluded routes.** Author, category, tag, pagination, testimonial, and social-feed archives, WordPress internals, and the known `/new-event-test/` page are never crawled.
- **Text-free pages.** Audio-tour stops, photo-only animal profiles, and image attachment pages have no text. They are reported as `thinPages` rather than failures, unless a page previously had approved content — then the loss counts as a failure and the old content is retained.
- **Last-updated dates.** Each page's WordPress `modified` date is read from the public REST API (`/wp-json/wp/v2/pages` and `/posts`) and written into its prepared document as `Last updated on the Autrey Mill website: YYYY-MM-DD`. The grounding prompt uses this, plus the current Georgia date, so past events and camps are never presented as upcoming. If the API is unavailable, previously approved dates are kept.
- **Canonical URLs** use WordPress's trailing-slash permalink form (`https://autreymill.org/about/hours/`); `www.` and `http:` variants are normalized.

The main sections are also listed in `SEED_URLS` in case the sitemap is ever unavailable.

Registration, donations, and newsletter sign-up run on third-party services (Cogran, Givebutter, Constant Contact). These are JavaScript apps or off-domain pages that are deliberately not crawled; the assistant can only describe what autreymill.org itself says about them.

### 3. Prepare the approved corpus

```bash
npm run knowledge:prepare
```

This generates one retrieval document per approved source under `knowledge/generated/prepared`, then writes:

- `knowledge/generated/sources.json`
- `src/generated/knowledge-manifest.json`
- `knowledge/generated/sync-report.json`

Review the pending entries, potential website matches, conflicts, missing links, and crawl failures before uploading.

Validate the complete prepared snapshot before any upload:

```bash
npm run knowledge:verify
```

The verifier fails closed on manifest drift, unsafe paths, duplicate IDs or URLs, pending FAQ leakage, fabricated staff URLs, excessive crawl failures, suspicious instruction-like content, and unexpected corpus size changes.

Official PDFs (handbooks, flyers, etc.) can be registered separately from the HTML crawler in `knowledge/source/official-documents.json`, with the source files in `knowledge/source/official-documents/`. Each entry needs an approved public URL and a SHA-256 hash; preparation recreates their generated copies on every refresh, so a website crawl cannot remove or silently replace them. This starts empty. The two PDFs currently linked from autreymill.org were reviewed and deliberately not registered: the 2016 Heritage Village audio-tour map lists an outdated contact email and dial-in tour, and the Summerour House seating charts are image-only floor plans with no indexable text. A text-based document such as a rental pricing brochure would be a good candidate.

### 4. Upload or reconcile File Search

After setting `GEMINI_API_KEY` in `.env.local`:

```bash
npm run knowledge:sync -- --new-store
```

This explicitly creates a timestamped store and uploads every prepared document. Each document receives source metadata plus a SHA-256 content fingerprint. The script waits for indexing and finally prints:

```text
GEMINI_FILE_SEARCH_STORE=fileSearchStores/...
```

Copy that full value into `.env.local`. The raw API key is never logged. Existing stores are never deleted automatically.

For routine updates to an existing managed store, preview the reconciliation first:

```bash
npm run knowledge:sync -- --reconcile
```

After reviewing the counts, apply it:

```bash
npm run knowledge:sync -- --reconcile --apply
```

Reconciliation skips unchanged hashes, uploads replacements before deleting stale copies, removes obsolete managed documents only after every upload succeeds, and aborts without mutation if unmanaged documents are present. A store created before content fingerprints were added will reindex its managed documents once; later refreshes upload only changes.

File Search document bytes use a bounded native HTTPS resumable uploader instead of the SDK's fetch-based upload transport, avoiding known Vercel build-runtime upload failures while preserving the same upload-before-delete safeguards.

Run the complete pipeline after the key is available:

```bash
npm run knowledge:all
```

### Store maintenance

List stores:

```bash
npm run knowledge:list-stores
```

Delete a verified old store manually:

```bash
npm run knowledge:delete-store -- fileSearchStores/EXACT_STORE_NAME --confirm
```

Deletion is permanent, requires both an exact resource name and `--confirm`, and is never run automatically.

## Run locally

```bash
npm run dev
```

Open:

- Standalone demo: `http://localhost:3000`
- Embed experience: `http://localhost:3000/embed`
- Health status: `http://localhost:3000/api/health`
- Loader file: `http://localhost:3000/widget-loader.js`

Supported embed query options are constrained to:

- `theme=light|dark|auto`
- `launcher=hidden|visible`
- `position=bottom-left|bottom-right`

For example:

```text
http://localhost:3000/embed?theme=auto&launcher=hidden&position=bottom-right
```

Arbitrary CSS or script values are ignored.

## Testing and verification

```bash
npm test
npm run lint
npm run build
```

Automated tests mock or interpret Gemini-shaped responses and do not consume API quota. See [the manual test checklist](docs/manual-test-checklist.md) for browser and content scenarios.

## Iframe integration

```html
<iframe
  src="https://autrey-mill-chatbot.vercel.app/embed?theme=light&launcher=hidden"
  title="Autrey Mill information assistant"
  style="width: 390px; height: 650px; border: 0;"
  loading="lazy">
</iframe>
```

The iframe should be served from the deployed chatbot origin so its `/api/chat` request remains same-origin.

## Floating widget integration

Add this before the host page's closing `</body>` tag or through its approved script-injection area:

```html
<script
  async
  src="https://autrey-mill-chatbot.vercel.app/widget-loader.js"
  data-chatbot-url="https://autrey-mill-chatbot.vercel.app/embed"
  data-position="bottom-right"
  data-label="Ask Autrey Mill"
  data-prompt="visible"
  data-prompt-text="Ask the Autrey Mill chatbot">
</script>
```

The loader has no dependencies, uses a Shadow DOM boundary when available, locks the iframe to the loader's own HTTPS origin, and constrains position/theme values. It does not assume React, Next.js, WordPress, Squarespace, or another host framework.

When the launcher remains closed, a small "Need help?" suggestion appears after 2.2 seconds, never takes focus, disappears after 9 seconds, and can be dismissed or clicked to open the chat. A single `sessionStorage` boolean prevents it from repeating during the browser session; no visitor message or personal information is stored. The suggestion is enabled by default. Set `data-prompt="hidden"` to disable it, or customize its secondary line with a plain-text `data-prompt-text` value of up to 80 characters. Custom text is assigned with `textContent`, not interpreted as HTML.

## Deploy to Vercel

The current official Vercel workflow is documented at [Deploying a project from the CLI](https://vercel.com/docs/projects/deploy-from-cli) and [Managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

1. Install and authenticate the Vercel CLI:

   ```bash
   npm install --global vercel
   vercel login
   ```

2. From this repository, link or create the project:

   ```bash
   vercel link
   ```

3. Add the required values to **Production** in **Project Settings → Environment Variables**, or with the CLI. Mark the API key sensitive:

   ```bash
   vercel env add GEMINI_API_KEY production --sensitive
   vercel env add GEMINI_FILE_SEARCH_STORE production
   vercel env add GEMINI_MODEL production
   vercel env add NEXT_PUBLIC_SITE_URL production
   ```

   Enter `gemini-3.5-flash-lite` for `GEMINI_MODEL`. If a variable already exists, edit its Production value instead of creating a duplicate. Add separate Preview values only if preview deployments must answer live Gemini questions; Preview builds never synchronize or mutate File Search (see `scripts/vercel-build.ts`).

4. Create a preview deployment:

   ```bash
   vercel deploy
   ```

5. Set `NEXT_PUBLIC_SITE_URL` to the intended stable deployment origin if it changed, then redeploy. Vercel environment-variable changes—including `GEMINI_MODEL`—apply only to new deployments.

6. Verify the preview:

   ```bash
   curl https://autrey-mill-chatbot.vercel.app/api/health
   ```

7. Only after stakeholder review, create production:

   ```bash
   vercel deploy --prod
   ```

8. Test `/`, `/embed`, `/api/health`, a supported answer with sources, a fallback answer, mobile behavior, and the loader on a non-production host page.

## Refreshing website information

The credential-free GitHub Actions workflow checks the public Autrey Mill website daily. It creates no commit when the verified retrieval corpus is unchanged. When a bounded change passes every safety gate, it commits generated knowledge directly to `main`; Vercel then uses its Production-only Gemini configuration to reconcile File Search before deployment.

You can also run the same crawl and verification stages locally:

```bash
npm run knowledge:crawl
npm run knowledge:prepare
npm run knowledge:verify
```

Neither the automated nor manual website refresh reparses or alters staff FAQ approval. Inspect `crawl-report.json`, `sync-report.json`, and the generated diff. Preview and apply the existing-store reconciliation with:

```bash
npm run knowledge:sync -- --reconcile
npm run knowledge:sync -- --reconcile --apply
```

Use `--new-store` only for initial setup, ownership transfer, or an intentional blue/green rebuild. Reusing a store without `--reconcile` is rejected so duplicate documents cannot accumulate accidentally.

For the daily schedule, CMS dispatch event, repository permissions, deletion approvals, and rollback behavior, see [Knowledge automation setup and operations](docs/knowledge-automation.md).

## Privacy, security, and reliability notes

- The Gemini key remains server-side and is accessed only by the production build synchronization script and Node.js chat route.
- Chat transcripts are not written to a database, file, analytics service, or application log.
- Gemini interactions use `store: false`; provider-side abuse monitoring and service policies may still apply.
- Obvious SSNs, Luhn-valid card numbers, password disclosures, bank-account context with long numbers, and large private-document-like pastes are blocked before Gemini.
- React renders answer text directly; raw HTML and `dangerouslySetInnerHTML` are not used for model output.
- Website source URLs are limited to HTTPS `autreymill.org` hosts and must exist in the generated manifest.
- The crawler revalidates both requested and final redirect hosts so off-domain content cannot enter the approved corpus through a redirect or external sitemap.
- Request size, the 600-character message limit, history length, timeout, and response shape are bounded.
- The optional language preference is restricted to `auto`, `en`, or `es`; arbitrary browser values cannot enter the system instruction.
- The API requires `application/json`, model-generated images are not loaded, and the widget iframe is same-origin with its loader. `frame-ancestors` is intentionally open (`*`) so the widget can be embedded on any site — this is a deliberate tradeoff that gives up clickjacking-style protection for `/embed` in exchange for general-purpose embeddability; it is not scoped to Autrey Mill's domain.
- Production provider failures log only error type/status/code metadata, never visitor message text.
- `POST /api/chat` is rate limited in-memory with two tiers — 8 requests/minute and 20 requests/10 minutes per client IP — to catch both rapid bursts and slower sustained abuse. This remains best-effort: Vercel serverless instances do not share memory, so the effective limit is per-instance, not global. See [Prototype limitations](#prototype-limitations-and-production-hardening).
- No browser analytics or transcript persistence is included by default.
- The launcher suggestion stores only a non-sensitive, once-per-session "seen" flag in `sessionStorage`.

## Prototype limitations and production hardening

- File Search quality depends on the latest successful knowledge synchronization and periodic human review of crawl and sync reports.
- The crawler uses practical main-content extraction; synchronization reports should be audited periodically for missing, duplicated, retained, or layout-heavy pages.
- Semantic retrieval can miss relevant wording. The citation gate favors a safe fallback over an unsupported answer.
- The app does not authenticate visitors or connect to Autrey Mill's internal systems.
- In-memory rate limiting (even hardened with a burst tier) is not a strong production control: each serverless instance tracks its own counters, so an attacker distributed across enough concurrent instances can exceed the intended global limit. This tradeoff was chosen deliberately for this low-traffic nonprofit prototype to avoid adding an external service dependency; revisit if traffic or abuse risk grows.
- Before broad public promotion, configure a Vercel Firewall rate-limit rule for `POST /api/chat` (or replace the in-memory limiter with a durable shared store such as Vercel KV or Upstash Redis), plus a formal content-review workflow, uptime/error monitoring that excludes message text, accessibility testing with assistive technologies, retention/legal review, and a documented incident/rollback procedure.
- Review Gemini and Vercel quotas, billing, and data-processing terms for Autrey Mill's expected traffic. Free-tier availability and limits can change.
- The automated refresh is fail-closed; a large site-wide change or removal requires manual review rather than being committed automatically.

## Packages used

Runtime:

- `@google/genai` — official current Gemini JavaScript/TypeScript SDK
- `cheerio` — HTML and sitemap content parsing
- `mammoth` — DOCX conversion while preserving links
- `zod` — runtime request and model-result validation

Development:

- `tsx` — TypeScript execution for offline scripts
- `vitest` — unit and API-behavior tests
- `yaml` — local validation of GitHub workflow configuration

No deprecated Gemini SDK or legacy model name is used.
