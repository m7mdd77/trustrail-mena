const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const outputDirectory = path.resolve("artifacts");
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
  await fs.mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Let the network speak/ }).waitFor();
  await page.getByText(/Nokia simulator configured|Fixture preview mode/).waitFor();
  await page.getByRole("button", { name: /Safe family remittance/ }).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "trustrail-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error("Mobile horizontal overflow");
  await page.screenshot({ path: path.join(outputDirectory, "trustrail-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: /Possible account takeover/ }).click();
  // Delay the real request locally to exercise the stale-result prevention boundary.
  await page.route("**/api/decisions", async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.getByRole("button", { name: /Run protected decision/ }).click();
  if (!(await page.getByRole("button", { name: /Safe family remittance/ }).isDisabled())) throw new Error("Scenario remained editable during evaluation");
  if (!(await page.locator("#context-note").isDisabled())) throw new Error("Note remained editable during evaluation");
  const outcome = page.locator(".outcome-card");
  await outcome.getByRole("heading", { name: "HOLD", exact: true }).waitFor({ timeout: 20_000 });
  await outcome.getByText("Transfer held for review").waitFor();
  await page.getByText(/Live AI planner|Deterministic safety fallback/, { exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "trustrail-fraud-decision.png"), fullPage: true });

  for (const [name, expected] of [[/Safe family remittance/, "APPROVE"], [/Network signal unavailable/, "VERIFY"]]) {
    await page.getByRole("button", { name }).click();
    const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/decisions") && r.request().method() === "POST");
    await page.getByRole("button", { name: /Run protected decision/ }).click();
    const response = await responsePromise;
    const payload = await response.json();
    if ("phoneNumber" in payload.scenario || "expectedLocation" in payload.scenario) throw new Error("Internal scenario fields exposed");
    await outcome.getByRole("heading", { name: expected, exact: true }).waitFor({ timeout: 20_000 });
  }
  await page.locator("#context-note").fill("x");
  await page.getByRole("button", { name: /Run protected decision/ }).click();
  await page.getByRole("alert").filter({ hasText: "10–300" }).waitFor();

  if (browserErrors.length > 0) throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
  console.log("UI regression passed: desktop/mobile, input lock, public DTO, note validation and APPROVE/HOLD/VERIFY. Planner mode is displayed honestly.");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
