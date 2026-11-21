import { expect, test, type Page } from "@playwright/test";

async function api(page: Page, path: string, body?: Record<string, unknown>) {
  const response = await page.request.fetch(path, { method: body ? "POST" : "GET", headers: { Origin: new URL(page.url()).origin }, data: body });
  const result = await response.json();
  expect(response.ok(), result.error).toBeTruthy();
  return result.data;
}

test("a student joining mid-semester saves, corrects and resets earlier absences", async ({ page }) => {
  await page.goto("/login");
  const account = await api(page, "/api/auth", { action: "register", full_name: "Mid-semester Student", academic_year: "2026–2027", department: "CS", group_name: "Balance", semester: "Semester 3" });
  try {
    await api(page, "/api/auth", { action: "confirm", saved: true });
    await page.goto("/modules?add=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Module name", { exact: true }).fill("Mid-semester Networks");
    await dialog.getByLabel("Module code", { exact: true }).fill("MID");
    await dialog.getByLabel("Earlier justified absences", { exact: true }).fill("1");
    await dialog.getByLabel("Earlier unjustified absences", { exact: true }).fill("2");
    await dialog.getByRole("button", { name: "Create module", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    let data = await api(page, "/api/data");
    const module = data.modules[0];
    expect(module).toMatchObject({ initial_justified_absences: 1, initial_unjustified_absences: 2 });
    expect(data.attendance).toHaveLength(0);
    expect(data.occurrences).toHaveLength(0);
    expect(data.notifications.some((item: { type: string }) => item.type === "warning_unjustified")).toBeTruthy();
    await page.goto(`/modules/${module.id}`);
    await expect(page.locator(".initial-absence-notice")).toContainText("Includes 3 absences");
    await expect(page.locator(".module-details-grid")).toContainText("Next unjustified absence: Excluded");
    await expect(page.locator(".stat-card").filter({ hasText: "Attendance" }).locator(".stat-value")).toHaveText("—");
    await api(page, "/api/data", { action: "session_save", module_id: module.id, session_type: "TD", weekday: 2, start_time: "09:00", end_time: "10:00", recurrence_start: "2024-01-02", recurrence_end: "2024-01-02" });
    data = await api(page, "/api/data");
    await api(page, "/api/data", { action: "attendance_save", occurrence_id: data.occurrences[0].id, attendance_status: "present", note: "Recorded in Exclunich" });
    await page.reload();
    await expect(page.locator(".stat-card").filter({ hasText: "Attendance" }).locator(".stat-value")).toHaveText("100%");
    await page.goto("/statistics");
    const absenceTotal = page.locator(".stats-grid .stat-card").filter({ hasText: "Total absences" }).locator(".stat-value");
    await expect(absenceTotal).toHaveText("3");
    await page.getByLabel("From", { exact: true }).fill("2024-01-01");
    await expect(absenceTotal).toHaveText("0");
    await expect(page.locator(".stats-grid .stat-card").filter({ hasText: "Modules at risk" }).locator(".stat-value")).toHaveText("1");
    await page.goto(`/modules/${module.id}`);
    await page.getByRole("button", { name: "Edit module", exact: true }).click();
    await expect(dialog.getByLabel("Earlier unjustified absences", { exact: true })).toHaveValue("2");
    await dialog.getByLabel("Earlier unjustified absences", { exact: true }).fill("3");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".page-heading")).toContainText("Excluded");
    await page.reload();
    await expect(page.locator(".initial-absence-notice")).toContainText("Includes 4 absences");
    await page.getByRole("button", { name: "Edit module", exact: true }).click();
    await dialog.getByLabel("Earlier justified absences", { exact: true }).fill("0");
    await dialog.getByLabel("Earlier unjustified absences", { exact: true }).fill("0");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".initial-absence-notice")).toHaveCount(0);
    await expect(page.locator(".page-heading")).toContainText("Safe");
    data = await api(page, "/api/data");
    expect(data.attendance).toHaveLength(1);
    expect(data.attendance[0]).toMatchObject({ attendance_status: "present", note: "Recorded in Exclunich" });
    expect(data.audit.some((item: { action: string }) => item.action === "starting_absences_updated")).toBeTruthy();
  } finally {
    await api(page, "/api/data", { action: "account_delete", currentToken: account.token, confirmation: "DELETE" });
  }
});
