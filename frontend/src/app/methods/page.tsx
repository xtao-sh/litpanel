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
        <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
          Strong
        </Badge>
      );
    case "moderate":
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
          Moderate
        </Badge>
      );
    case "emerging":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
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
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <button onClick={onRemove} className="text-gray-400 hover:text-gray-600">
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
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-600">Failed to load {slot.title}</p>
        <button onClick={onRemove} className="text-xs text-red-500 underline">
          Remove
        </button>
      </div>
    );
  }

  const topPapers = atom.papers.slice(0, 3);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {atom.title}
            </h3>
            <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
              {atom.type}
            </Badge>
          </div>
          {atom.url && (
            <a
              href={atom.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
            >
              <ExternalLink className="h-2.5 w-2.5" /> Source
            </a>
          )}
        </div>
        <button
          onClick={onRemove}
          className="ml-2 shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body sections */}
      <div className="divide-y divide-border">
        {/* Description */}
        <div className="p-4">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h4>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {atom.description || "No description available."}
          </p>
        </div>

        {/* When to Use */}
        <div className="p-4">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            When to Use
          </h4>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {atom.whenToUse || "Not specified."}
          </p>
        </div>

        {/* Evidence & Paper Count */}
        <div className="flex items-center justify-between p-4">
          <div>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence
            </h4>
            {evidenceBadge(atom.evidenceStrength)}
          </div>
          <div className="text-right">
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Papers
            </h4>
            <Link
              href={`/explorer?methods=${encodeURIComponent(atom.title)}`}
              className="text-lg font-bold text-blue-600 hover:underline"
            >
              {atom.paperCount}
            </Link>
          </div>
        </div>

        {/* Key Papers */}
        {topPapers.length > 0 && (
          <div className="p-4">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Key Papers
            </h4>
            <div className="space-y-1.5">
              {topPapers.map((paper) => (
                <Link
                  key={paper.paperId}
                  href={`/paper/${paper.paperId}`}
                  className="flex items-start gap-1.5 rounded-md p-1.5 text-xs transition-colors hover:bg-accent"
                >
                  <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground/80 line-clamp-1 leading-tight">
                      {paper.title || paper.paperId}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {paper.year && (
                        <span className="text-[10px] text-muted-foreground">
                          {paper.year}
                        </span>
                      )}
                      {paper.averageScore != null && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
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
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
          <GitCompare className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Compare Methods
          </h1>
          <p className="text-sm text-muted-foreground">
            Add up to 3 methods to compare side by side
          </p>
        </div>
      </div>

      {/* Method selectors */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Existing slots */}
        {slots.map((slot, idx) => (
          <div key={slot.slug} className="space-y-1">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground truncate">
                {slot.title}
              </span>
              <button
                onClick={handleRemove(idx)}
                className="ml-auto text-gray-400 hover:text-gray-600"
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

      {/* Comparison grid */}
      {slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16">
          <GitCompare className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            Search and add methods above to start comparing
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
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
