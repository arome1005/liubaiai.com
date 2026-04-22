/**
 * 提示词「热度」——本地统计装配/使用次数（不上云，与星月类产品的展示类似）。
 * key: liubai:promptHeat
 */
const STORAGE_KEY = "liubai:promptHeat";

type HeatMap = Record<string, number>;

function readMap(): HeatMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    return o as HeatMap;
  } catch {
    return {};
  }
}

function writeMap(m: HeatMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function getPromptHeat(promptId: string): number {
  const n = readMap()[promptId];
  return typeof n === "number" && n >= 0 ? n : 0;
}

/** 装配、复制为作品侧栏注入等「使用」场景调用一次 +1 */
export function bumpPromptHeat(promptId: string): void {
  const m = readMap();
  m[promptId] = (m[promptId] ?? 0) + 1;
  writeMap(m);
}
