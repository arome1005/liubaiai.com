import { createChapter, createWork } from "../db/repo";

declare global {
  interface Window {
    /** 仅 `VITE_E2E=1` 时注册，供 Playwright 在真实浏览器里造最小作品数据 */
    __LIUBAI_PW_SEED?: () => Promise<{ workId: string }>;
  }
}

export function registerPlaywrightE2eHooks(): void {
  window.__LIUBAI_PW_SEED = async () => {
    const w = await createWork(`Playwright ${Date.now()}`, { tags: ["e2e"] });
    await createChapter(w.id, "E2E 第一章");
    return { workId: w.id };
  };
}
