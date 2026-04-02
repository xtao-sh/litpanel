"use client";

import { use } from "react";

import { ProjectMethodsPanel } from "@/components/projects/project-methods-panel";
import { ProjectPageShell } from "@/components/projects/project-page-shell";

interface ProjectMethodsPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectMethodsPage({ params }: ProjectMethodsPageProps) {
  const { slug } = use(params);

  return (
    <ProjectPageShell slug={slug} activeTab="methods">
      {(project) => (
        <ProjectMethodsPanel
          landscape={project.landscape}
          paperCount={project.paperCount}
          projectSlug={project.slug}
          projectTitle={project.title}
          originQuery={project.originQuery}
        />
      )}
    </ProjectPageShell>
  );
}
