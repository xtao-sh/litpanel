"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitCompare,
  X,
  Star,
  FileText,
  ExternalLink,
  FlaskConical,
} from "lucide-react";
import { AtomSearchPicker } from "@/components/shared/atom-search-picker";
import { GET_ATOM } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AtomPaper {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
}

interface AtomDetail {
  slug: string;
  type: string;
  title: string;
  description: string | null;
  evidenceStrength: string | null;
  whenToUse: string | null;
  access: string | null;
  url: string | null;
  paperCount: number;
  papers: AtomPaper[];
}

interface MethodSlot {
  slug: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Evidence color helpers
// ---------------------------------------------------------------------------

function evidenceBadge(strength: string | null) {
  switch (strength?.toLowerCase()) {
    case "strong":
      return (
        <Badge className="border-[var(--forest)] bg-[var(--forest-soft)] text-[var(--forest-2)] hover:bg-[var(--forest-soft)]">
          Strong
        </Badge>
      );
    case "moderate":
      return (
        <Badge className="border-[#d6b678] bg-[#f4ead8] text-[#7a5a18] hover:bg-[#f4ead8]">
          Moderate
        </Badge>
      );
    case "emerging":
      return (
        <Badge className="border-[#bccbe0] bg-[#e9eef6] text-[#223a5e] hover:bg-[#e9eef6]">
          Emerging
        </Badge>
      );
    default:
      return strength ? (
        <Badge variant="secondary">{strength}</Badge>
      ) : null;
  }
}

// ---------------------------------------------------------------------------
// Method Column Component
// ---------------------------------------------------------------------------

function MethodColumn({
  slot,
  onRemove,
}: {
  slot: MethodSlot;
  onRemove: () => void;
}) {
  const { data, loading, error } = useQuery<{ atom: AtomDetail }>(GET_ATOM, {
    variables: { slug: slot.slug },
  });

  const atom = data?.atom;

  if (loading) {
    return (
      <div className="lp-card flex flex-col gap-3 p-4 shadow-none">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <button onClick={onRemove} className="text-[var(--ink-4)] transition-colors hover:text-[var(--ink)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error || !atom) {
    return (
      <div className="lp-card flex flex-col items-center justify-center gap-2 border-[#da9a80]/80 bg-[#f4dfd5]/80 p-6 shadow-none">
        <p className="text-sm text-[#8a3318]">Failed to load {slot.title}</p>
        <button onClick={onRemove} className="text-xs text-[var(--rust)] underline">
          Remove
        </button>
      </div>
    );
  }

  const topPapers = atom.papers.slice(0, 3);

  return (
    <div className="lp-card flex flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[var(--line-soft)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="section-kicker mb-2">Method Slot</p>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">
              {atom.title}
            </h3>
            <Badge variant="outline" className="shrink-0 rounded-full text-[10px] capitalize">
              {atom.type}
            </Badge>
          </div>
          {atom.url && (
            <a
              href={atom.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[var(--forest)] hover:underline"
            >
              <ExternalLink className="h-2.5 w-2.5" /> Source
            </a>
          )}
        </div>
        <button
          onClick={onRemove}
          className="ml-2 shrink-0 rounded-full border border-[var(--line-soft)] p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)]/60 hover:text-[var(--ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body sections */}
      <div className="divide-y divide-[var(--line-soft)]">
        {/* Description */}
        <div className="px-5 py-4">
          <h4 className="section-kicker mb-2">
            Description
          </h4>
          <p className="text-sm leading-6 text-[var(--ink-3)]">
            {atom.description || "No description available."}
          </p>
        </div>

        {/* When to Use */}
        <div className="px-5 py-4">
          <h4 className="section-kicker mb-2">
            When to Use
          </h4>
          <p className="text-sm leading-6 text-[var(--ink-3)]">
            {atom.whenToUse || "Not specified."}
          </p>
        </div>

        {/* Evidence & Paper Count */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h4 className="section-kicker mb-2">
              Evidence
            </h4>
            {evidenceBadge(atom.evidenceStrength)}
          </div>
          <div className="text-right">
            <h4 className="section-kicker mb-2">
              Papers
            </h4>
            <Link
              href={`/explorer?methods=${encodeURIComponent(atom.title)}`}
              className="font-display text-3xl tracking-tight text-[var(--forest)] hover:underline"
            >
              {atom.paperCount}
            </Link>
          </div>
        </div>

        {/* Key Papers */}
        {topPapers.length > 0 && (
          <div className="px-5 py-4">
            <h4 className="section-kicker mb-3">
              Key Papers
            </h4>
            <div className="space-y-1.5">
              {topPapers.map((paper) => (
                <Link
                  key={paper.paperId}
                  href={`/paper/${paper.paperId}`}
                  className="flex items-start gap-1.5 rounded-[var(--r)] border border-transparent bg-[var(--paper)] p-3 text-xs transition-colors hover:border-[var(--line-soft)] hover:bg-[var(--paper-2)]"
                >
                  <FileText className="mt-0.5 h-3 w-3 shrink-0 text-[var(--ink-4)]" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm leading-5 text-[var(--ink)]/85">
                      {paper.title || paper.paperId}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {paper.year && (
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
                          {paper.year}
                        </span>
                      )}
                      {paper.averageScore != null && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#7a5a18]">
                          <Star className="h-2 w-2 fill-current" />
                          {paper.averageScore.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MethodComparisonPage() {
  const [slots, setSlots] = useState<MethodSlot[]>([]);

  const handleAddMethod = useCallback(
    (index: number) => (slug: string, title: string) => {
      // Prevent duplicates
      if (slots.some((s) => s.slug === slug)) return;
      setSlots((prev) => {
        const next = [...prev];
        // Replace at index if it exists, otherwise append
        if (index < next.length) {
          next[index] = { slug, title };
        } else {
          next.push({ slug, title });
        }
        return next;
      });
    },
    [slots]
  );

  const handleRemove = useCallback(
    (index: number) => () => {
      setSlots((prev) => prev.filter((_, i) => i !== index));
    },
    []
  );

  const canAdd = slots.length < 3;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      {/* Header */}
      <div className="lp-card grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] text-[var(--forest)]">
              <GitCompare className="h-5 w-5" />
            </div>
            <p className="section-kicker">Comparison Dossier</p>
          </div>
          <div>
            <h1 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
              Compare Methods
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-4)] sm:text-[15px]">
              Place up to three methods side by side to compare description,
              evidence strength, fit conditions, and representative papers.
            </p>
          </div>
        </div>
        <div className="space-y-3 rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
          <p className="section-kicker">Use This For</p>
          <p className="text-sm leading-6 text-[var(--ink-3)]">
            Checking which identification strategy fits your question, and
            which papers are most representative for each method family.
          </p>
        </div>
      </div>

      {/* Method selectors */}
      <div className="lp-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Comparison Tracks</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-4)]">
              Fill the tracks below. Duplicate methods are ignored.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Existing slots */}
        {slots.map((slot, idx) => (
          <div
            key={slot.slug}
            className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-3 shadow-[var(--shadow-1)]"
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5 text-[var(--forest)]" />
              <span className="truncate text-sm font-medium text-[var(--ink)]">
                {slot.title}
              </span>
              <button
                onClick={handleRemove(idx)}
                className="ml-auto rounded-full border border-[var(--line-soft)] p-1 text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)]/60 hover:text-[var(--ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {/* Add method picker(s) */}
        {canAdd && (
          <AtomSearchPicker
            atomType="method"
            onSelect={handleAddMethod(slots.length)}
            placeholder="Search methods to compare..."
          />
        )}
        </div>
      </div>

      {/* Comparison grid */}
      {slots.length === 0 ? (
        <div className="lp-card flex flex-col items-center justify-center py-16 text-center">
          <GitCompare className="mb-4 h-10 w-10 text-[var(--ink-5)]" />
          <p className="font-display text-2xl tracking-tight text-[var(--ink)]">
            Search and add methods above to start comparing
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--ink-4)]">
            Compare descriptions, evidence strength, and key papers
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot, idx) => (
            <MethodColumn
              key={slot.slug}
              slot={slot}
              onRemove={handleRemove(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
