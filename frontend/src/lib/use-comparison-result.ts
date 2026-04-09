"use client";

import { useEffect, useMemo, useState } from "react";

import type { ComparisonResult } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

interface UseComparisonResult {
  result: ComparisonResult | null;
  loading: boolean;
  error: string | null;
}

export function useComparisonResult(paperIds: string[]): UseComparisonResult {
  const idsKey = useMemo(() => paperIds.join(","), [paperIds]);
  const hasEnoughPaperIds = paperIds.length >= 2;
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(hasEnoughPaperIds);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasEnoughPaperIds) {
      setLoading(false);
      setError(null);
      setResult(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let active = true;

    async function loadComparison() {
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch(`${API_URL}/api/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paper_ids: paperIds }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: ComparisonResult = await res.json();
        if (!active) {
          return;
        }

        if (data.error) {
          setError(data.error);
          return;
        }

        setResult(data);
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof Error && err.name === "AbortError") {
          setError("Request timed out after 30 seconds. Please try again with fewer papers.");
        } else {
          setError(err instanceof Error ? err.message : "Failed to compare papers.");
        }
      } finally {
        clearTimeout(timeout);
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadComparison();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [hasEnoughPaperIds, idsKey, paperIds]);

  return { result, loading, error };
}
