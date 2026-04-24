import { getSupabase } from "../lib/supabase";

export type ReshapeHistoryItem = {
  id: string;
  createdAt: number;
  mode: "chapter" | "book";
  chapterCount: number;
  promptTitle: string;
  output: string;
};

const KEY_NEW = (workId: string) => `liubai:reshapeHistory:${workId}`;
const KEY_OLD = (workId: string) => `liubai:bookSplitHistory:${workId}`;

function readLocal(workId: string): ReshapeHistoryItem[] {
  try {
    let raw = localStorage.getItem(KEY_NEW(workId));
    if (!raw) raw = localStorage.getItem(KEY_OLD(workId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as ReshapeHistoryItem[];
    if (!Array.isArray(arr)) return [];
    const rows = arr.filter((x) => typeof x?.id === "string" && typeof x?.output === "string");
    if (rows.length && !localStorage.getItem(KEY_NEW(workId)) && localStorage.getItem(KEY_OLD(workId))) {
      try {
        localStorage.setItem(KEY_NEW(workId), JSON.stringify(rows.slice(0, 50)));
      } catch {
        /* ignore */
      }
    }
    return rows;
  } catch {
    return [];
  }
}

function writeLocal(workId: string, rows: ReshapeHistoryItem[]) {
  try {
    localStorage.setItem(KEY_NEW(workId), JSON.stringify(rows.slice(0, 50)));
  } catch {
    /* ignore localStorage quota / private mode */
  }
}

/** 按 id 合并；同 id 取较新 createdAt，再按时间倒序截断 50 条 */
function mergeReshapeHistoryItems(a: ReshapeHistoryItem[], b: ReshapeHistoryItem[]): ReshapeHistoryItem[] {
  const map = new Map<string, ReshapeHistoryItem>();
  for (const row of a) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of b) {
    if (!row?.id) continue;
    const prev = map.get(row.id);
    if (!prev || row.createdAt >= prev.createdAt) map.set(row.id, row);
  }
  return [...map.values()].sort((x, y) => y.createdAt - x.createdAt).slice(0, 50);
}

/** 云端表名仍为 work_book_split_history（与既有 Supabase 迁移一致） */
export async function loadReshapeHistory(workId: string): Promise<ReshapeHistoryItem[]> {
  const local = readLocal(workId);
  try {
    const sb = getSupabase();
    const { data: authData } = await sb.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return local;
    const { data, error } = await sb
      .from("work_book_split_history")
      .select("history_json")
      .eq("work_id", workId)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) return local;
    const cloud = Array.isArray((data as { history_json?: unknown } | null)?.history_json)
      ? ((data as { history_json: ReshapeHistoryItem[] }).history_json ?? [])
      : [];
    const merged = mergeReshapeHistoryItems(local, cloud);
    await saveReshapeHistory(workId, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function saveReshapeHistory(workId: string, rows: ReshapeHistoryItem[]): Promise<void> {
  const safeRows = rows.slice(0, 50);
  writeLocal(workId, safeRows);
  try {
    const sb = getSupabase();
    const { data: authData } = await sb.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return;
    await sb.from("work_book_split_history").upsert(
      {
        id: `${uid}:${workId}`,
        user_id: uid,
        work_id: workId,
        history_json: safeRows,
        updated_at: Date.now(),
      } as never,
      { onConflict: "id" },
    );
  } catch {
    /* cloud unavailable / table missing */
  }
}
