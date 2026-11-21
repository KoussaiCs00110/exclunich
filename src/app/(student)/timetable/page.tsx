"use client";
import { Timetable } from "@/components/timetable";
import { useWorkspace } from "@/components/workspace";
export default function Page() {
  const { data, mutate, refresh } = useWorkspace();
  return <Timetable data={data} onMutate={mutate} onRefresh={refresh} />;
}
