import type { WritingStore } from "./writing-store";
import { WritingStoreIndexedDB } from "./writing-store-indexeddb";

let store: WritingStore | null = null;

/** 当前运行环境使用的存储后端（Web 默认为 IndexedDB）。 */
export function getWritingStore(): WritingStore {
  if (!store) {
    store = new WritingStoreIndexedDB();
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
