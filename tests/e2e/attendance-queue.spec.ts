import { expect, test, type Page } from "@playwright/test";

async function api(page: Page, path: string, body: Record<string, unknown>) {
  const response = await page.request.post(path, {
    headers: { Origin: new URL(page.url()).origin },
    data: body,
  });
  const result = await response.json();
  expect(response.ok(), result.error).toBeTruthy();
  return result.data;
}

test("records attendance from Home and updates the pending queue", async ({ page, isMobile }) => {
  await page.goto("/login");
  const account = await api(page, "/api/auth", {
    action: "register",
    full_name: "Attendance Queue Student",
    academic_year: "2026–2027",
    department: "Formation de base",
    group_name: "A3",
    semester: "Semester 1",
  });
  try {
    await api(page, "/api/auth", { action: "confirm", saved: true });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Set up your semester" })).toBeVisible();
    await page.getByRole("link", { name: "Import a timetable" }).click();
    await expect(page.getByLabel("Timetable sharing token")).toBeVisible();
    await page.goto("/");
    await page.getByRole("link", { name: "Add my first module" }).click();
    const editor = page.getByRole("dialog");
    await expect(editor.getByLabel("Module name", { exact: true })).toBeVisible();
    await expect(editor.getByLabel("Professor", { exact: true })).toBeHidden();
    await editor.getByLabel("Module name", { exact: true }).fill("Computer Networks");
    await editor.getByLabel("Module code", { exact: true }).fill("NET");
    await editor.getByRole("button", { name: "Create module" }).click();
    await expect(editor).toHaveCount(0);
    const data = await (await page.request.get("/api/data")).json();
    await api(page, "/api/data", {
      action: "session_save",
      module_id: data.data.modules[0].id,
      session_type: "TD",
      weekday: 2,
      start_time: "09:00",
      end_time: "10:00",
      classroom: "B04",
      recurrence_start: "2024-01-02",
      recurrence_end: "2024-01-02",
    });
    await page.goto("/");
    const queue = page.getByRole("region", { name: "Record attendance" });
    await queue.getByRole("button", { name: /Computer Networks/ }).click();
    const session = page.getByRole("dialog", { name: "Computer Networks" });
    await expect(session.getByRole("heading", { name: "Record attendance" })).toBeInViewport();
    await expect(session.getByText("Projected total")).toBeHidden();
    await session.getByRole("radio", { name: "Absent · Justified", exact: true }).check();
    const save = session.getByRole("button", { name: "Save attendance" });
    await expect(save).toBeInViewport();
    await save.click();
    await expect(session.getByRole("status")).toHaveText("Attendance saved.");
    await session.getByRole("button", { name: "Close session details" }).click();
    await expect(queue.getByRole("button", { name: /Computer Networks/ })).toHaveCount(0);
    await expect(queue.getByText("You’re all caught up")).toBeVisible();

    if (isMobile) await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Attendance" }).click();
    else await queue.getByRole("link", { name: "Attendance History" }).click();
    await expect(page.locator(".history-desktop:visible, .history-mobile:visible").getByText("Justified absence", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "More filters" }).click();
    await page.getByLabel("Filter by status").selectOption("unjustified");
    await expect(page.getByRole("heading", { name: "No matching sessions" })).toBeVisible();
    await page.getByRole("button", { name: "Reset filters" }).last().click();
    await expect(page.getByRole("heading", { name: "No matching sessions" })).toHaveCount(0);
  } finally {
    await api(page, "/api/data", { action: "account_delete", currentToken: account.token, confirmation: "DELETE" });
  }
});
