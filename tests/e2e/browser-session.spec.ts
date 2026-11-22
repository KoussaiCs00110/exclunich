import { expect, test, type BrowserContext, type Page } from "@playwright/test";

function auth(page: Page, data: Record<string, unknown>) {
  return page.request.post("/api/auth", {
    headers: { Origin: new URL(page.url()).origin },
    data,
  });
}

async function sessionCookie(context: BrowserContext) {
  const cookie = (await context.cookies()).find(({ name }) =>
    name === "__Host-absentia" || name === "absentia_session",
  );
  if (!cookie) throw new Error("Missing browser session cookie");
  return cookie;
}

test("reopens a remembered browser and replaces its session on credential changes", async ({ page, browser, baseURL }) => {
  await page.goto("/login");
  const registration = await auth(page, {
    action: "register",
    full_name: "Remembered Browser Student",
    academic_year: "2026–2027",
    department: "Formation de base",
    group_name: "A3",
    semester: "Semester 1",
  });
  expect(registration.ok()).toBeTruthy();
  const { token } = (await registration.json()).data;
  let activeToken = token;
  let activePage = page;
  let reopened: BrowserContext | undefined;
  try {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/register\?step=save$/);
    expect((await auth(page, { action: "confirm", saved: true })).ok()).toBeTruthy();
    expect((await auth(page, { action: "logout" })).ok()).toBeTruthy();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Log in to Exclunich" })).toBeVisible();
    expect((await auth(page, { action: "login", token })).ok()).toBeTruthy();
    const firstCookie = await sessionCookie(page.context());
    expect(firstCookie).toMatchObject({ httpOnly: true, sameSite: "Strict" });
    const remainingDays = (firstCookie.expires * 1000 - Date.now()) / 86_400_000;
    expect(remainingDays).toBeGreaterThan(179);
    expect(remainingDays).toBeLessThanOrEqual(180);
    expect((await page.evaluate(() => Object.values(localStorage))).includes(firstCookie.value)).toBe(false);

    reopened = await browser.newContext({ baseURL, storageState: await page.context().storageState() });
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Log in to Exclunich" })).toBeVisible();
    expect((await auth(page, { action: "login", token })).ok()).toBeTruthy();
    expect((await sessionCookie(page.context())).value).not.toBe(firstCookie.value);

    const reopenedPage = await reopened.newPage();
    await reopenedPage.goto("/login");
    await expect(reopenedPage.getByRole("heading", { name: /Good to see you, Remembered/ })).toBeVisible();
    expect((await sessionCookie(reopened)).value).toBe(firstCookie.value);
    activePage = reopenedPage;
    const rotation = await auth(reopenedPage, { action: "rotate_token", currentToken: token });
    expect(rotation.ok()).toBeTruthy();
    activeToken = (await rotation.json()).data.token;
    expect((await sessionCookie(reopened)).value).not.toBe(firstCookie.value);
    await reopenedPage.goto("/login");
    await expect(reopenedPage.getByRole("heading", { name: /Good to see you, Remembered/ })).toBeVisible();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Log in to Exclunich" })).toBeVisible();
    expect((await auth(page, { action: "login", token })).status()).toBe(401);

    expect((await auth(reopenedPage, { action: "logout" })).ok()).toBeTruthy();
    await reopenedPage.goto("/login");
    await expect(reopenedPage.getByRole("button", { name: "Log in to Exclunich" })).toBeVisible();
    expect((await auth(reopenedPage, { action: "login", token: activeToken })).ok()).toBeTruthy();
  } finally {
    await activePage.request.post("/api/data", {
      headers: { Origin: new URL(activePage.url()).origin },
      data: { action: "account_delete", currentToken: activeToken, confirmation: "DELETE" },
    });
    await reopened?.close();
  }
});
