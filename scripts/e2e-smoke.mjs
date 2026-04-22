/**
 * 真实 Chromium 烟测：验证编辑器路由无 TDZ、右栏「设定」手风琴可见。
 * 用法：在项目根先确保 5173 可访问，且需 `VITE_E2E=1` 注册 `window.__LIUBAI_PW_SEED`。
 * 推荐：`VITE_E2E=1 npm run dev` 另开终端后执行 `npm run test:e2e`；
 * 或未开 dev 时由本脚本自动拉起（`E2E_AUTO_DEV=1 npm run test:e2e`）。
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

async function waitForOk(url, ms) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (r.ok) return;
      last = String(r.status);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`等待服务就绪超时（${ms}ms）：${url} 最后错误：${last}`);
}

let viteChild = null;
async function maybeStartVite() {
  if (process.env.E2E_AUTO_DEV !== "1") return;
  viteChild = spawn("npm", ["run", "dev"], {
    cwd: root,
    env: { ...process.env, VITE_E2E: "1" },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  await waitForOk(`${baseURL}/`, 120_000);
}

async function main() {
  await maybeStartVite();
  await waitForOk(`${baseURL}/`, 15_000);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fatal = [];
  page.on("pageerror", (e) => fatal.push(e.message));

  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.goto(`${baseURL}/work/pw-missing-${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("text=作品不存在。", { timeout: 30_000 });
  if (fatal.some((m) => m.includes("activeChapter"))) {
    throw new Error(`页面错误（activeChapter）：${fatal.join(" | ")}`);
  }

  await page.goto(`${baseURL}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForFunction(
    () => typeof window.__LIUBAI_PW_SEED === "function",
    { timeout: 30_000 },
  );

  const workId = await page.evaluate(async () => {
    return (await window.__LIUBAI_PW_SEED()).workId;
  });

  await page.goto(`${baseURL}/work/${workId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const lost = await page.locator("text=作品不存在。").isVisible().catch(() => false);
  if (lost) throw new Error("种子作品未加载，仍显示「作品不存在」");
  const errUi = await page.locator("text=出错了").isVisible().catch(() => false);
  if (errUi) throw new Error("出现 ErrorBoundary「出错了」");
  if (fatal.some((m) => m.includes("activeChapter"))) {
    throw new Error(`编辑器页错误（activeChapter）：${fatal.join(" | ")}`);
  }

  await page.getByRole("button", { name: "辅助" }).click({ timeout: 15_000 });
  await page.getByRole("tab", { name: "设定" }).click({ timeout: 15_000 });
  await page.waitForSelector("#ws-acc-style-summary", { timeout: 20_000 });
  await page.waitForSelector("#ws-acc-vars-summary", { timeout: 10_000 });

  if (fatal.length) console.warn("[e2e-smoke] 非致命 pageerror:", fatal);

  await browser.close();
  if (viteChild) {
    viteChild.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    try {
      viteChild.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  console.log("[e2e-smoke] 通过：缺失作品页 + 种子作品编辑器 + 设定栏手风琴");
}

main().catch((e) => {
  console.error("[e2e-smoke] 失败:", e);
  if (viteChild) try { viteChild.kill("SIGKILL"); } catch { /* ignore */ }
  process.exitCode = 1;
});
