"use client";
import { Analytics } from "@/components/analytics";
import { useWorkspace } from "@/components/workspace";
import { t } from "@/lib/i18n";
export default function Page() {
  const { data } = useWorkspace();
  const language = data.student.language;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t(language, "statistics.eyebrow")}</div>
          <h1>{t(language, "statistics")}</h1>
          <p>{t(language, "statistics.subtitle")}</p>
        </div>
      </div>
      <Analytics data={data} />
    </>
  );
}
