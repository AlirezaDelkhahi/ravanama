import type { BlogSection } from "./types";

function makeHeadingId(headingText: string, index: number): string {
  const asciiSlug = headingText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return asciiSlug ? `sec-${index + 1}-${asciiSlug}` : `sec-${index + 1}`;
}

/**
 * Parses markdown into structured BlogSection[] split on `## ` and `### ` headings,
 * generating deterministic headingIds for mobile & desktop Table of Contents anchors.
 */
export function parseMarkdownSections(markdown: string): BlogSection[] {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const sections: BlogSection[] = [];
  let current: { headingText: string; level: 2 | 3; lines: string[] } | null =
    null;

  const flushCurrent = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    const paragraphs = body
      ? body
          .split(/\n{2,}/)
          .map((p) => p.replace(/\n+/g, " ").trim())
          .filter(Boolean)
      : [];

    if (current.headingText || paragraphs.length > 0) {
      sections.push({
        headingId: makeHeadingId(current.headingText, sections.length),
        headingText: current.headingText,
        level: current.level,
        paragraphs,
      });
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("### ")) {
      flushCurrent();
      current = {
        headingText: trimmed.slice(4).trim(),
        level: 3,
        lines: [],
      };
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushCurrent();
      current = {
        headingText: trimmed.slice(3).trim(),
        level: 2,
        lines: [],
      };
      continue;
    }
    if (!current) {
      current = {
        headingText: "",
        level: 2,
        lines: [],
      };
    }
    current.lines.push(rawLine);
  }

  flushCurrent();
  return sections;
}
