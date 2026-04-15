/**
 * §G-03：问策「技法/分析卡」— 本机 localStorage；与装配器无自动联动（决策 #2）。
 */
const STORE_KEY = "liubai:wenceTechniqueCards:v1";

export const WENCE_TECHNIQUE_CARDS_MAX = 500;

export type WenceTechniqueCard = {
  id: string;
  title: string;
  summary: string;
  /** 已规范化：去空、小写可保留中文 */
  tags: string[];
  /** 可选来源书名（用户手填，不与作品库强制关联） */
  sourceBook: string;
  updatedAt: number;
};

type StoreV1 = { v: 1; entries: WenceTechniqueCard[] };

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `wtc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function parseTags(raw: string): string[] {
  const parts = raw.split(/[,，;；]/);
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function normalizeTagsInput(raw: string): string[] {
  return parseTags(raw);
}

function safeLoad(): WenceTechniqueCard[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return [];
    if ((j as { v?: unknown }).v !== 1) return [];
    const entries = (j as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return [];
    const out: WenceTechniqueCard[] = [];
    for (const row of entries) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      const title = (row as { title?: unknown }).title;
      const summary = (row as { summary?: unknown }).summary;
      const tags = (row as { tags?: unknown }).tags;
      const sourceBook = (row as { sourceBook?: unknown }).sourceBook;
      const updatedAt = (row as { updatedAt?: unknown }).updatedAt;
      if (typeof id !== "string" || !id) continue;
      if (typeof title !== "string") continue;
      if (typeof summary !== "string") continue;
      if (!Array.isArray(tags)) continue;
      const tagList: string[] = [];
      for (const t of tags) {
        if (typeof t === "string" && t.trim()) tagList.push(t.trim());
      }
      if (typeof sourceBook !== "string") continue;
      if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) continue;
      out.push({
        id,
        title: title.trim() || "未命名",
        summary,
        tags: tagList,
        sourceBook,
        updatedAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function write(entries: WenceTechniqueCard[]) {
  const store: StoreV1 = { v: 1, entries };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function prune(entries: WenceTechniqueCard[]): WenceTechniqueCard[] {
  if (entries.length <= WENCE_TECHNIQUE_CARDS_MAX) return entries;
  const sorted = [...entries].sort((a, b) => a.updatedAt - b.updatedAt);
  return sorted.slice(-WENCE_TECHNIQUE_CARDS_MAX);
}

export function loadWenceTechniqueCards(): WenceTechniqueCard[] {
  return [...safeLoad()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertWenceTechniqueCard(input: {
  id?: string;
  title: string;
  summary: string;
  tagsRaw: string;
  sourceBook: string;
}): WenceTechniqueCard {
  const all = safeLoad();
  const now = Date.now();
  const tags = normalizeTagsInput(input.tagsRaw);
  const id = input.id?.trim() || newId();
  const card: WenceTechniqueCard = {
    id,
    title: input.title.trim() || "未命名",
    summary: input.summary,
    tags,
    sourceBook: input.sourceBook.trim(),
    updatedAt: now,
  };
  const rest = all.filter((e) => e.id !== id);
  const next = prune([...rest, card]);
  write(next);
  return card;
}

export function deleteWenceTechniqueCard(id: string): void {
  const all = safeLoad().filter((e) => e.id !== id);
  write(all);
}

/**
 * 在标题、摘要、标签、来源书名中子串检索（不区分大小写对 ASCII）。
 */
export function filterWenceTechniqueCards(cards: WenceTechniqueCard[], query: string): WenceTechniqueCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((c) => {
    const hay = [
      c.title,
      c.summary,
      c.tags.join(" "),
      c.sourceBook,
    ]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}
