"use client";

import Link from "next/link";
import { Filter } from "lucide-react";
import type { Atom } from "@/lib/types";

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  mechanism: { bg: "bg-[#f4ead8]", text: "text-[#654814]", border: "border-[#d6b678]" },
  method: { bg: "bg-[var(--forest-soft)]", text: "text-[var(--forest-2)]", border: "border-[var(--forest)]" },
  dataset: { bg: "bg-[#e9eef6]", text: "text-[#1b2e4d]", border: "border-[#bccbe0]" },
  puzzle: { bg: "bg-[#f4dfd5]", text: "text-[#742b14]", border: "border-[#da9a80]" },
};

const TYPE_LABELS: Record<string, string> = {
  mechanism: "Mechanisms",
  method: "Methods",
  dataset: "Datasets",
  puzzle: "Puzzles",
};

interface AtomChipsProps {
  atoms: Atom[];
  getAtomHref?: (slug: string) => string;
  getExplorerHref?: (slug: string) => string;
}

export function AtomChips({ atoms, getAtomHref, getExplorerHref }: AtomChipsProps) {
  if (atoms.length === 0) return null;

  // Group by type
  const grouped = new Map<string, Atom[]>();
  for (const atom of atoms) {
    const list = grouped.get(atom.type) ?? [];
    list.push(atom);
    grouped.set(atom.type, list);
  }

  // Render in consistent order
  const typeOrder = ["mechanism", "method", "dataset", "puzzle"];

  return (
    <div className="space-y-5">
      {typeOrder.map((type) => {
        const items = grouped.get(type);
        if (!items || items.length === 0) return null;
        const colors = TYPE_COLORS[type] ?? TYPE_COLORS.mechanism;

        return (
          <div key={type}>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--ink-3)]">
              <span className={`inline-block h-2 w-2 rounded-full ${colors.bg.replace("bg-", "bg-").replace("-50", "-500")}`} style={{ backgroundColor: type === "mechanism" ? "#b88a3b" : type === "method" ? "#15803d" : type === "dataset" ? "#2c4870" : "#b54820" }} />
              {TYPE_LABELS[type] ?? type}
            </h4>
            <div className="flex flex-wrap gap-2">
              {items.map((atom) => (
                <span
                  key={atom.slug}
                  className={`
                    relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1
                    text-xs font-medium
                    ${colors.bg} ${colors.text} ${colors.border}
                  `}
                >
                  <Link
                    href={getAtomHref ? getAtomHref(atom.slug) : `/atom/${atom.slug}`}
                    className="max-w-48 truncate hover:underline"
                  >
                    {atom.title}
                  </Link>
                  <span
                    className={`
                      inline-flex h-4.5 min-w-4.5 items-center justify-center
                      rounded-full bg-[var(--paper)]/70 px-1 text-[10px] font-semibold
                    `}
                  >
                    {atom.paperCount}
                  </span>
                  <Link
                    href={
                      getExplorerHref
                        ? getExplorerHref(atom.slug)
                        : `/explorer?tab=papers&atomSlug=${encodeURIComponent(atom.slug)}`
                    }
                    className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--ink)]/10 transition-colors"
                    title="Filter papers by this atom in Explorer"
                  >
                    <Filter className="h-3 w-3" />
                  </Link>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
