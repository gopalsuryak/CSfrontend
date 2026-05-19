import { Suspense } from "react";

import { WorkspacePage } from "@/components/workspace-page";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <WorkspacePage section="dashboard" />
    </Suspense>
  );
}

