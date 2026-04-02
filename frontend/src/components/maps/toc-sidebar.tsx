"use client";

import React, { useMemo, useEffect, useState, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

interface TocSidebarProps {
  content: string;
}

// ---------------------------------------------------------------------------
// Parse headings from markdown content
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*([^*]+)\*\*/g, "$1") // strip bold markers
    .replace(/\b(w\d{4,5})\b/g, "$1") // preserve paper IDs as-is
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseHeadings(content: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      const text = trimmed
        .slice(4)
        .trim()
        .replace(/\*\*/g, "");
      entries.push({ id: slugify(trimmed.slice(4).trim()), text, level: 3 });
    } else if (trimmed.startsWith("## ")) {
      const text = trimmed
        .slice(3)
        .trim()
        .replace(/\*\*/g, "");
      entries.push({ id: slugify(trimmed.slice(3).trim()), text, level: 2 });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TocSidebar({ content }: TocSidebarProps) {
  const headings = useMemo(() => parseHeadings(content), [content]);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Track which heading is in view
  useEffect(() => {
    if (headings.length === 0) return;

    const headingIds = headings.map((h) => h.id);
    const visibleSet = new Set<string>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSet.add(entry.target.id);
          } else {
            visibleSet.delete(entry.target.id);
          }
        }

        // Pick the first visible heading in document order
        for (const id of headingIds) {
          if (visibleSet.has(id)) {
            setActiveId(id);
            return;
          }
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    // Observe all heading elements
    for (const { id } of headings) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [headings]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Update active immediately for responsiveness
        setActiveId(id);
      }
    },
    []
  );

  if (headings.length === 0) return null;

  return (
    <nav className="sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        On this page
      </p>
      <ul className="space-y-0.5 border-l border-gray-200">
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={(e) => handleClick(e, h.id)}
                className={`block border-l-2 py-1.5 text-sm leading-snug transition-colors ${
                  h.level === 3 ? "pl-6 text-muted-foreground" : "pl-3"
                } ${
                  isActive
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-foreground"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
