"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Download, ChevronDown, FileText, Table2, Copy, Check } from "lucide-react";
import { getApiUrl } from "@/lib/api";

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

  const apiUrl = getApiUrl();
  const idsParam = paperIds.join(",");
  const hasIds = paperIds.length > 0;

  const handleExport = useCallback(
    (format: "bibtex" | "csv" | "markdown" | "ris") => {
      if (!hasIds) return;
      window.open(`${apiUrl}/api/export/${format}?ids=${idsParam}`, "_blank");
      setOpen(false);
    },
    [apiUrl, idsParam, hasIds]
  );

  const handleCopyIds = useCallback(() => {
    if (!hasIds) return;
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      setOpen(false);
      return;
    }
    void navigator.clipboard
      .writeText(paperIds.join(", "))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setCopied(false);
      })
      .finally(() => setOpen(false));
  }, [paperIds, hasIds]);

  if (!hasIds) return null;

  const btnClass = compact
    ? "inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-2.5 py-1 text-[10px] font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
    : "lp-card inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper)]/88 px-3.5 py-2 text-xs font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]";

  const iconSize = compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={btnClass}
        aria-label="Export options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className={iconSize} />
        {label}
        <ChevronDown className={compact ? "h-2 w-2" : "h-3 w-3"} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Export formats"
          className="lp-card absolute right-0 top-full z-50 mt-2 w-52 rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)]/95 p-1.5 shadow-[var(--shadow-2)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("bibtex")}
            className="flex w-full items-center gap-2 rounded-[0.95rem] px-3 py-2.5 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
          >
            <FileText className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            Download BibTeX
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("ris")}
            className="flex w-full items-center gap-2 rounded-[0.95rem] px-3 py-2.5 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
          >
            <FileText className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            Download RIS
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("csv")}
            className="flex w-full items-center gap-2 rounded-[0.95rem] px-3 py-2.5 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
          >
            <Table2 className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            Download CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("markdown")}
            className="flex w-full items-center gap-2 rounded-[0.95rem] px-3 py-2.5 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
          >
            <FileText className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            Download Markdown
          </button>
          <div className="my-1.5 border-t border-[var(--line-soft)]" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyIds}
            className="flex w-full items-center gap-2 rounded-[0.95rem] px-3 py-2.5 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--forest)]" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            )}
            {copied ? "Copied!" : "Copy IDs"}
          </button>
        </div>
      )}
    </div>
  );
}
