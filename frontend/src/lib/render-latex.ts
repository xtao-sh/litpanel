/**
 * Render LaTeX expressions in text using KaTeX.
 *
 * Handles:
 *   - Display math: $$...$$
 *   - Inline math: $...$  (single dollar, not preceded/followed by digit to avoid money amounts)
 *   - \(...\) and \[...\] delimiters
 *
 * Returns HTML string with <span class="katex">...</span> replacements.
 * Falls back to the raw LaTeX string on parse errors.
 */

import katex from "katex";

/** Render a single LaTeX expression to HTML, returning raw on failure. */
function renderOne(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
    });
  } catch {
    // On any error, return the original expression wrapped in <code>
    const escaped = expr
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const delim = displayMode ? "$$" : "$";
    return `<code>${delim}${escaped}${delim}</code>`;
  }
}

/**
 * Process a string, replacing all LaTeX expressions with rendered HTML.
 * Returns an HTML string.
 */
export function processLatex(text: string): string {
  if (!text) return text;

  // Quick check: if no $ or \ present, skip processing entirely
  if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[")) {
    return text;
  }

  let result = text;

  // 1. Display math: $$...$$ (must come before inline to avoid double-matching)
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr) => {
    return renderOne(expr.trim(), true);
  });

  // 2. Display math: \[...\]
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_match, expr) => {
    return renderOne(expr.trim(), true);
  });

  // 3. Inline math: $...$ (avoid matching money like $16 or $1.50)
  //    Require non-digit after opening $ and non-digit before closing $
  result = result.replace(
    /(?<!\w)\$(?!\d)((?:[^$\\]|\\.)+?)\$(?!\d)/g,
    (_match, expr) => {
      // Skip if it looks like a money amount
      if (/^\d+([.,]\d+)?$/.test(expr.trim())) return _match;
      return renderOne(expr.trim(), false);
    }
  );

  // 4. Inline math: \(...\)
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_match, expr) => {
    return renderOne(expr.trim(), false);
  });

  return result;
}

/**
 * Strip LaTeX delimiters for plain-text display (e.g., collapsed previews).
 */
export function stripLatex(text: string): string {
  if (!text) return text;
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\\\[([\s\S]+?)\\\]/g, "$1")
    .replace(/(?<!\w)\$(?!\d)((?:[^$\\]|\\.)+?)\$(?!\d)/g, "$1")
    .replace(/\\\(([\s\S]+?)\\\)/g, "$1");
}
