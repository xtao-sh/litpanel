import type { Project, ResearchFilter } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

interface CreateResearchDraftOptions {
  title: string;
  query: string;
  paperIds: string[];
  filters?: ResearchFilter;
  sort?: string;
  description?: string;
}

function humanizeProjectValue(value: string): string {
  return value
    .split(/[_\\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function isResearchDraft(project: Pick<Project, "originType">): boolean {
  return project.originType === "research";
}

export function getProjectTypeLabel(project: Pick<Project, "originType">): string {
  return isResearchDraft(project) ? "Research Draft" : "Curated Review";
}

export function getProjectTypeLabelPlural(isDraft: boolean): string {
  return isDraft ? "Research Drafts" : "Curated Reviews";
}

export function getDashboardProjectLabel(project: Pick<Project, "originType">): string {
  return isResearchDraft(project) ? "Featured Research Draft" : "Featured Curated Review";
}

export function getProjectStatusLabel(status: string | null | undefined): string {
  const normalized = (status ?? "").trim().toLowerCase();

  if (!normalized) {
    return "Status Unknown";
  }

  if (normalized === "draft") {
    return "In Draft";
  }
  if (normalized === "active") {
    return "Active";
  }
  if (normalized === "published") {
    return "Published";
  }
  if (normalized === "archived") {
    return "Archived";
  }

  return humanizeProjectValue(normalized);
}

export function getProjectScopeLabel(scopeType: string | null | undefined): string {
  const normalized = (scopeType ?? "").trim().toLowerCase();

  if (!normalized) {
    return "General Scope";
  }

  if (normalized === "curated_paper_set") {
    return "Curated Paper Set";
  }

  return humanizeProjectValue(normalized);
}

export function sortProjectsByUpdatedAt(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export async function createResearchDraft({
  title,
  query,
  paperIds,
  filters = {},
  sort = "",
  description,
}: CreateResearchDraftOptions): Promise<string> {
  const response = await fetch(`${API_URL}/api/projects/draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      query,
      filters,
      sort,
      paper_ids: paperIds,
      description,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || "Failed to create Research Draft.");
  }

  const slug = payload?.project?.slug;
  if (!slug) {
    throw new Error("Research Draft was created but no slug was returned.");
  }

  return slug;
}
