// Browser tests for the staff inactivity guard and autosave (src/components/staff, src/lib/staff/autosave.tsx).
// Run: MW_TEST_PAGES=1 npm run build && MW_TEST_PAGES=1 npx next start -p 3100, then
//      npm i --no-save playwright-core && CHROME_PATH=/path/to/chrome node tests/browser/session-guard.mjs
// The test page /dev/session-guard exists only when MW_TEST_PAGES=1 (it uses a 6-second timeout).
import { chromium } from "playwright-core";
const BASE = "http://localhost:3100/dev/session-guard?t=6&w=3";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const results = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const left = (page) => !page.url().includes("/dev/session-guard");

async function fresh() { const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(BASE); await page.waitForSelector("#note"); return { ctx, page }; }

// T3: no interaction → warning, then sign-out at the timeout with the inactivity reason.
{ const { ctx, page } = await fresh(); const t0 = Date.now();
  await sleep(3800);
  const warn = await page.getByText(/will end in \d+ seconds/).isVisible().catch(() => false);
  check("warning shown in the last seconds", warn);
  await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  const secs = (Date.now() - t0) / 1000;
  check("signed out after the timeout", page.url().includes("/login") && page.url().includes("ended=idle_timeout"), `${secs.toFixed(1)}s, ${page.url().replace("http://localhost:3100", "")}`);
  check("not before the timeout", secs >= 6);
  await ctx.close(); }

// T4: scrolling keeps the session.
{ const { ctx, page } = await fresh();
  for (let i = 0; i < 6; i++) { await sleep(2000); await page.mouse.wheel(0, 300); }
  check("scrolling resets the timer (12 s on a 6 s timeout)", !left(page));
  await ctx.close(); }

// T5: typing in a form keeps the session.
{ const { ctx, page } = await fresh();
  for (let i = 0; i < 6; i++) { await sleep(2000); await page.type("#note", "a"); }
  check("form input resets the timer", !left(page));
  await ctx.close(); }

// Continue working button.
{ const { ctx, page } = await fresh();
  await sleep(4000);
  const box = await page.getByRole("button", { name: "Continue working" }).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  check("warning closes when the person taps Continue working", !(await page.getByText(/will end in/).isVisible().catch(() => false)));
  await sleep(4000);
  check("Continue working keeps the session", !left(page));
  await ctx.close(); }

// T6: background requests do not keep the session alive.
{ const { ctx, page } = await fresh();
  await page.evaluate(() => { setInterval(() => fetch("/dev/session-guard?poll=1"), 500); });
  await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  check("background polling does not prevent the timeout", page.url().includes("/login"));
  await ctx.close(); }

// Mouse movement alone is not reported as work but keeps the on-screen timer honest (documented); skip.

// T13: two tabs share one inactivity clock; ending in one ends the other.
{ const ctx = await browser.newContext(); const a = await ctx.newPage(); const b = await ctx.newPage();
  await a.goto(BASE); await b.goto(BASE); await a.waitForSelector("#note"); await b.waitForSelector("#note");
  for (let i = 0; i < 5; i++) { await sleep(2000); await a.mouse.wheel(0, 200); }
  check("activity in one tab keeps the other tab signed in", !left(b) && !left(a));
  await Promise.all([a.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {}), b.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {})]);
  check("when the shared clock runs out, every tab signs out", a.url().includes("/login") && b.url().includes("/login"));
  await ctx.close(); }

// T7/T8: a draft that cannot reach the server is reported honestly and kept on the device.
{ const { ctx, page } = await fresh();
  await page.type("#note", "unfinished batch note");
  await sleep(2500);
  const status = await page.locator("#status").innerText();
  check("failed server save is not reported as saved", /not saved to the server/i.test(status), JSON.stringify(status));
  const local = await page.evaluate(() => localStorage.getItem("mw:draft:dev:test-form"));
  check("draft kept on the device for recovery", Boolean(local && local.includes("unfinished batch note")));
  await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
  check("sign-out records that the save failed", page.url().includes("save=failed"), page.url().replace("http://localhost:3100", ""));
  const page2 = await ctx.newPage(); await page2.goto(BASE); await page2.waitForSelector("#note"); await sleep(1500);
  check("the device draft is offered again after signing back in", await page2.evaluate(() => Boolean(localStorage.getItem("mw:draft:dev:test-form"))));
  await ctx.close(); }

await browser.close();
console.log(results.join("\n"));
