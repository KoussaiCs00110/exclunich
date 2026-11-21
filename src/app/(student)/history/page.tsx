import { Suspense } from "react";
import HistoryPage from "@/components/history-page";
export default function Page() {
  return (
    <Suspense>
      <HistoryPage />
    </Suspense>
  );
}
