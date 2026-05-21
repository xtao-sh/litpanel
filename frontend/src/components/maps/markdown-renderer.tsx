"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { processLatex } from "@/lib/render-latex";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarkdownRendererProps {
  content: string;
}

// ---------------------------------------------------------------------------
// Inline text parser: handles **bold**, paper IDs (wXXXXX), and
// [bracketed content] as muted italic text.
// ---------------------------------------------------------------------------

const INLINE_PATTERN =
  /(\*\*w(\d{4,5})(?::\s*[^*]+?)?\*\*)|(\*\*([^*]+)\*\*)|\b(w(\d{4,5}))\b|(\[[^\]]+\])/g;

function renderInlineText(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    // Push preceding plain text (may contain LaTeX)
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain.includes("$") || plain.includes("\\(") || plain.includes("\\[")) {
        const html = processLatex(plain);
        if (html !== plain) {
          nodes.push(<span key={`${keyPrefix}-pre-${match.index}`} dangerouslySetInnerHTML={{ __html: html }} />);
        } else {
          nodes.push(plain);
        }
      } else {
        nodes.push(plain);
      }
    }

    if (match[1]) {
      // **wXXXXX** or **wXXXXX: Title** -- bold paper ID link
      const paperId = `w${match[2]}`;
      const display = match[1].slice(2, -2); // strip ** on both sides
      nodes.push(
        <Link
          key={`${keyPrefix}-${match.index}`}
          href={`/paper/${paperId}`}
          title={`Paper ${paperId}`}
          className="inline-flex items-baseline gap-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-2 py-0.5 font-mono text-sm font-medium text-[var(--forest)] no-underline transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--forest)]"
        >
          {display}
        </Link>
      );
    } else if (match[3]) {
      // **bold text** (non paper-id)
      nodes.push(
        <strong key={`${keyPrefix}-${match.index}`}>{match[4]}</strong>
      );
    } else if (match[5]) {
      // Bare wXXXXX paper ID
      const paperId = match[5];
      nodes.push(
        <Link
          key={`${keyPrefix}-${match.index}`}
          href={`/paper/${paperId}`}
          title={`Paper ${paperId}`}
          className="inline-flex items-baseline gap-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-2 py-0.5 font-mono text-sm font-medium text-[var(--forest)] no-underline transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--forest)]"
        >
          {paperId}
        </Link>
      );
    } else if (match[7]) {
      // [bracketed content]
      nodes.push(
        <span
          key={`${keyPrefix}-${match.index}`}
          className="text-sm italic text-[var(--ink-4)]"
        >
          {match[7]}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text (may contain LaTeX)
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining.includes("$") || remaining.includes("\\(") || remaining.includes("\\[")) {
      const html = processLatex(remaining);
      if (html !== remaining) {
        nodes.push(<span key={`${keyPrefix}-tail`} dangerouslySetInnerHTML={{ __html: html }} />);
      } else {
        nodes.push(remaining);
      }
    } else {
      nodes.push(remaining);
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Heading slug generator (for TOC anchoring)
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Block parser: takes a single paragraph block and returns rendered JSX.
// A "block" is text between double newlines.
// ---------------------------------------------------------------------------

function renderBlock(block: string, blockIndex: number): React.ReactNode {
  const trimmed = block.trim();
  if (!trimmed) return null;

  // --- H2 heading: ## ...
  if (trimmed.startsWith("## ")) {
    const headingText = trimmed.slice(3).trim();
    const id = slugify(headingText);
    return (
      <h2
        key={`h2-${blockIndex}`}
        id={id}
        className="font-display mt-12 mb-4 scroll-mt-24 border-b border-[var(--line-soft)] pb-3 text-3xl tracking-tight text-[var(--ink)]"
      >
        {renderInlineText(headingText, `h2i-${blockIndex}`)}
      </h2>
    );
  }

  // --- H3 heading: ### ...
  if (trimmed.startsWith("### ")) {
    const headingText = trimmed.slice(4).trim();
    const id = slugify(headingText);
    return (
      <h3
        key={`h3-${blockIndex}`}
        id={id}
        className="font-display mt-8 mb-3 scroll-mt-24 text-2xl tracking-tight text-[var(--ink)]/90"
      >
        {renderInlineText(headingText, `h3i-${blockIndex}`)}
      </h3>
    );
  }

  // --- Bullet list: lines starting with "- " (supports one level of nesting via " - ")
  const lines = trimmed.split("\n");
  const allBullets = lines.every(
    (l) => l.trimStart().startsWith("- ") || l.trim() === ""
  );

  if (allBullets) {
    const bulletLines = lines.filter((l) => l.trimStart().startsWith("- "));

    // Build a structure that supports one level of nesting
    const topItems: { text: string; children: string[] }[] = [];
    for (const line of bulletLines) {
      const indent = line.length - line.trimStart().length;
      const text = line.trimStart().slice(2);
      if (indent >= 2 && topItems.length > 0) {
        // Nested bullet: attach to previous top-level item
        topItems[topItems.length - 1].children.push(text);
      } else {
        topItems.push({ text, children: [] });
      }
    }

    return (
      <ul
        key={`ul-${blockIndex}`}
        className="my-4 list-disc space-y-1.5 pl-5 text-[var(--ink-3)]"
      >
        {topItems.map((item, i) => (
          <li key={`li-${blockIndex}-${i}`} className="leading-relaxed">
            {renderInlineText(item.text, `li-${blockIndex}-${i}`)}
            {item.children.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[var(--ink-3)]">
                {item.children.map((child, j) => (
                  <li key={`li-${blockIndex}-${i}-${j}`} className="leading-relaxed">
                    {renderInlineText(child, `li-${blockIndex}-${i}-${j}`)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  }

  // --- Mixed block: may contain some bullet lines and some paragraph lines
  // Split into sub-sections of consecutive bullets and paragraphs
  const parts: React.ReactNode[] = [];
  let currentBulletLines: string[] = [];

  const flushBullets = () => {
    if (currentBulletLines.length > 0) {
      const rawLines = [...currentBulletLines];
      // Build nested structure
      const topItems: { text: string; children: string[] }[] = [];
      for (const raw of rawLines) {
        const indent = raw.length - raw.trimStart().length;
        const text = raw.trimStart().slice(2);
        if (indent >= 2 && topItems.length > 0) {
          topItems[topItems.length - 1].children.push(text);
        } else {
          topItems.push({ text, children: [] });
        }
      }
      const partIdx = parts.length;
      parts.push(
        <ul
          key={`ul-${blockIndex}-${partIdx}`}
          className="my-4 list-disc space-y-1.5 pl-5 text-[var(--ink-3)]"
        >
          {topItems.map((item, i) => (
            <li
              key={`li-${blockIndex}-${partIdx}-${i}`}
              className="leading-relaxed"
            >
              {renderInlineText(item.text, `li-${blockIndex}-${partIdx}-${i}`)}
              {item.children.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[var(--ink-3)]">
                  {item.children.map((child, j) => (
                    <li key={`li-${blockIndex}-${partIdx}-${i}-${j}`} className="leading-relaxed">
                      {renderInlineText(child, `li-${blockIndex}-${partIdx}-${i}-${j}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      );
      currentBulletLines = [];
    }
  };

  for (const line of lines) {
    const stripped = line.trimStart();
    if (stripped.startsWith("- ")) {
      currentBulletLines.push(line);
    } else if (stripped === "") {
      flushBullets();
    } else {
      flushBullets();
      // Check if this line is a heading within a block
      if (stripped.startsWith("## ")) {
        const headingText = stripped.slice(3).trim();
        const id = slugify(headingText);
        parts.push(
          <h2
            key={`h2-${blockIndex}-${parts.length}`}
            id={id}
            className="font-display mt-12 mb-4 scroll-mt-24 border-b border-[var(--line-soft)] pb-3 text-3xl tracking-tight text-[var(--ink)]"
          >
            {renderInlineText(headingText, `h2m-${blockIndex}-${parts.length}`)}
          </h2>
        );
      } else if (stripped.startsWith("### ")) {
        const headingText = stripped.slice(4).trim();
        const id = slugify(headingText);
        parts.push(
          <h3
            key={`h3-${blockIndex}-${parts.length}`}
            id={id}
            className="font-display mt-8 mb-3 scroll-mt-24 text-2xl tracking-tight text-[var(--ink)]/90"
          >
            {renderInlineText(headingText, `h3m-${blockIndex}-${parts.length}`)}
          </h3>
        );
      } else {
        parts.push(
          <p
            key={`p-${blockIndex}-${parts.length}`}
            className="my-4 text-[15px] leading-8 text-[var(--ink-3)]"
          >
            {renderInlineText(stripped, `p-${blockIndex}-${parts.length}`)}
          </p>
        );
      }
    }
  }
  flushBullets();

  if (parts.length === 1) return parts[0];
  return (
    <div key={`block-${blockIndex}`}>
      {parts}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const rendered = useMemo(() => {
    if (!content) return null;
    // Split on double newlines for top-level blocks
    const blocks = content.split(/\n\n+/);
    return blocks.map((block, i) => renderBlock(block, i));
  }, [content]);

  return (
    <div className="prose-custom max-w-3xl text-[15px] leading-relaxed">
      {rendered}
    </div>
  );
}
