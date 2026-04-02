"use client";

import { use } from "react";

import { ProjectChronologyPanel } from "@/components/projects/project-chronology-panel";
import { ProjectPageShell } from "@/components/projects/project-page-shell";

interface ProjectChronologyPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectChronologyPage({ params }: ProjectChronologyPageProps) {
  const { slug } = use(params);

  return (
    <ProjectPageShell slug={slug} activeTab="chronology">
      {(project) => <ProjectChronologyPanel project={project} />}
    </ProjectPageShell>
  );
}
