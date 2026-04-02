"use client";

import { use } from "react";

import { ProjectMatrixPanel } from "@/components/projects/project-matrix-panel";
import { ProjectPageShell } from "@/components/projects/project-page-shell";

interface ProjectMatrixPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectMatrixPage({ params }: ProjectMatrixPageProps) {
  const { slug } = use(params);

  return (
    <ProjectPageShell slug={slug} activeTab="matrix">
      {(project) => (
        <ProjectMatrixPanel
          papers={project.papers ?? []}
          projectTitle={project.title}
          projectSlug={project.slug}
        />
      )}
    </ProjectPageShell>
  );
}
