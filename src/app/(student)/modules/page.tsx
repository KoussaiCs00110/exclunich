import { Suspense } from "react";
import ModulesPage from "@/components/modules-page";
export default function Page() {
  return (
    <Suspense>
      <ModulesPage />
    </Suspense>
  );
}
