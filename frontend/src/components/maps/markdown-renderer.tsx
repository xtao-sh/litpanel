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
          className="inline-flex items-baseline gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-sm font-medium text-blue-700 no-underline hover:bg-blue-100 hover:text-blue-800"
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
          className="inline-flex items-baseline gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-sm font-medium text-blue-700 no-underline hover:bg-blue-100 hover:text-blue-800"
        >
          {paperId}
        </Link>
      );
    } else if (match[7]) {
      // [bracketed content]
      nodes.push(
        <span
          key={`${keyPrefix}-${match.index}`}
          className="text-sm italic text-muted-foreground"
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
        className="mt-10 mb-4 scroll-mt-24 border-b border-gray-200 pb-2 text-xl font-semibold tracking-tight text-gray-900"
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
        className="mt-6 mb-3 scroll-mt-24 text-lg font-medium text-gray-800"
      >
        {renderInlineText(headingText, `h3i-${blockIndex}`)}
      </h3>
    );
  }

  // --- Bullet list: lines starting with "- "
  const lines = trimmed.split("\n");
  const allBullets = lines.every(
    (l) => l.trimStart().startsWith("- ") || l.trim() === ""
  );

  if (allBullets) {
    const items = lines.filter((l) => l.trimStart().startsWith("- "));
    return (
      <ul
        key={`ul-${blockIndex}`}
        className="my-3 list-disc pl-5 space-y-1 text-gray-700"
      >
        {items.map((item, i) => {
          const text = item.trimStart().slice(2);
          return (
            <li key={`li-${blockIndex}-${i}`} className="leading-relaxed">
              {renderInlineText(text, `li-${blockIndex}-${i}`)}
            </li>
          );
        })}
      </ul>
    );
  }

  // --- Mixed block: may contain some bullet lines and some paragraph lines
  // Split into sub-sections of consecutive bullets and paragraphs
  const parts: React.ReactNode[] = [];
  let currentBullets: string[] = [];

  const flushBullets = () => {
    if (currentBullets.length > 0) {
      const bulletsCopy = [...currentBullets];
      parts.push(
        <ul
          key={`ul-${blockIndex}-${parts.length}`}
          className="my-3 list-disc pl-5 space-y-1 text-gray-700"
        >
          {bulletsCopy.map((item, i) => (
            <li
              key={`li-${blockIndex}-${parts.length}-${i}`}
              className="leading-relaxed"
            >
              {renderInlineText(item, `li-${blockIndex}-${parts.length}-${i}`)}
            </li>
          ))}
        </ul>
      );
      currentBullets = [];
    }
  };

  for (const line of lines) {
    const stripped = line.trimStart();
    if (stripped.startsWith("- ")) {
      currentBullets.push(stripped.slice(2));
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
            className="mt-10 mb-4 scroll-mt-24 border-b border-gray-200 pb-2 text-xl font-semibold tracking-tight text-gray-900"
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
            className="mt-6 mb-3 scroll-mt-24 text-lg font-medium text-gray-800"
          >
            {renderInlineText(headingText, `h3m-${blockIndex}-${parts.length}`)}
          </h3>
        );
      } else {
        parts.push(
          <p
            key={`p-${blockIndex}-${parts.length}`}
            className="my-3 leading-relaxed text-gray-700"
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
