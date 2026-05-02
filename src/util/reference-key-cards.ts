export type ReferenceKeyCardKind =
  | "character"
  | "world"
  | "plot"
  | "rule"
  | "object"
  | "place"
  | "theme"
  | "craft"
  | "glossary"
  | "quote";

export type ReferenceKeyCard = {
  title: string;
  kind: ReferenceKeyCardKind;
  body: string;
  tags: string[];
  sourceHint: string;
};

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function extractFirstJsonCodeBlock(markdown: string): string | null {
  const m = markdown.match(/```json\s*([\s\S]*?)\s*```/i);
  return m?.[1] ?? null;
}

function normalizeCard(x: unknown): ReferenceKeyCard | null {
  if (!x || typeof x !== "object") return null;
  const obj = x as Partial<Record<keyof ReferenceKeyCard, unknown>>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const kind = typeof obj.kind === "string" ? (obj.kind.trim() as ReferenceKeyCardKind) : null;
  const body = typeof obj.body === "string" ? obj.body : "";
  const sourceHint = typeof obj.sourceHint === "string" ? obj.sourceHint : "";
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)
    : [];

  if (!title || !kind) return null;
  return { title, kind, body, tags, sourceHint };
}

export function parseReferenceKeyCardsFromExtractBody(body: string): ReferenceKeyCard[] {
  const raw = extractFirstJsonCodeBlock(body);
  if (!raw) return [];
  const arr = safeJsonParse<unknown>(raw);
  if (!Array.isArray(arr)) return [];
  const cards: ReferenceKeyCard[] = [];
  for (const it of arr) {
    const c = normalizeCard(it);
    if (c) cards.push(c);
  }
  return cards;
}


export function formatKeyCardText(card: ReferenceKeyCard) {
  const parts: string[] = [];
  parts.push(`【${card.title}】(${card.kind})`);
  parts.push(card.body);
  if (card.tags?.length) parts.push(`标签：${card.tags.join(", ")}`);
  if (card.sourceHint) parts.push(`线索：${card.sourceHint}`);
  return parts.join("\n\n");
}
