import { requireStudent } from "@/lib/server/auth";
import { Workspace } from "@/components/workspace";
import { localDemoEnabled } from "@/lib/server/local-demo";
export const dynamic = "force-dynamic";
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await requireStudent();
  return (
    <Workspace initialData={data} demo={await localDemoEnabled()}>
      {children}
    </Workspace>
  );
}
