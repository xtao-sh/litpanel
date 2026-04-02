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
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
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
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          Field Maps
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Synthesized views across the research landscape
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
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
                <Card className="group h-full cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {map.title}
                      </h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {description}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
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
