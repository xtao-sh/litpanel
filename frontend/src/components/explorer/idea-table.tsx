"use client";

import React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import type { Idea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case "new":
      return "bg-[#e9eef6] text-[#1b2e4d]";
    case "developing":
      return "bg-[#f4ead8] text-[#654814]";
    case "promoted":
      return "bg-[var(--forest-soft)] text-[var(--forest-2)]";
    case "killed":
      return "bg-[#f4dfd5] text-[#742b14]";
    default:
      return "bg-[var(--paper-2)] text-[var(--ink-3)]";
  }
}

function scoreBadgeClass(score: number | null): string {
  if (score == null) return "bg-[var(--paper-2)] text-[var(--ink-4)]";
  if (score >= 4) return "bg-[var(--forest-soft)] text-[var(--forest-2)]";
  if (score >= 3) return "bg-[#f4ead8] text-[#654814]";
  return "bg-[var(--paper-2)] text-[var(--ink-3)]";
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

function SortIcon({ column }: { column: { getIsSorted: () => false | "asc" | "desc" } }) {
  const sorted = column.getIsSorted();
  if (sorted === "asc") return <ArrowUp className="ml-1 inline h-3 w-3 text-[var(--ink)]" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 inline h-3 w-3 text-[var(--ink)]" />;
  return <ArrowUpDown className="ml-1 inline h-3 w-3 text-[var(--ink-4)]/40" />;
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function createColumns(t: (key: string, vars?: Record<string, string | number>) => string): ColumnDef<Idea>[] {
  return [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.id")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm text-[var(--ink-3)]">
        {row.original.id.length > 10
          ? row.original.id.slice(0, 8) + ".."
          : row.original.id}
      </span>
    ),
    size: 90,
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.title")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.title}</span>
    ),
    size: 300,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.status")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const status = row.original.status;
      if (!status) return <span className="text-[var(--ink-5)] text-sm">-</span>;
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(status)}`}
        >
          {t(`explorer.values.${status}`)}
        </span>
      );
    },
    size: 100,
  },
  {
    accessorKey: "novelty",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.novelty")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const v = row.original.novelty;
      return (
        <span
          className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${scoreBadgeClass(v)}`}
        >
          {v ?? "-"}
        </span>
      );
    },
    size: 80,
  },
  {
    accessorKey: "feasibility",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.feasibility")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const v = row.original.feasibility;
      return (
        <span
          className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${scoreBadgeClass(v)}`}
        >
          {v ?? "-"}
        </span>
      );
    },
    size: 80,
  },
  {
    accessorKey: "impact",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.impact")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const v = row.original.impact;
      return (
        <span
          className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${scoreBadgeClass(v)}`}
        >
          {v ?? "-"}
        </span>
      );
    },
    size: 80,
  },
  {
    accessorKey: "composite",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.composite")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const v = row.original.composite;
      return (
        <span className="text-sm font-medium tabular-nums">
          {v != null ? v.toFixed(1) : "-"}
        </span>
      );
    },
    size: 90,
  },
  ];
}

// ---------------------------------------------------------------------------
// Table Component
// ---------------------------------------------------------------------------

interface IdeaTableProps {
  data: Idea[];
  loading: boolean;
  onRowClick: (idea: Idea) => void;
  selectedId: string | null;
}

export function IdeaTable({
  data,
  loading,
  onRowClick,
  selectedId,
}: IdeaTableProps) {
  const { t } = useI18n();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // TanStack Table exposes imperative instance methods; React Compiler skips memoization here by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: createColumns(t),
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return <TableSkeleton rows={10} cols={7} />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-[var(--ink-4)]">
        <p className="text-sm">{t("explorer.empty.ideas")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-[var(--line-soft)] bg-[var(--paper-2)]/50"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-[var(--ink-4)]"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`h-11 cursor-pointer border-b border-[var(--line-soft)] transition-colors hover:bg-[var(--paper-2)] ${
                  row.original.id === selectedId
                    ? "bg-[var(--ink)]/5 border-l-2 border-l-[var(--forest)]"
                    : ""
                }`}
                onClick={() => onRowClick(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 text-sm">
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[var(--line-soft)] px-4 py-3">
        <p className="text-sm text-[var(--ink-4)]">
          {t("explorer.counts.showingIdeas", { count: data.length })}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Skeleton
// ---------------------------------------------------------------------------

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-0">
      <div className="flex gap-3 border-b border-[var(--line-soft)] bg-[var(--paper-2)]/50 px-3 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-3 border-b border-[var(--line-soft)] px-3 py-3"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
