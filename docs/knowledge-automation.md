# Knowledge automation setup and operations

The automation keeps Gemini credentials in Vercel only. GitHub Actions crawls and validates public Autrey Mill website content without a Gemini or Vercel secret. A successful production deployment uses Vercel's existing server-side Gemini configuration to reconcile File Search before building the chatbot.

## Workflow sequence

1. `Detect and commit Autrey Mill website knowledge updates` runs daily, manually, or from an approved CMS webhook.
2. It crawls only public `autreymill.org` pages (plus the public WordPress REST API for last-updated dates), rejects off-domain fetch and redirect targets, revalidates previously approved URLs, preserves unchanged timestamps, prepares the corpus, and runs the knowledge verifier. A failed crawl receives one bounded retry after 30 seconds; preparation and verification are not repeated or bypassed.
3. Failed, incomplete, redirected, missing, or suspiciously shrunken approved pages retain their last-known-good documents. Permanent removal requires a canonical URL already committed to `knowledge/source/approved-removals.json` after human review.
4. Any registered official PDFs are rebuilt from checksum-verified files in `knowledge/source/official-documents/`; the website crawler neither owns nor removes them. None are registered today.
5. If crawl health and prepared retrieval content are unchanged, the workflow creates no commit. No Vercel deployment or Gemini request occurs.
6. If content changed, GitHub verifies the generated-file boundary, blocks staff-FAQ changes, limits automatic changes to ten prepared documents and two explicitly approved website removals, then runs tests, lint, TypeScript, a production build, and diff checks.
7. Immediately before committing, it fetches `origin/main`. If `main` advanced during validation, it exits instead of overwriting newer work. Otherwise, the knowledge bot pushes a normal verified commit directly to `main` without force.
8. Vercel's Git integration starts a Production deployment. `vercel.json` selects `npm run build:vercel`.
9. The production build requires `GEMINI_API_KEY` and `GEMINI_FILE_SEARCH_STORE`, verifies the corpus again, uploads replacements before deleting stale managed copies, verifies remote consistency, and then runs `next build`.
10. Preview and Development builds run `next build` without mutating Gemini.

The GitHub workflow never receives, references, or logs the Gemini key. Crawl timestamps are omitted from retrieval text, so timestamp-only checks do not consume indexing quota.

## One-time configuration

### GitHub

1. In **Settings -> Actions -> General -> Workflow permissions**, allow read and write access so the workflow can push its bounded generated commit to `main`.
2. If `main` is protected, permit the workflow identity to push only after its repository safety gate succeeds. Do not enable force pushes.
3. Do not add `GEMINI_API_KEY`, `GEMINI_FILE_SEARCH_STORE`, or a Vercel deploy hook to GitHub.

### Vercel

Keep these values in the Vercel **Production** environment:

| Kind | Name | Purpose |
| --- | --- | --- |
| Sensitive | `GEMINI_API_KEY` | Server-side Gemini authentication for build-time synchronization and runtime answers. |
| Variable | `GEMINI_FILE_SEARCH_STORE` | Stable existing `fileSearchStores/...` resource name. |
| Variable | `GEMINI_MODEL` | Runtime chat model, currently `gemini-3.5-flash-lite`. |
| Variable | `NEXT_PUBLIC_SITE_URL` | Stable public deployment origin. |

Preview may use separate runtime values if preview chat must answer live questions, but preview builds never synchronize or mutate File Search.

## Initial verification

1. Merge the automation PR into `main`.
2. Confirm the Vercel Production build runs `knowledge:verify`, `knowledge:sync -- --reconcile --apply`, and `next build`, in that order.
3. Confirm the sync reports zero unknown documents and the same number of managed documents as `knowledge:verify` reports (about 115 today).
4. Run **Actions -> Detect and commit Autrey Mill website knowledge updates -> Run workflow**.
5. Confirm an unchanged crawl succeeds without creating a commit.
6. Confirm `/`, `/embed`, `/api/health`, one grounded question, one follow-up, source cards, and a contact fallback on the deployed site.

## Permanent page removal

The crawler never infers that approved information should be deleted. HTTP errors, empty responses, redirects, extraction shrinkage, discovery gaps, and crawl-capacity problems retain the last-known-good page. For an intentional permanent removal:

1. Verify the old URL and any replacement in a browser.
2. Confirm no unique program, eligibility, schedule, contact, or location detail would be lost.
3. Add the canonical URL to `knowledge/source/approved-removals.json` in a human-reviewed commit.
4. Run the refresh workflow and inspect the generated deletion and Vercel reconciliation logs.

Removal approvals accept only canonical public `autreymill.org` HTML routes, in trailing-slash form (for example `https://autreymill.org/spring-break-camp/`). The automated crawler never edits the approval allowlist, durable official documents, or staff-managed FAQ sources.

## Triggers and manual commands

Without a CMS webhook, GitHub checks daily at 09:17 UTC. Scheduled jobs can be delayed, so synchronization is eventual rather than tied to an exact minute. An approved CMS integration may send the `repository_dispatch` event type `autrey-mill-website-updated`; its credential should have only dispatch permission.

Manual equivalents:

```bash
npm run knowledge:refresh
npm run knowledge:sync -- --reconcile
npm run knowledge:sync -- --reconcile --apply
```

Only the final apply command mutates the existing store. Use `--new-store` only for initial setup, ownership transfer, or an intentional blue/green rebuild.

## Failure behavior

- No meaningful website change: no commit, deployment, or Gemini request.
- A transient crawl failure is retried once after 30 seconds. A second crawl failure, or any extraction, corpus, prompt-injection, test, lint, typecheck, build, or diff failure: no commit or deployment.
- More than ten changed prepared documents (Autrey Mill often publishes several event posts in one day, so the limit is higher than the template's five), more than two removals, a non-website deletion, or a deletion without exact human approval: no commit; manual review is required.
- Approved-page fetch or suspicious-shrink failure: last-known-good content is retained and reported.
- Staff FAQ or out-of-boundary file change: no commit.
- `main` advances during validation: no push; the next run starts from the new revision.
- Missing Vercel Gemini configuration: the new Production build fails while the existing deployment remains live.
- Unmanaged Gemini documents: reconciliation aborts before mutation.
- Upload failure: pre-existing documents are preserved; deletions start only after every desired replacement is active.
- Next build failure after a successful sync: the prior deployment remains live and the next build safely reconciles again.

File Search store deletion remains manual and permanent:

```bash
npm run knowledge:delete-store -- fileSearchStores/EXACT_STORE_NAME --confirm
```
