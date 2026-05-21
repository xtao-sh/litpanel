"use client";

import React from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// NoteRenderer: parses [[wXXXXX]] and [[atom_slug]] into clickable links
// ---------------------------------------------------------------------------

interface NoteRendererProps {
  content: string;
}

/**
 * Renders note text, converting [[wXXXXX]] patterns into links to /paper/wXXXXX
 * and [[slug]] patterns into links to /atom/slug.
 */
export function NoteRenderer({ content }: NoteRendererProps) {
  if (!content) return null;

  // Split on [[ ... ]] patterns
  const parts: React.ReactNode[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const ref = match[1].trim();
    // Determine if it's a paper ID (starts with 'w' followed by digits) or an atom slug
    const isPaper = /^w\d{4,6}$/.test(ref);
    const href = isPaper ? `/paper/${ref}` : `/atom/${ref}`;

    parts.push(
      <Link
        key={`link-${match.index}`}
        href={href}
        className="inline-flex items-center gap-0.5 rounded bg-[#e9eef6] px-1 py-0.5 text-[#2c4870] hover:bg-[#e9eef6] hover:text-[#223a5e] font-medium transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {ref}
      </Link>
    );

    lastIndex = regex.lastIndex;
  }

  // Remaining text after last match
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <span>{parts}</span>;
}

// ---------------------------------------------------------------------------
// Utility: Extract all entity references from note text
// ---------------------------------------------------------------------------

export function extractNoteReferences(content: string): { papers: string[]; atoms: string[] } {
  const papers: string[] = [];
  const atoms: string[] = [];

  const regex = /\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const ref = match[1].trim();
    if (/^w\d{4,6}$/.test(ref)) {
      if (!papers.includes(ref)) papers.push(ref);
    } else {
      if (!atoms.includes(ref)) atoms.push(ref);
    }
  }

  return { papers, atoms };
}
