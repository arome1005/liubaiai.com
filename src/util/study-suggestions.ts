import type { BibleCharacter, BibleGlossaryTerm } from "../db/types";

export function buildStudyNeedleText(parts: Array<string | undefined | null>): string {
  return parts
    .map((x) => (typeof x === "string" ? x : ""))
    .join("\n")
    .slice(0, 240_000);
}

export function pickSuggestedCharacterIds(characters: BibleCharacter[], hay: string, limit = 18): string[] {
  const h = hay;
  if (!h.trim()) return [];
  const scored = characters
    .map((c) => {
      const name = c.name.trim();
      if (!name) return null;
      if (!h.includes(name)) return null;
      return { id: c.id, len: name.length };
    })
    .filter(Boolean) as Array<{ id: string; len: number }>;
  scored.sort((a, b) => b.len - a.len);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (out.length >= limit) break;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s.id);
  }
  return out;
}

export function pickSuggestedGlossaryIds(terms: BibleGlossaryTerm[], hay: string, limit = 24): string[] {
  const h = hay;
  if (!h.trim()) return [];
  const sorted = [...terms].filter((t) => t.term.trim()).sort((a, b) => b.term.length - a.term.length);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of sorted) {
    const term = t.term.trim();
    if (!term) continue;
    if (!h.includes(term)) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t.id);
    if (out.length >= limit) break;
  }
  return out;
}
