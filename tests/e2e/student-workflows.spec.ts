import { test, expect, type Page } from "@playwright/test";
import { zonedWeekDates } from "../../src/lib/timezone";
const profile = {
  full_name: "Attendance Test Student",
  student_identifier: "",
  academic_year: "2026–2027",
  department: "Computer Science",
  group_name: "Test",
  semester: "Semester 1",
};

test("Sunday sessions are visible even with the legacy Sunday preference disabled", async ({
  page,
}) => {
  // Use a full teaching week so this visibility test stays independent of breaks.
  const calendarDate = new Date("2026-11-21T12:00:00Z");
  await page.clock.setFixedTime(calendarDate);
  await page.goto("/login");
  const account = await api(page, "/api/auth", {
    action: "register",
    ...profile,
  });
  try {
    await api(page, "/api/auth", { action: "confirm", saved: true });
    const snapshot = await api(page, "/api/data");
    await api(page, "/api/data", {
      action: "profile_save",
      ...snapshot.student,
      student_identifier: snapshot.student.student_identifier ?? "",
      show_sunday: false,
    });
    const module = await api(page, "/api/data", {
      action: "module_save",
      name: "Sunday Networks",
      code: "SUN-TEST",
      professor: "",
      description: "",
      color: "#628b75",
      semester: profile.semester,
      total_threshold: null,
      unjustified_threshold: null,
    });
    const week = zonedWeekDates(calendarDate, snapshot.student.timezone);
    const sunday = week[0];
    for (const index of [0, 1, 6]) {
      await api(page, "/api/data", {
        action: "session_save",
        module_id: module.id,
        session_type: "TD",
        weekday: index || 7,
        start_time: "09:00",
        end_time: "10:00",
        classroom: index === 0 ? "Sunday Room" : "Weekday Room",
        professor: "",
        recurrence_start: week[index],
        recurrence_end: week[index],
      });
    }

    for (let visit = 0; visit < 2; visit++) {
      await page.goto("/timetable");
      if (page.viewportSize()!.width <= 720) {
        await page.locator(".fc-listWeek-button").click();
        await expect(
          page.locator(`.fc-list-day[data-date="${sunday}"]`),
        ).toBeVisible();
        await expect
          .poll(() =>
            page.locator(".fc-list-day").evaluateAll((days) =>
              days.map((day) => day.getAttribute("data-date")),
            ),
          )
          .toEqual([week[0], week[1], week[6]]);
      } else {
        await expect(page.locator(".fc-col-header-cell")).toHaveCount(7);
        await expect(
          page.locator(`.fc-col-header-cell[data-date="${sunday}"]`),
        ).toBeVisible();
        await expect
          .poll(() =>
            page.locator(".fc-col-header-cell").evaluateAll((days) =>
              days.map((day) => day.getAttribute("data-date")),
            ),
          )
          .toEqual(week);
      }
      await expect(
        page
          .locator(".calendar-event-content strong", {
            hasText: "Sunday Networks",
          })
          .first(),
      ).toBeVisible();
      await page
        .locator(".fc-event", { hasText: "Sunday Networks" })
        .first()
        .click();
      await expect(page.locator(".session-panel")).toContainText("Sunday Room");
      await page.keyboard.press("Escape");
    }
    await page.goto("/settings");
    await page.getByRole("button", { name: "Preferences", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: /Show Sunday/ }),
    ).toHaveCount(0);
  } finally {
    await api(page, "/api/data", {
      action: "account_delete",
      currentToken: account.token,
      confirmation: "DELETE",
    });
  }
});
async function api(page: Page, path: string, body?: Record<string, unknown>) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.fetch(path, {
    method: body ? "POST" : "GET",
    headers: body
      ? { Origin: origin, "Content-Type": "application/json" }
      : undefined,
    data: body,
  });
  const result = await response.json();
  expect(response.ok(), result.error || "API request").toBeTruthy();
  return result.data;
}
test("registration, persisted attendance, risk simulator, corrections, exports, login and recovery", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill(profile.full_name);
  await page.getByLabel("Group", { exact: true }).fill(profile.group_name);
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your keys to Exclunich" }),
  ).toBeVisible();
  const values = await page.locator(".token-value").allTextContents();
  const token = values[0];
  const recoveryCode = values[1];
  expect(token).toMatch(/^ABS-/);
  expect(recoveryCode).toMatch(/^REC-/);
  await expect(
    page.getByRole("button", { name: "Open my workspace" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
  const module = await api(page, "/api/data", {
    action: "module_save",
    name: "Computer Networks",
    code: "NET-TEST",
    professor: "Test Professor",
    description: "",
    color: "#6A94FF",
    semester: profile.semester,
    total_threshold: null,
    unjustified_threshold: null,
  });
  const yesterday = new Date(Date.now() - 86400000);
  const end = yesterday.toISOString().slice(0, 10);
  const start = new Date(yesterday.getTime() - 28 * 86400000)
    .toISOString()
    .slice(0, 10);
  const weekday = new Date(`${end}T12:00:00Z`).getUTCDay() || 7;
  await api(page, "/api/data", {
    action: "session_save",
    module_id: module.id,
    session_type: "TD",
    weekday,
    start_time: "09:00",
    end_time: "10:00",
    classroom: "A01",
    professor: "",
    recurrence_start: start,
    recurrence_end: end,
  });
  let snapshot = await api(page, "/api/data");
  const past = snapshot.occurrences
    .filter((o: { ends_at: string }) => Date.parse(o.ends_at) < Date.now())
    .slice(0, 4);
  expect(past).toHaveLength(4);
  for (let i = 0; i < past.length; i++)
    await api(page, "/api/data", {
      action: "attendance_save",
      occurrence_id: past[i].id,
      attendance_status: i < 2 ? "justified" : "unjustified",
      note: "Test attendance",
    });
  const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await api(page, "/api/data", {
    action: "session_save",
    module_id: module.id,
    session_type: "Lecture",
    weekday: new Date(`${futureDate}T12:00:00Z`).getUTCDay() || 7,
    start_time: "11:00",
    end_time: "12:00",
    classroom: "B02",
    professor: "",
    recurrence_start: futureDate,
    recurrence_end: futureDate,
  });
  await page.reload();
  await expect(
    page.getByText("One more absence of either type would trigger exclusion."),
  ).toBeVisible();
  await page.locator(".upcoming-item").first().click();
  await expect(
    page
      .getByText(
        /Missing this session would trigger exclusion regardless of justification/,
      )
      .first(),
  ).toBeVisible();
  const before = await api(page, "/api/data");
  await page
    .getByRole("button", { name: /justified/i })
    .last()
    .click();
  const after = await api(page, "/api/data");
  expect(after.attendance).toEqual(before.attendance);
  await page.keyboard.press("Escape");
  await api(page, "/api/data", {
    action: "attendance_save",
    occurrence_id: past[0].id,
    attendance_status: "present",
    note: "Corrected",
  });
  await page.goto("/history");
  await expect(
    page
      .locator(".history-desktop:visible, .history-mobile:visible")
      .getByText("Corrected", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.reload();
  snapshot = await api(page, "/api/data");
  expect(
    snapshot.attendance.find(
      (r: { occurrence_id: string }) => r.occurrence_id === past[0].id,
    ).attendance_status,
  ).toBe("present");
  await api(page, "/api/auth", { action: "logout" });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Access token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "Log in to Exclunich" }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
  await api(page, "/api/auth", { action: "logout" });
  await page.goto("/recover");
  await page.getByLabel("Recovery code", { exact: true }).fill(recoveryCode);
  await page.getByRole("button", { name: "Recover my account" }).click();
  await expect(
    page.getByRole("heading", { name: "Your keys to Exclunich" }),
  ).toBeVisible();
  const newToken = await page.locator(".token-value").first().textContent();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  snapshot = await api(page, "/api/data");
  expect(
    snapshot.modules.some((m: { id: string }) => m.id === module.id),
  ).toBeTruthy();
  await api(page, "/api/data", {
    action: "account_delete",
    currentToken: newToken!.trim(),
    confirmation: "DELETE",
  });
});
test("responsive routes keep the student workspace within the viewport", async ({
  page,
}) => {
  await page.goto("/login");
  const secrets = await api(page, "/api/auth", {
    action: "register",
    ...profile,
  });
  await api(page, "/api/auth", { action: "confirm", saved: true });
  for (const path of [
    "/",
    "/modules",
    "/history",
    "/statistics",
    "/notifications",
    "/settings",
    "/timetable",
  ]) {
    await page.goto(path);
    await expect(page.locator("main.content")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow, `${path} should not overflow the viewport`).toBeFalsy();
  }
  await api(page, "/api/data", {
    action: "account_delete",
    currentToken: secrets.token,
    confirmation: "DELETE",
  });
});

test("classmates share, import and revoke a timetable without sharing attendance", async ({
  page,
}) => {
  const accounts: string[] = [];
  await page.goto("/login");
  try {
    const owner = await api(page, "/api/auth", {
      action: "register",
      ...profile,
    });
    accounts.push(owner.token);
    await api(page, "/api/auth", { action: "confirm", saved: true });
    const module = await api(page, "/api/data", {
      action: "module_save",
      name: "Shared Networks",
      code: "SHARE-TEST",
      professor: "Test Professor",
      description: "",
      color: "#6A94FF",
      semester: profile.semester,
      total_threshold: 8,
      unjustified_threshold: 4,
    });
    const date = zonedWeekDates(Date.now() - 7 * 86400000)[1];
    await api(page, "/api/data", {
      action: "session_save",
      module_id: module.id,
      session_type: "TD",
      weekday: new Date(`${date}T12:00:00Z`).getUTCDay() || 7,
      start_time: "09:00",
      end_time: "10:00",
      classroom: "A01",
      professor: "",
      recurrence_start: date,
      recurrence_end: date,
    });
    const source = await api(page, "/api/data");
    await api(page, "/api/data", {
      action: "attendance_save",
      occurrence_id: source.occurrences[0].id,
      attendance_status: "unjustified",
      note: "Private attendance note",
    });
    await page.goto("/timetable");
    await expect(page.locator(".fc-prev-button")).toHaveText("‹");
    await expect(page.locator(".fc-next-button")).toHaveText("›");
    if (page.viewportSize()!.width <= 720) {
      await expect(page.locator(".fc-listWeek-button")).toHaveText("Week");
      await expect(page.locator(".fc-listDay-button")).toHaveText("Day");
      await page.locator(".fc-listWeek-button").click();
    }
    await page.locator(".fc-prev-button").click();
    await expect(
      page.locator(".calendar-event-content strong").first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Share / import" }).click();
    await page.getByLabel("Timetable name").fill("Class timetable");
    await page.getByRole("button", { name: "Create sharing token" }).click();
    const tokenValue = page.locator(".sharing-token .token-value");
    await expect(tokenValue).toBeVisible();
    const sharingToken = (await tokenValue.innerText()).trim();
    expect(sharingToken.startsWith("EXSH-")).toBeTruthy();
    await api(page, "/api/auth", { action: "logout" });
    const recipient = await api(page, "/api/auth", {
      action: "register",
      ...profile,
      full_name: "Recipient Test Student",
    });
    accounts.push(recipient.token);
    await api(page, "/api/auth", { action: "confirm", saved: true });
    await page.goto("/timetable");
    await page.getByRole("button", { name: "Share / import" }).click();
    await page.getByRole("button", { name: "Use a token" }).click();
    await page
      .getByLabel("Timetable sharing token", { exact: true })
      .fill(sharingToken);
    await page.getByRole("button", { name: "Preview timetable" }).click();
    await expect(page.locator(".sharing-preview")).toContainText(
      "Shared Networks",
    );
    await expect(page.locator(".sharing-preview")).not.toContainText(
      "Private attendance note",
    );
    await page.getByRole("button", { name: "Import into my timetable" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const imported = await api(page, "/api/data");
    expect(imported.modules).toHaveLength(1);
    expect(imported.sessions).toHaveLength(1);
    expect(imported.attendance).toHaveLength(0);
    expect(imported.modules[0].id).not.toBe(module.id);
    expect(imported.modules[0].total_threshold).toBeNull();
    expect(imported.modules[0].unjustified_threshold).toBeNull();
    await page.reload();
    await page.getByRole("button", { name: "Share / import" }).click();
    await page.getByRole("button", { name: "Use a token" }).click();
    await page
      .getByLabel("Timetable sharing token", { exact: true })
      .fill(sharingToken);
    await page.getByRole("button", { name: "Preview timetable" }).click();
    await expect(page.locator(".sharing-preview")).toContainText(
      "You already imported this timetable.",
    );
    await expect(
      page.getByRole("button", { name: "Import into my timetable" }),
    ).toHaveCount(0);
    await api(page, "/api/auth", { action: "logout" });
    await api(page, "/api/auth", { action: "login", token: owner.token });
    await page.goto("/timetable");
    await page.getByRole("button", { name: "Share / import" }).click();
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.locator(".sharing-list-item")).toContainText("Revoked");
    await api(page, "/api/auth", { action: "logout" });
    await api(page, "/api/auth", { action: "login", token: recipient.token });
    await page.goto("/timetable");
    await page.getByRole("button", { name: "Share / import" }).click();
    await page.getByRole("button", { name: "Use a token" }).click();
    await page
      .getByLabel("Timetable sharing token", { exact: true })
      .fill(sharingToken);
    await page.getByRole("button", { name: "Preview timetable" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "invalid, expired or revoked",
    );
    const preserved = await api(page, "/api/data");
    expect(preserved.sessions).toEqual(imported.sessions);
    expect(preserved.occurrences).toEqual(imported.occurrences);
  } finally {
    for (const token of accounts.reverse()) {
      await api(page, "/api/auth", { action: "login", token });
      await api(page, "/api/data", {
        action: "account_delete",
        currentToken: token,
        confirmation: "DELETE",
      });
    }
  }
});
