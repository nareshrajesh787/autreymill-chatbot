import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { load } from "cheerio";
import mammoth from "mammoth";

import { canonicalizeOrgUrl } from "../src/lib/config";
import type { FaqEntry } from "../src/lib/knowledge/types";

interface ParagraphRecord {
  text: string;
  links: string[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function paragraphsFromMammothHtml(html: string): ParagraphRecord[] {
  const $ = load(html, null, false);
  return $("p, li")
    .toArray()
    .map((element) => {
      const ownContent = $(element).clone();
      ownContent.find("ul, ol").remove();
      return {
        text: ownContent.text().replace(/\s+/g, " ").trim(),
        links: ownContent
        .find("a[href]")
        .toArray()
        .map((anchor) => $(anchor).attr("href")?.trim())
        .filter((href): href is string => Boolean(href)),
      };
    })
    .filter((paragraph) => paragraph.text.length > 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function contactsFrom(records: ParagraphRecord[]): string[] {
  const values: string[] = [];
  for (const record of records) {
    for (const link of record.links) {
      if (link.toLowerCase().startsWith("mailto:")) {
        values.push(link.slice("mailto:".length).toLowerCase());
      }
    }
    values.push(
      ...(record.text.match(
        /[A-Z0-9._%+-]+@autreymill\.org/gi,
      ) ?? []).map((email) => email.toLowerCase()),
    );
  }
  return unique(values);
}

function urlsFrom(records: ParagraphRecord[]): string[] {
  return unique(
    records.flatMap((record) =>
      record.links
        .map(canonicalizeOrgUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

function slugify(question: string): string {
  const slug = normalize(question)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "faq-entry";
}

function isQuestionParagraph(text: string): boolean {
  return text.trim().endsWith("?");
}

/**
 * Generic FAQ parser: any paragraph ending in "?" starts a new entry; every
 * following non-question paragraph (up to the next question) is its answer.
 * This intentionally has no hardcoded question list, so it works for any
 * staff-authored doc that phrases each item as a question.
 */
export function parseFaqParagraphs(paragraphs: ParagraphRecord[]): FaqEntry[] {
  const questionIndexes = paragraphs
    .map((paragraph, index) => (isQuestionParagraph(paragraph.text) ? index : -1))
    .filter((index) => index >= 0);

  const usedIds = new Map<string, number>();
  const entries: FaqEntry[] = [];

  for (let position = 0; position < questionIndexes.length; position += 1) {
    const paragraphIndex = questionIndexes[position];
    const nextBoundary = questionIndexes[position + 1] ?? paragraphs.length;
    const questionRecord = paragraphs[paragraphIndex];
    const answerRecords = paragraphs.slice(paragraphIndex + 1, nextBoundary);
    const answer = answerRecords
      .map((item) => item.text)
      .filter((text) => text.trim().length > 0)
      .join("\n");
    const allRecords = [questionRecord, ...answerRecords];

    const baseId = slugify(questionRecord.text);
    const seenCount = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, seenCount + 1);
    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`;

    const status = answer.trim().length > 0 ? "approved" : "needs_review";

    entries.push({
      id,
      question: questionRecord.text,
      answer: status === "approved" ? answer : "",
      status,
      contacts: contactsFrom(allRecords),
      relatedUrls: urlsFrom(allRecords),
      notes:
        status === "approved"
          ? []
          : ["No answer paragraph was found for this question in the source document."],
      sourceType: "manager_faq",
    });
  }

  return entries;
}

export async function readManagerFaqDocument(docxPath: string): Promise<FaqEntry[]> {
  const result = await mammoth.convertToHtml({ path: docxPath });
  return parseFaqParagraphs(paragraphsFromMammothHtml(result.value));
}

function entryMarkdown(entry: FaqEntry): string {
  const lines = [`## ${entry.question}`, "", `Status: ${entry.status}`];
  if (entry.answer) lines.push("", entry.answer);
  if (entry.contacts.length > 0) {
    lines.push("", `Verified contacts: ${entry.contacts.join(", ")}`);
  }
  if (entry.relatedUrls.length > 0) {
    lines.push("", "Related official pages:", ...entry.relatedUrls.map((url) => `- ${url}`));
  }
  if (entry.notes.length > 0) lines.push("", ...entry.notes.map((note) => `Note: ${note}`));
  return lines.join("\n");
}

export async function writeFaqOutputs(entries: FaqEntry[], outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const approved = entries.filter((entry) => entry.status === "approved");
  const unresolved = entries.filter((entry) => entry.status !== "approved");
  const header = "# Autrey Mill Nature Preserve & Heritage Center manager-provided FAQ\n\nGenerated from the staff-provided DOCX.\n";

  await Promise.all([
    writeFile(
      path.join(outputDir, "manager-faq.json"),
      `${JSON.stringify(entries, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "manager-faq-approved.md"),
      `${header}\n${approved.map(entryMarkdown).join("\n\n")}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "manager-faq-pending.md"),
      `${header}\n${unresolved.map(entryMarkdown).join("\n\n")}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "manager-faq-report.json"),
      `${JSON.stringify(
        {
          parsedAt: new Date().toISOString(),
          totalEntries: entries.length,
          approvedEntries: approved.map((entry) => entry.id),
          pendingEntries: unresolved.map((entry) => ({
            id: entry.id,
            question: entry.question,
            status: entry.status,
            notes: entry.notes,
          })),
        },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  ]);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const root = process.cwd();
  const docxPath = path.resolve(
    root,
    process.argv[2] || "knowledge/source/staff-faq.docx",
  );
  const outputDir = path.resolve(root, "knowledge/generated");

  if (!(await fileExists(docxPath))) {
    process.stdout.write(
      `No staff FAQ document found at ${path.relative(root, docxPath)} — skipping FAQ parsing. ` +
        "This stage is optional; the website crawl and any official documents still produce a knowledge base without it.\n",
    );
    return;
  }

  const entries = await readManagerFaqDocument(docxPath);
  await writeFaqOutputs(entries, outputDir);

  const approved = entries.filter((entry) => entry.status === "approved").length;
  const unresolved = entries.length - approved;
  process.stdout.write(
    `Parsed ${entries.length} FAQ entries: ${approved} approved, ${unresolved} pending or needing review.\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown FAQ parsing error";
    process.stderr.write(`FAQ parsing failed: ${message}\n`);
    process.exitCode = 1;
  });
}
