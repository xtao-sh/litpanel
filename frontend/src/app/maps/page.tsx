"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import {
  Globe,
  FlaskConical,
  Swords,
  Compass,
  Lightbulb,
  ArrowRight,
} from "lucide-react";

import { GET_FIELD_MAPS } from "@/lib/queries";
import type { FieldMap } from "@/lib/types";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Map metadata keyed by slug
// ---------------------------------------------------------------------------

const MAP_META: Record<
  string,
  { description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  research_landscape: {
    description:
      "Key questions, methods, consensus, and debates organized by field",
    icon: Globe,
  },
  method_registry: {
    description: "Catalog of econometric methods and their applications",
    icon: FlaskConical,
  },
  debate_map: {
    description: "Active debates and competing findings in the literature",
    icon: Swords,
  },
  frontier_gaps: {
    description:
      "Identified gaps in the literature with feasibility assessments",
    icon: Compass,
  },
  idea_bank: {
    description: "Map-level index of research ideas",
    icon: Lightbulb,
  },
};

// Fallback icon for unknown slugs
function DefaultIcon({ className }: { className?: string }) {
  return <Globe className={className} />;
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function MapGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="paper-panel overflow-hidden p-0">
          <CardHeader className="pb-3 pt-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-2xl" />
              <Skeleton className="h-5 w-40" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface FieldMapsData {
  fieldMaps: Pick<FieldMap, "slug" | "title">[];
}

export default function FieldMapsPage() {
  const { data, loading, error } = useQuery<FieldMapsData>(GET_FIELD_MAPS);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="paper-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <p className="section-kicker">Atlas Layer</p>
          <div>
            <h2 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">
              Field Maps
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
              Read synthesized field briefs across the archive: landscapes,
              methods, debates, frontier gaps, and idea banks.
            </p>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
          <p className="section-kicker">Reading Mode</p>
          <p className="mt-2 text-sm leading-6 text-foreground/80">
            Use maps to move from scattered papers toward higher-level field
            structure and recurring research questions.
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="paper-panel border-red-200/80 bg-red-50/80 p-4 shadow-none">
          <p className="text-sm text-red-700">
            Failed to load field maps. Please try again later.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && <MapGridSkeleton />}

      {/* Cards grid */}
      {data?.fieldMaps && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.fieldMaps.map((map) => {
            const meta = MAP_META[map.slug];
            const Icon = meta?.icon ?? DefaultIcon;
            const description =
              meta?.description ?? "Synthesized field map overview";

            return (
              <Link key={map.slug} href={`/maps/${map.slug}`}>
                <Card className="paper-panel group h-full cursor-pointer p-0 transition-all duration-200 hover:-translate-y-1">
                  <CardHeader className="border-b border-border/70 pb-4 pt-5">
                    <p className="section-kicker mb-3">Field Brief</p>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border border-border/70 bg-background/80 text-primary transition-colors group-hover:bg-accent/55">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-display text-2xl tracking-tight text-foreground">
                        {map.title}
                      </h3>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 py-5">
                    <p className="text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                    <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.18em] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Open map <ArrowRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
