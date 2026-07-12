"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { processLatex } from "@/lib/render-latex";
import { buildPaperDetailHref } from "@/lib/navigation";
import { INLINE_PAPER_ID_SOURCE } from "@/lib/paper-identifiers";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SectionContentProps {
  content: string;
}

// ---------------------------------------------------------------------------
// Inline text parser: handles **bold**, *italic*, and supported paper IDs.
// ---------------------------------------------------------------------------

const INLINE_PATTERN = new RegExp(
  `(\\*\\*(${INLINE_PAPER_ID_SOURCE})(?::\\s*[^*]+?)?\\*\\*)|(\\*\\*([^*]+?)\\*\\*)|(\\*([^*]+?)\\*)|\\b(${INLINE_PAPER_ID_SOURCE})\\b`,
  "g"
);

/** Render a plain text segment that may contain LaTeX but no markdown. */
function renderPlainWithLatex(text: string, key: string): React.ReactNode {
  if (!text) return null;
  // Check if text contains LaTeX delimiters
  if (text.includes("$") || text.includes("\\(") || text.includes("\\[")) {
    const html = processLatex(text);
    if (html !== text) {
      return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />;
    }
  }
  return text;
}

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
      nodes.push(renderPlainWithLatex(plain, `${keyPrefix}-pre-${match.index}`));
    }

    if (match[1]) {
      const paperId = match[2];
      const display = match[1].slice(2, -2); // strip ** on both sides
      nodes.push(
        <Link
          key={`${keyPrefix}-${match.index}`}
          href={buildPaperDetailHref({ paperId })}
          className="inline-flex items-baseline gap-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-1.5 py-0.5 font-mono text-sm font-medium text-[var(--forest)] no-underline hover:bg-[var(--paper-2)]"
        >
          {display}
        </Link>
      );
    } else if (match[3]) {
      // **bold text** (non paper-id)
      nodes.push(
        <strong key={`${keyPrefix}-${match.index}`} className="font-semibold text-[var(--ink)]">
          {match[4]}
        </strong>
      );
    } else if (match[5]) {
      // *italic text*
      nodes.push(
        <em key={`${keyPrefix}-${match.index}`}>{match[6]}</em>
      );
    } else if (match[7]) {
      // Bare paper ID
      const paperId = match[7];
      nodes.push(
        <Link
          key={`${keyPrefix}-${match.index}`}
          href={buildPaperDetailHref({ paperId })}
          className="inline-flex items-baseline gap-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-1.5 py-0.5 font-mono text-sm font-medium text-[var(--forest)] no-underline hover:bg-[var(--paper-2)]"
        >
          {paperId}
        </Link>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text (may contain LaTeX)
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    nodes.push(renderPlainWithLatex(remaining, `${keyPrefix}-tail`));
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Block parser: takes a single block (text between double newlines) and
// returns rendered JSX. Handles bullets, numbered lists, and paragraphs.
// ---------------------------------------------------------------------------

const BULLET_RE = /^[\-\*\u2022]\s+/;
const NUMBERED_RE = /^(\d+)\.\s+/;

function renderBlock(block: string, blockIndex: number): React.ReactNode {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const lines = trimmed.split("\n");

  // --- Pure bullet list: all non-empty lines start with - / * / bullet char
  const allBullets = lines.every(
    (l) => BULLET_RE.test(l.trimStart()) || l.trim() === ""
  );
  if (allBullets) {
    const items = lines.filter((l) => BULLET_RE.test(l.trimStart()));
    return (
      <ul
        key={`ul-${blockIndex}`}
        className="my-3 list-disc space-y-1.5 pl-5"
      >
        {items.map((item, i) => {
          const text = item.trimStart().replace(BULLET_RE, "");
          return (
            <li key={`li-${blockIndex}-${i}`} className="leading-relaxed">
              {renderInlineText(text, `li-${blockIndex}-${i}`)}
            </li>
          );
        })}
      </ul>
    );
  }

  // --- Pure numbered list: all non-empty lines start with \d+.
  const allNumbered = lines.every(
    (l) => NUMBERED_RE.test(l.trimStart()) || l.trim() === ""
  );
  if (allNumbered) {
    const items = lines.filter((l) => NUMBERED_RE.test(l.trimStart()));
    return (
      <ol
        key={`ol-${blockIndex}`}
        className="my-3 list-decimal space-y-1.5 pl-5"
      >
        {items.map((item, i) => {
          const text = item.trimStart().replace(NUMBERED_RE, "");
          return (
            <li key={`oli-${blockIndex}-${i}`} className="leading-relaxed">
              {renderInlineText(text, `oli-${blockIndex}-${i}`)}
            </li>
          );
        })}
      </ol>
    );
  }

  // --- Mixed block: may contain bullets, numbered items, and paragraphs
  const parts: React.ReactNode[] = [];
  let currentBullets: string[] = [];
  let currentNumbered: string[] = [];

  const flushBullets = () => {
    if (currentBullets.length > 0) {
      const items = [...currentBullets];
      const idx = parts.length;
      parts.push(
        <ul
          key={`ul-${blockIndex}-${idx}`}
          className="my-2 list-disc pl-5 space-y-1"
        >
          {items.map((item, i) => (
            <li key={`li-${blockIndex}-${idx}-${i}`} className="leading-relaxed">
              {renderInlineText(item, `li-${blockIndex}-${idx}-${i}`)}
            </li>
          ))}
        </ul>
      );
      currentBullets = [];
    }
  };

  const flushNumbered = () => {
    if (currentNumbered.length > 0) {
      const items = [...currentNumbered];
      const idx = parts.length;
      parts.push(
        <ol
          key={`ol-${blockIndex}-${idx}`}
          className="my-2 list-decimal pl-5 space-y-1"
        >
          {items.map((item, i) => (
            <li key={`oli-${blockIndex}-${idx}-${i}`} className="leading-relaxed">
              {renderInlineText(item, `oli-${blockIndex}-${idx}-${i}`)}
            </li>
          ))}
        </ol>
      );
      currentNumbered = [];
    }
  };

  for (const line of lines) {
    const stripped = line.trimStart();

    if (stripped === "") {
      flushBullets();
      flushNumbered();
      continue;
    }

    if (BULLET_RE.test(stripped)) {
      flushNumbered();
      currentBullets.push(stripped.replace(BULLET_RE, ""));
    } else if (NUMBERED_RE.test(stripped)) {
      flushBullets();
      currentNumbered.push(stripped.replace(NUMBERED_RE, ""));
    } else {
      flushBullets();
      flushNumbered();
      parts.push(
          <p key={`p-${blockIndex}-${parts.length}`} className="my-2 leading-relaxed">
          {renderInlineText(stripped, `p-${blockIndex}-${parts.length}`)}
        </p>
      );
    }
  }
  flushBullets();
  flushNumbered();

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return <div key={`block-${blockIndex}`}>{parts}</div>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SectionContent({ content }: SectionContentProps) {
  const rendered = useMemo(() => {
    if (!content) return null;
    // Split on double newlines for top-level blocks
    const blocks = content.split(/\n\n+/);
    return blocks.map((block, i) => renderBlock(block, i));
  }, [content]);

  return (
    <div className="lit-serif-body">
      {rendered}
    </div>
  );
}
