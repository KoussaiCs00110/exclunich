import { ModuleDetail } from "@/components/modules-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ModuleDetail id={id} />;
}
