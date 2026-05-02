import type { WritingStore } from "./writing-store";
import { WritingStoreHybrid } from "./writing-store-hybrid";
import { WritingStoreIndexedDB } from "./writing-store-indexeddb";

let store: WritingStore | null = null;

function createDefaultStore(): WritingStore {
  /** Playwright 等本地烟测：避免未登录时 Hybrid 走云端 `createWork` 报「请先登录」 */
  if (import.meta.env.VITE_E2E === "1") {
    return new WritingStoreIndexedDB();
  }
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (url && key) {
    return new WritingStoreHybrid();
  }
  return new WritingStoreIndexedDB();
}

/** 当前运行环境使用的存储后端（未配 Supabase 时为 IndexedDB；配置齐全时为 Hybrid：写作上云 + 藏经本地）。 */
export function getWritingStore(): WritingStore {
  if (!store) {
    store = createDefaultStore();
  }
  return store;
}

/**
 * 桌面壳（Tauri 等）启动时注入 SQLite 实现：
 * `setWritingStore(new WritingStoreSqlite(...));` 需在 `init()` 之前调用。
 */
export function setWritingStore(next: WritingStore): void {
  store = next;
}
