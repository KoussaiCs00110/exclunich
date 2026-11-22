import { expect, test, type Page } from "@playwright/test";

async function api(page: Page, path: string, body?: Record<string, unknown>) {
  const response = await page.request.fetch(path, {
    method: body ? "POST" : "GET",
    headers: { Origin: new URL(page.url()).origin },
    data: body,
  });
  const result = await response.json();
  expect(response.ok(), result.error).toBeTruthy();
  return result.data;
}

test("session types keep independent counts, projections and exclusion states", async ({ page }) => {
  await page.goto("/login");
  const demo = process.env.E2E_LOCAL_DEMO === "true";
  const account = demo
    ? await api(page, "/api/auth", { action: "login", token: "ABS-LOCAL-DEMO" })
    : await api(page, "/api/auth", { action: "register", full_name: "Session Type Student", academic_year: "2026–2027", department: "Formation de base", group_name: "A3", semester: "Semester 1" });
  let moduleId: string | undefined;
  try {
    if (!demo) await api(page, "/api/auth", { action: "confirm", saved: true });
    await page.goto("/modules?add=1");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Module name", { exact: true }).fill("Independent session counts");
    await dialog.getByLabel("Module code", { exact: true }).fill("TYPES");
    for (const type of ["Lecture", "TD", "TP"])
      await dialog.getByLabel(`${type} · Earlier unjustified absences`, { exact: true }).fill("1");
    await dialog.getByRole("button", { name: "Create module", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    let data = await api(page, "/api/data");
    const module = data.modules.find((item: { code: string }) => item.code === "TYPES");
    moduleId = module.id;
    const card = page.locator(".module-card").filter({ hasText: "Independent session counts" });
    await expect(card.locator(".module-card-top .badge")).toHaveText("Safe");
    await expect(card.locator(".module-stats")).toContainText("3");
    expect(data.notifications.filter((item: { module_id: string; type: string }) => item.module_id === moduleId && item.type === "exclusion")).toHaveLength(0);

    await page.goto(`/modules/${moduleId}`);
    await expect(page.locator(".risk-row")).toHaveCount(3);
    for (const type of ["Lecture", "TD", "TP"])
      await expect(page.locator(".risk-row").filter({ hasText: `TYPES · ${type}` }).locator(".badge")).toHaveText("Safe");
    await page.getByRole("button", { name: "Edit module", exact: true }).click();
    await dialog.getByLabel("TD · Earlier unjustified absences", { exact: true }).fill("3");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".page-heading")).toContainText("Excluded");
    await expect(page.locator(".risk-row").filter({ hasText: "TYPES · Lecture" }).locator(".badge")).toHaveText("Safe");
    await expect(page.locator(".risk-row").filter({ hasText: "TYPES · TD" }).locator(".badge")).toHaveText("Excluded");

    for (const session_type of ["Lecture", "TD"])
      await api(page, "/api/data", { action: "session_save", module_id: moduleId, session_type, weekday: 2, start_time: session_type === "Lecture" ? "09:00" : "11:00", end_time: session_type === "Lecture" ? "10:00" : "12:00", recurrence_start: "2024-01-02", recurrence_end: "2024-01-02" });
    data = await api(page, "/api/data");
    for (const type of ["Lecture", "TD"]) {
      const occurrence = data.occurrences.find((item: { module_id: string; session_type: string }) => item.module_id === moduleId && item.session_type === type);
      await page.goto(`/timetable?session=${occurrence.id}`);
      const panel = page.locator(".session-panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".session-counters > div").first()).toContainText(type === "Lecture" ? "1" : "3");
      await expect(panel.locator(".section-title-row .risk-chip")).toHaveText(type === "Lecture" ? "Within limits" : "Excluded");
    }
  } finally {
    if (demo && moduleId) await api(page, "/api/data", { action: "module_delete", id: moduleId });
    if (!demo) await api(page, "/api/data", { action: "account_delete", currentToken: account.token, confirmation: "DELETE" });
  }
});
