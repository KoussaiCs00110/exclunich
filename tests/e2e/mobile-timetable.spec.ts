import { expect, test, type Locator, type Page } from "@playwright/test";

async function api(page: Page, path: string, body?: Record<string, unknown>) {
  const response = await page.request.fetch(path, { method: body ? "POST" : "GET", headers: { Origin: new URL(page.url()).origin }, data: body });
  const result = await response.json();
  expect(response.ok(), result.error).toBeTruthy();
  return result.data;
}

async function expectReachable(control: Locator) {
  await expect(control).toBeInViewport();
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return rect.top >= 0 && rect.bottom <= innerHeight + 1 && hit !== null && element.contains(hit);
  })).toBe(true);
}

test("long agenda titles and session actions fit phone screens and smaller viewports", async ({ page, isMobile }) => {
  await page.goto("/login");
  const account = await api(page, "/api/auth", { action: "register", full_name: "Phone Timetable Student", academic_year: "2026–2027", department: "Formation de base", group_name: "B3", semester: "Semester 3" });
  const name = "Introduction to Databases and Information Systems with Practical Applications";
  try {
    await api(page, "/api/auth", { action: "confirm", saved: true });
    const module = await api(page, "/api/data", { action: "module_save", name, code: "DATABASE", color: "#628b75", semester: "Semester 3" });
    await api(page, "/api/data", { action: "session_save", module_id: module.id, session_type: "TD", weekday: 2, start_time: "09:00", end_time: "10:00", classroom: "Science building · Database laboratory", recurrence_start: "2024-01-02", recurrence_end: "2024-01-02" });
    const data = await api(page, "/api/data");
    const sizes = isMobile ? [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }] : [page.viewportSize()!];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(`/timetable?session=${data.occurrences[0].id}`);
      const panel = page.locator(".session-panel");
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      if (isMobile) await expect(page.locator(".fc-listDay-view")).toBeVisible();
      for (const view of isMobile ? ["listDay", "listWeek"] : ["listWeek"]) {
        await page.locator(`.fc-${view}-button`).click();
        const title = page.locator(".calendar-event-content strong").first();
        await expect(title).toHaveText(name);
        expect(await title.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const card = element.closest(".timetable-card")!.getBoundingClientRect();
          return Array.from(range.getClientRects()).every((rect) => rect.left >= card.left && rect.right <= card.right && rect.bottom <= element.getBoundingClientRect().bottom + 1);
        })).toBe(true);
      }
      await page.locator(".calendar-event-content strong").first().click();
      const close = panel.getByRole("button", { name: "Close session details", exact: true });
      const cancel = panel.getByRole("button", { name: "Cancel session", exact: true });
      await expectReachable(close);
      await expectReachable(cancel);
      await page.setViewportSize({ width: size.width, height: Math.min(size.height, 400) });
      await expectReachable(cancel);
      await panel.locator("textarea").fill(`Saved at ${size.width} pixels`);
      const save = panel.getByRole("button", { name: /^Save (attendance|correction)$/ });
      await save.scrollIntoViewIfNeeded();
      await expectReachable(save);
      await save.click();
      await expect(panel.getByRole("status")).toContainText("Attendance saved");
      expect((await api(page, "/api/data")).attendance[0].note).toBe(`Saved at ${size.width} pixels`);
      await expectReachable(close);
      await expectReachable(cancel);
      expect(await panel.locator(".session-panel-body").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await close.click();
      await expect(panel).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    }
  } finally {
    await api(page, "/api/data", { action: "account_delete", currentToken: account.token, confirmation: "DELETE" });
  }
});
