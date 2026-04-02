"use client";

import { use } from "react";

import { ProjectPageShell } from "@/components/projects/project-page-shell";
import { ProjectThemesPanel } from "@/components/projects/project-themes-panel";

interface ProjectThemesPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectThemesPage({ params }: ProjectThemesPageProps) {
  const { slug } = use(params);

  return (
    <ProjectPageShell slug={slug} activeTab="themes">
      {(project) => (
        <ProjectThemesPanel
          landscape={project.landscape}
          papers={project.papers ?? []}
          projectSlug={project.slug}
          projectTitle={project.title}
          originQuery={project.originQuery}
        />
      )}
    </ProjectPageShell>
  );
}
