import { describe, expect, it } from "vitest";

import { parseFaqParagraphs } from "../scripts/parse-manager-faq";

function paragraph(text: string, links: string[] = []) {
  return { text, links };
}

describe("staff FAQ parsing", () => {
  it("pairs each question paragraph with the answer paragraphs that follow it", () => {
    const entries = parseFaqParagraphs([
      paragraph("Intro text before the first question is ignored."),
      paragraph("How do I become a volunteer?"),
      paragraph("Fill out the volunteer application on our website."),
      paragraph("Volunteers under 18 need a parent or guardian signature."),
      paragraph("What are your office hours?"),
      paragraph("Monday through Friday, 9am to 5pm."),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "how-do-i-become-a-volunteer",
      question: "How do I become a volunteer?",
      status: "approved",
      answer:
        "Fill out the volunteer application on our website.\nVolunteers under 18 need a parent or guardian signature.",
    });
    expect(entries[1]).toMatchObject({
      id: "what-are-your-office-hours",
      question: "What are your office hours?",
      status: "approved",
      answer: "Monday through Friday, 9am to 5pm.",
    });
  });

  it("flags a question with no following answer as needs_review", () => {
    const entries = parseFaqParagraphs([
      paragraph("How do I register my child for camp?"),
      paragraph("What programs do you offer?"),
      paragraph("Summer camp, school break camps, and homeschool programs."),
    ]);

    const unanswered = entries.find(
      (entry) => entry.question === "How do I register my child for camp?",
    );
    expect(unanswered?.status).toBe("needs_review");
    expect(unanswered?.answer).toBe("");
    expect(unanswered?.notes).toContain(
      "No answer paragraph was found for this question in the source document.",
    );

    const answered = entries.find(
      (entry) => entry.question === "What programs do you offer?",
    );
    expect(answered?.status).toBe("approved");
  });

  it("extracts staff email contacts and canonicalized autreymill.org links, ignoring off-domain URLs", () => {
    const entries = parseFaqParagraphs([
      paragraph("Who should I contact about volunteering?", [
        "mailto:volunteer@autreymill.org",
      ]),
      paragraph(
        "Email volunteer@autreymill.org or see autreymill.org/get-involved.",
        ["https://autreymill.org/get-involved", "https://example.com/unrelated"],
      ),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.contacts).toEqual(["volunteer@autreymill.org"]);
    // Canonicalized to WordPress's trailing-slash permalink form.
    expect(entries[0]?.relatedUrls).toEqual([
      "https://autreymill.org/get-involved/",
    ]);
  });

  it("deduplicates identical question text with a numeric suffix", () => {
    const entries = parseFaqParagraphs([
      paragraph("What are your office hours?"),
      paragraph("Monday through Friday."),
      paragraph("What are your office hours?"),
      paragraph("Saturdays by appointment only."),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual([
      "what-are-your-office-hours",
      "what-are-your-office-hours-2",
    ]);
  });
});
