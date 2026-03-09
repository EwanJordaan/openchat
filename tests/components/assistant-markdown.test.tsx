import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AssistantMarkdown } from "@/components/chat/assistant-markdown";

describe("components/chat/assistant-markdown", () => {
  it("renders inline latex as katex markup", () => {
    const html = renderToStaticMarkup(<AssistantMarkdown content={"Inline $E=mc^2$ formula"} />);
    expect(html).toContain("class=\"katex\"");
  });

  it("renders block latex as katex display markup", () => {
    const html = renderToStaticMarkup(<AssistantMarkdown content={"$$\na^2+b^2=c^2\n$$"} />);
    expect(html).toContain("class=\"katex-display\"");
  });

  it("keeps rendering when latex is invalid", () => {
    const html = renderToStaticMarkup(<AssistantMarkdown content={"Invalid: $$\\notacommand{$$"} />);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Invalid:");
  });
});
