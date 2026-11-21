import { randomUUID } from "node:crypto";
import type { AppData, Session, Occurrence, AttendanceStatus } from "./types";
import { localDateKey, localDateTimeToISO } from "./timezone";

export const LOCAL_DEMO_TOKEN = "ABS-LOCAL-DEMO";
export function localDemoAllowed(
  env: Record<string, string | undefined>,
  host: string,
): boolean {
  return (
    env.NODE_ENV === "development" &&
    env.LOCAL_DEMO_MODE === "true" &&
    !env.VERCEL &&
    !env.RENDER &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
  );
}
export function createLocalDemo(now = new Date()): AppData {
  const stamp = now.toISOString();
  const today = localDateKey(now);
  const day = (offset: number) =>
    new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  const data: AppData = {
    student: {
      id: randomUUID(),
      full_name: "Demo Student",
      student_identifier: "LOCAL-DEMO",
      academic_year: `${now.getFullYear()}–${now.getFullYear() + 1}`,
      department: "Computer Science",
      group_name: "Group 03",
      semester: "Semester 1",
      timezone: "Africa/Algiers",
      language: "en",
      theme: "dark",
      total_threshold: 5,
      unjustified_threshold: 3,
      show_sunday: false,
      notifications_enabled: true,
      registration_complete: true,
      created_at: stamp,
    },
    modules: [],
    sessions: [],
    occurrences: [],
    attendance: [],
    notifications: [],
    audit: [],
  };
  const names = [
    ["Computer Networks", "NET201", "#93AA84"],
    ["Database Systems", "DB201", "#C49B77"],
    ["Algorithms & Complexity", "ALG201", "#97ABA4"],
    ["Operating Systems", "OS201", "#C7B27F"],
  ];
  names.forEach(([name, code, color], index) => {
    const module = {
      id: randomUUID(),
      name,
      code,
      color,
      professor: ["Dr. Benali", "Dr. Haddad", "Dr. Amrani", "Dr. Mansouri"][
        index
      ],
      description: "Synthetic data for local frontend testing.",
      semester: data.student.semester,
      total_threshold: null,
      unjustified_threshold: null,
      archived_at: null,
      created_at: stamp,
    };
    data.modules.push(module);
    const session: Session = {
      id: randomUUID(),
      module_id: module.id,
      session_type: index % 2 ? "TD" : "Lecture",
      weekday: 1,
      start_time: `${8 + index * 2}:00`.padStart(5, "0"),
      end_time: `${9 + index * 2}:30`.padStart(5, "0"),
      classroom: `B0${index + 1}`,
      professor: module.professor,
      recurrence_start: day(-56),
      recurrence_end: day(28),
      created_at: stamp,
    };
    session.weekday = new Date(`${day(index + 1)}T12:00:00Z`).getUTCDay() || 7;
    data.sessions.push(session);
    for (let week = -8; week <= 4; week++) {
      const date = day(index + 1 + week * 7);
      const occurrence: Occurrence = {
        id: randomUUID(),
        session_id: session.id,
        module_id: module.id,
        occurrence_date: date,
        starts_at: localDateTimeToISO(date, session.start_time),
        ends_at: localDateTimeToISO(date, session.end_time),
        session_type: session.session_type,
        classroom: session.classroom,
        professor: session.professor,
        cancelled: false,
      };
      data.occurrences.push(occurrence);
      if (Date.parse(occurrence.ends_at) > now.getTime()) continue;
      const position = week + 8;
      let status: AttendanceStatus = "present";
      if (index === 0 && position < 4)
        status = position < 2 ? "justified" : "unjustified";
      if (index === 1 && position < 2) status = "unjustified";
      if (index === 2 && position === 0) status = "justified";
      if (index === 3 && position < 3) status = "unjustified";
      data.attendance.push({
        id: randomUUID(),
        module_id: module.id,
        occurrence_id: occurrence.id,
        attendance_status: status,
        note: "Local demo record",
        created_at: stamp,
        updated_at: stamp,
      });
    }
  });
  return data;
}
