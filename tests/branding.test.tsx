import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";
import { LearnAILogo, AutreyMillLogo } from "@/components/branding/BrandLogos";
import { ChatPanel } from "@/components/chatbot/ChatPanel";

afterEach(cleanup);

function imageSource(image: HTMLImageElement): string {
  return `${image.getAttribute("src") || ""} ${image.getAttribute("srcset") || ""}`;
}

describe("product branding", () => {
  it("uses the supplied Autrey Mill image asset", () => {
    render(<AutreyMillLogo />);
    expect(
      imageSource(
        screen.getByAltText("Autrey Mill Nature Preserve & Heritage Center") as HTMLImageElement,
      ),
    ).toContain("branding%2Fautrey-mill-logo.png");
  });

  it("brands the standalone page with the Autrey Mill logo", () => {
    const { container } = render(<Home />);
    const sources = [...container.querySelectorAll("img")].map(imageSource);
    expect(
      sources.filter((source) => source.includes("autrey-mill-logo.png")).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("shows Autrey Mill branding and the LearnAI prototype credit inside the chat panel", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    const { container } = render(
      <ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />,
    );
    const sources = [...container.querySelectorAll("img")].map(imageSource);
    expect(
      sources.some((source) => source.includes("autrey-mill-logo.png")),
    ).toBe(true);
    expect(
      sources.some((source) => source.includes("learnai-logo.png")),
    ).toBe(true);
    expect(screen.getByText("LearnAI")).toBeDefined();
  });

  it("uses the LearnAI image asset", () => {
    render(<LearnAILogo />);
    expect(
      imageSource(screen.getByAltText("LearnAI") as HTMLImageElement),
    ).toContain("branding%2Flearnai-logo.png");
  });
});
