/**
 * §G-01：问策多会话 — 本地持久化（localStorage）。
 * 与装配器无自动联动；仍为策略对话语义。
 */
import type { AiChatMessage } from "../ai/types";

const INDEX_KEY = "liubai:wenceChatSessions:v2:index";
const ACTIVE_KEY = "liubai:wenceChatSessions:v2:activeId";
const DATA_PREFIX = "liubai:wenceChatSessions:v2:data:";

export const WENCE_SESSION_MAX = 80;

export type WenceSessionIndexEntry = {
  id: string;
  title: string;
  /** `null` = 不关联（通用咨询） */
  workId: string | null;
  updatedAt: number;
};

export type WenceSessionStored = {
  v: 1;
  id: string;
  title: string;
  workId: string | null;
  includeSettingIndex: boolean;
  messages: AiChatMessage[];
  updatedAt: number;
};

function safeParseIndex(raw: string | null): WenceSessionIndexEntry[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: WenceSessionIndexEntry[] = [];
    for (const row of j) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      const title = (row as { title?: unknown }).title;
      const workId = (row as { workId?: unknown }).workId;
      const updatedAt = (row as { updatedAt?: unknown }).updatedAt;
      if (typeof id !== "string" || !id) continue;
      if (typeof title !== "string") continue;
      if (workId !== null && typeof workId !== "string") continue;
      if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) continue;
      out.push({ id, title, workId, updatedAt });
    }
    return out;
  } catch {
    return [];
  }
}

function readIndex(): WenceSessionIndexEntry[] {
  try {
    return safeParseIndex(localStorage.getItem(INDEX_KEY));
  } catch {
    return [];
  }
}

function writeIndex(entries: WenceSessionIndexEntry[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* quota */
  }
}

function dataKey(id: string) {
  return DATA_PREFIX + id;
}

function pruneOldestIfNeeded(entries: WenceSessionIndexEntry[]): WenceSessionIndexEntry[] {
  if (entries.length <= WENCE_SESSION_MAX) return entries;
  const sorted = [...entries].sort((a, b) => a.updatedAt - b.updatedAt);
  const drop = sorted.slice(0, entries.length - WENCE_SESSION_MAX);
  for (const d of drop) {
    try {
      localStorage.removeItem(dataKey(d.id));
    } catch {
      /* ignore */
    }
  }
  return sorted.slice(-WENCE_SESSION_MAX);
}

export function listWenceSessionIndex(): WenceSessionIndexEntry[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveWenceSessionId(): string | null {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    return id && id.trim() ? id : null;
  } catch {
    return null;
  }
}

export function setActiveWenceSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadWenceSession(id: string): WenceSessionStored | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(dataKey(id));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const v = (j as { v?: unknown }).v;
    if (v !== 1) return null;
    const sid = (j as { id?: unknown }).id;
    const title = (j as { title?: unknown }).title;
    const workId = (j as { workId?: unknown }).workId;
    const includeSettingIndex = (j as { includeSettingIndex?: unknown }).includeSettingIndex;
    const messages = (j as { messages?: unknown }).messages;
    const updatedAt = (j as { updatedAt?: unknown }).updatedAt;
    if (typeof sid !== "string" || sid !== id) return null;
    if (typeof title !== "string") return null;
    if (workId !== null && typeof workId !== "string") return null;
    if (typeof includeSettingIndex !== "boolean") return null;
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
    if (!Array.isArray(messages)) return null;
    const outMsg: AiChatMessage[] = [];
    for (const row of messages) {
      if (!row || typeof row !== "object") return null;
      const role = (row as { role?: string }).role;
      const content = (row as { content?: string }).content;
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string") return null;
      outMsg.push({ role, content });
    }
    return {
      v: 1,
      id: sid,
      title,
      workId,
      includeSettingIndex,
      messages: outMsg,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function upsertIndexEntry(entry: WenceSessionIndexEntry) {
  let entries = readIndex();
  const i = entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) entries[i] = entry;
  else entries.push(entry);
  entries = pruneOldestIfNeeded(entries);
  writeIndex(entries);
}

export function saveWenceSession(stored: WenceSessionStored) {
  const entry: WenceSessionIndexEntry = {
    id: stored.id,
    title: stored.title,
    workId: stored.workId,
    updatedAt: stored.updatedAt,
  };
  upsertIndexEntry(entry);
  try {
    localStorage.setItem(dataKey(stored.id), JSON.stringify(stored));
  } catch {
    /* quota */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `wence-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function createWenceSession(opts?: {
  workId?: string | null;
  title?: string;
}): string {
  const entries = readIndex();
  const n = entries.length + 1;
  const id = newId();
  const now = Date.now();
  const title = (opts?.title ?? `对话 ${n}`).trim() || `对话 ${n}`;
  const workId = opts?.workId !== undefined ? opts.workId : null;
  const stored: WenceSessionStored = {
    v: 1,
    id,
    title,
    workId,
    includeSettingIndex: false,
    messages: [],
    updatedAt: now,
  };
  saveWenceSession(stored);
  setActiveWenceSessionId(id);
  return id;
}

export function deleteWenceSession(id: string) {
  let entries = readIndex().filter((e) => e.id !== id);
  entries = pruneOldestIfNeeded(entries);
  writeIndex(entries);
  try {
    localStorage.removeItem(dataKey(id));
  } catch {
    /* ignore */
  }
  if (getActiveWenceSessionId() === id) {
    const next = entries.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null;
    setActiveWenceSessionId(next);
  }
}

export function renameWenceSession(id: string, title: string) {
  const t = title.trim();
  if (!t) return;
  const full = loadWenceSession(id);
  if (!full) return;
  full.title = t;
  full.updatedAt = Date.now();
  saveWenceSession(full);
}

/**
 * 确保至少存在一个会话；若无则创建并设为 active。
 * @returns 当前应使用的 session id
 */
export function ensureWenceSessionsBootstrap(defaultWorkId: string | null): string {
  const entries = readIndex();
  if (entries.length === 0) {
    return createWenceSession({ workId: defaultWorkId, title: "对话 1" });
  }
  let active = getActiveWenceSessionId();
  if (active && entries.some((e) => e.id === active)) {
    return active;
  }
  const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
  active = sorted[0]!.id;
  setActiveWenceSessionId(active);
  return active;
}

export function filterSessionsByWork(
  entries: WenceSessionIndexEntry[],
  filter: "all" | "none" | string,
): WenceSessionIndexEntry[] {
  if (filter === "all") return entries;
  if (filter === "none") return entries.filter((e) => e.workId === null);
  return entries.filter((e) => e.workId === filter);
}
