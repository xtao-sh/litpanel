"use client";

import { use } from "react";

import { ProjectGapsPanel } from "@/components/projects/project-gaps-panel";
import { ProjectPageShell } from "@/components/projects/project-page-shell";

interface ProjectGapsPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectGapsPage({ params }: ProjectGapsPageProps) {
  const { slug } = use(params);

  return (
    <ProjectPageShell slug={slug} activeTab="gaps">
      {(project) => (
        <ProjectGapsPanel
          landscape={project.landscape}
          slug={project.slug}
          projectTitle={project.title}
          originQuery={project.originQuery}
        />
      )}
    </ProjectPageShell>
  );
}
