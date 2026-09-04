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
  await page.getByText("Nokia simulator connected").waitFor();
  await page.getByRole("button", { name: /Safe family remittance/ }).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "trustrail-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDirectory, "trustrail-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: /Possible account takeover/ }).click();
  await page.getByRole("button", { name: /Run protected decision/ }).click();
  const outcome = page.locator(".outcome-card");
  await outcome.getByRole("heading", { name: "HOLD", exact: true }).waitFor({ timeout: 20_000 });
  await outcome.getByText("Transfer held for review").waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "trustrail-fraud-decision.png"), fullPage: true });

  if (browserErrors.length > 0) throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
  console.log("UI smoke passed: desktop/mobile rendered and the live fraud journey produced HOLD.");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
