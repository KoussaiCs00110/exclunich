import { expect, test, type Page } from "@playwright/test";

async function request(page: Page, body: Record<string, unknown>, path = "/api/data") {
  return page.request.post(path, {
    headers: { Origin: new URL(page.url()).origin },
    data: body,
  });
}

test("academic breaks apply to different students without sharing their classes", async ({ page }) => {
  for (const number of [1, 2]) {
    await page.goto("/login");
    const registration = await request(page, {
      action: "register", full_name: `Calendar Student ${number}`,
      academic_year: "2026–2027", department: "Formation de base", group_name: `A${number}`, semester: "Semester 3",
    }, "/api/auth");
    expect(registration.ok()).toBeTruthy();
    const account = (await registration.json()).data;
    try {
      expect((await request(page, { action: "confirm", saved: true }, "/api/auth")).ok()).toBeTruthy();
      const response = await request(page, { action: "module_save", name: `Personal Module ${number}`, code: "CAL", color: "#628b75", semester: "Semester 3" });
      expect(response.ok()).toBeTruthy();
      const module = (await response.json()).data;
      const series = await request(page, {
        action: "session_save", module_id: module.id, session_type: "TD", weekday: 7,
        start_time: "09:00", end_time: "10:00", classroom: "Calendar Room",
        recurrence_start: "2026-11-22", recurrence_end: "2027-01-28",
      });
      expect(series.ok()).toBeTruthy();
      const snapshot = (await (await page.request.get("/api/data")).json()).data;
      expect(snapshot.modules).toHaveLength(1);
      expect(snapshot.modules[0].name).toBe(`Personal Module ${number}`);
      expect(snapshot.student.group_name).toBe(`A${number}`);
      expect(snapshot.occurrences.filter((item: { cancelled: boolean }) => !item.cancelled)).toHaveLength(6);
      const first = snapshot.occurrences.find((item: { starts_at: string }) => item.starts_at.startsWith("2026-11-22"));
      expect(first).toBeTruthy();
      const moved = await request(page, { action: "occurrence_save", id: first.id, starts_at: "2026-11-29T08:00:00Z", ends_at: "2026-11-29T09:00:00Z" });
      expect(moved.status()).toBe(400);
      expect((await moved.json()).error).toContain("tests, holidays or exams");
      const blocked = await request(page, {
        action: "session_save", module_id: module.id, session_type: "TD", weekday: 1,
        start_time: "09:00", end_time: "10:00", recurrence_start: "2026-11-30", recurrence_end: "2026-11-30",
      });
      expect(blocked.status()).toBe(400);
      await page.goto(`/timetable?session=${first.id}`);
      await expect(page.locator(".session-panel")).toBeVisible();
      await page.keyboard.press("Escape");
      if (page.viewportSize()!.width <= 720) await page.locator(".fc-listWeek-button").click();
      await page.locator(".academic-calendar summary").click();
      await expect(page.locator(".academic-calendar li")).toHaveCount(6);
      await expect(page.locator(".academic-calendar")).toContainText("Test 1");
      await expect(page.locator(".academic-calendar")).toContainText("01/04/2027");
      await expect(page.locator(".fc-event")).toHaveCount(1);
      await page.locator(".fc-next-button").click();
      await expect(page.locator(".fc-event")).toHaveCount(0);
      await expect(page.locator(".timetable-period-notice")).toContainText("Test 1");
      await expect(page.locator(".timetable-period-notice")).toContainText("28/11/2026 – 03/12/2026");
      if (page.viewportSize()!.width > 720) {
        await expect(page.locator('.fc-col-header-cell[data-date="2026-12-03"] .calendar-period-badge')).toHaveText("Test 1");
        await expect(page.locator('.fc-col-header-cell[data-date="2026-12-04"] .calendar-period-badge')).toHaveCount(0);
        await expect(page.locator(".fc-timegrid-col.calendar-period-day")).toHaveCount(5);
      } else {
        await expect(page.locator(".fc-list-empty")).toContainText("Test 1");
      }
      await page.locator(".fc-next-button").click();
      await expect(page.locator(".fc-event")).toHaveCount(1);
      await expect(page.locator(".timetable-period-notice")).toHaveCount(0);
      if (number === 1) {
        for (let week = 0; week < 2; week++) await page.locator(".fc-next-button").click();
        await expect(page.locator(".timetable-period-notice.period-holiday")).toContainText("Winter holidays (WH)");
        for (let week = 0; week < 3; week++) await page.locator(".fc-next-button").click();
        await expect(page.locator(".timetable-period-notice.period-exam")).toContainText("January exams");
        await expect(page.locator(".timetable-period-notice")).toContainText("09/01/2027 – 14/01/2027");
        await page.locator(".fc-next-button").click();
        await expect(page.locator(".timetable-period-notice")).toHaveCount(0);
      }
    } finally {
      expect((await request(page, { action: "account_delete", currentToken: account.token, confirmation: "DELETE" })).ok()).toBeTruthy();
    }
  }
});
