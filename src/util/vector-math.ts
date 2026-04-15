export function cosineDistance(a: number[], b: number[]): number | null {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  if (a.length === 0 || b.length === 0) return null;
  if (a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na <= 0 || nb <= 0) return null;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  const clamped = Math.max(-1, Math.min(1, sim));
  return 1 - clamped;
}

export function stableTextHash(input: string): string {
  const s = input ?? "";
  // djb2-ish
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h |= 0;
  }
  return `t:${(h >>> 0).toString(16)}:${s.length}`;
}

