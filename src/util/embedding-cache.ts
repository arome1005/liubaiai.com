import { stableTextHash } from "./vector-math";

const KEY_PREFIX = "liubai:embCache:v1:";

function key(provider: string, model: string, text: string): string {
  return `${KEY_PREFIX}${provider}:${model}:${stableTextHash(text)}`;
}

export function readEmbeddingCache(provider: string, model: string, text: string): number[] | null {
  try {
    const raw = sessionStorage.getItem(key(provider, model, text));
    if (!raw) return null;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr) || arr.length < 8) return null;
    const out: number[] = [];
    for (const n of arr) {
      if (typeof n !== "number" || !Number.isFinite(n)) return null;
      out.push(n);
    }
    return out;
  } catch {
    return null;
  }
}

export function writeEmbeddingCache(provider: string, model: string, text: string, embedding: number[]): void {
  try {
    sessionStorage.setItem(key(provider, model, text), JSON.stringify(embedding));
  } catch {
    /* ignore */
  }
}

