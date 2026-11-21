import { expect, test, type Page } from "@playwright/test";

async function api(page: Page, path: string, body?: Record<string, unknown>) {
  const response = await page.request.fetch(path, {
    method: body ? "POST" : "GET",
    headers: body
      ? { Origin: new URL(page.url()).origin, "Content-Type": "application/json" }
      : undefined,
    data: body,
  });
  const result = await response.json();
  expect(response.ok(), result.error || "API request").toBeTruthy();
  return result.data;
}

for (const field of ["semester", "academic_year"] as const) {
  test(`changing ${field} archives the old timetable and preserves history`, async ({ page }) => {
    await page.goto("/login");
    const account = await api(page, "/api/auth", {
      action: "register",
      full_name: "Term Change Student",
      academic_year: "2026–2027",
      department: "Computer Science",
      group_name: "Term Test",
      semester: "Semester 1",
    });
    try {
      await api(page, "/api/auth", { action: "confirm", saved: true });
      const module = await api(page, "/api/data", {
        action: "module_save",
        name: "Previous Term Networks",
        code: "TERM-NET",
        color: "#628b75",
        semester: "Semester 1",
      });
      const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      await api(page, "/api/data", {
        action: "session_save",
        module_id: module.id,
        session_type: "TD",
        weekday: new Date(`${date}T12:00:00Z`).getUTCDay() || 7,
        start_time: "09:00",
        end_time: "10:00",
        recurrence_start: date,
        recurrence_end: date,
      });
      const before = await api(page, "/api/data");
      await api(page, "/api/data", {
        action: "attendance_save",
        occurrence_id: before.occurrences[0].id,
        attendance_status: "unjustified",
        note: "Retained previous-term attendance",
      });
      await page.goto("/settings");
      await expect(page.getByText(/Changing your semester or academic year automatically archives/)).toBeVisible();
      const value = field === "semester" ? "Semester 2" : "2027–2028";
      await page.locator(field === "semester" ? "#settings-semester" : "#settings-year").selectOption(value);
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByText("New term saved. Previous modules and timetable archived.")).toBeVisible();
      const archived = await api(page, "/api/data");
      expect(archived.student[field]).toBe(value);
      expect(archived.modules[0].archived_at).toBeTruthy();
      expect(archived.modules[0].academic_year).toBe("2026–2027");
      expect(archived.sessions).toEqual(before.sessions);
      expect(archived.occurrences).toEqual(before.occurrences);
      expect(archived.attendance[0].note).toBe("Retained previous-term attendance");
      await page.goto("/timetable");
      await expect(page.getByRole("heading", { name: "Make room for your semester" })).toBeVisible();
      await page.goto("/modules");
      await page.getByRole("button", { name: "Archived", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Previous Term Networks", exact: true })).toBeVisible();
      await page.goto("/history");
      await expect(page.locator(".history-desktop:visible, .history-mobile:visible").getByText("Retained previous-term attendance", { exact: true })).toBeVisible();
      const fresh = await api(page, "/api/data", {
        action: "module_save",
        name: "New Term Networks",
        code: "TERM-NET",
        color: "#628b75",
        semester: archived.student.semester,
      });
      const snapshot = await api(page, "/api/data");
      expect(snapshot.modules.find((item: { id: string }) => item.id === fresh.id).archived_at).toBeNull();
      await api(page, "/api/data", {
        action: "profile_save",
        ...snapshot.student,
        student_identifier: snapshot.student.student_identifier ?? "",
        full_name: "Updated Term Student",
      });
      const repeated = await api(page, "/api/data");
      expect(repeated.modules.find((item: { id: string }) => item.id === fresh.id).archived_at).toBeNull();
    } finally {
      await api(page, "/api/data", {
        action: "account_delete",
        currentToken: account.token,
        confirmation: "DELETE",
      });
    }
  });
}
