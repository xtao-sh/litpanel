export const INLINE_PAPER_ID_SOURCE =
  String.raw`(?:w\d{4,6}|demo-\d+|upload_[A-Za-z0-9._-]+|doi_[A-Za-z0-9._-]+|arxiv_[A-Za-z0-9._-]+)`;

export interface ParsedPaperReference {
  id: string;
  description: string | null;
}

export function parsePaperReference(raw: string): ParsedPaperReference | null {
  const match = raw
    .trim()
    .match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s*\(([^)]+)\))?$/);
  if (!match) return null;
  return {
    id: match[1],
    description: match[2]?.trim() || null,
  };
}
