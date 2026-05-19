import { Suspense } from "react";
import { notFound } from "next/navigation";

import { WorkspacePage } from "@/components/workspace-page";
import { isSection, type Section } from "@/lib/workspace";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSection(section) || section === "dashboard") {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <WorkspacePage section={section as Section} />
    </Suspense>
  );
}