"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Download, ChevronDown, FileText, Table2, Copy, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportMenuProps {
  paperIds: string[];
  label?: string;
  /** Compact mode for tight layouts (smaller text, reduced padding) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportMenu({ paperIds, label = "Export", compact = false }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const idsParam = paperIds.join(",");
  const hasIds = paperIds.length > 0;

  const handleExport = useCallback(
    (format: "bibtex" | "csv" | "markdown") => {
      if (!hasIds) return;
      window.open(`${apiUrl}/api/export/${format}?ids=${idsParam}`, "_blank");
      setOpen(false);
    },
    [apiUrl, idsParam, hasIds]
  );

  const handleCopyIds = useCallback(() => {
    if (!hasIds) return;
    navigator.clipboard.writeText(paperIds.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setOpen(false);
  }, [paperIds, hasIds]);

  if (!hasIds) return null;

  const btnClass = compact
    ? "inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    : "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50";

  const iconSize = compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={btnClass}
      >
        <Download className={iconSize} />
        {label}
        <ChevronDown className={compact ? "h-2 w-2" : "h-3 w-3"} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          <button
            type="button"
            onClick={() => handleExport("bibtex")}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-gray-400" />
            Download BibTeX
          </button>
          <button
            type="button"
            onClick={() => handleExport("csv")}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
          >
            <Table2 className="h-3.5 w-3.5 text-gray-400" />
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport("markdown")}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-gray-400" />
            Download Markdown
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            onClick={handleCopyIds}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-gray-400" />
            )}
            {copied ? "Copied!" : "Copy IDs"}
          </button>
        </div>
      )}
    </div>
  );
}
