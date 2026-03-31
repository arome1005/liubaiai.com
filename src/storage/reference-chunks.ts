import { REFERENCE_CHUNK_CHAR_TARGET } from "../db/types";

/** 将大文本切成多段写入 IndexedDB，避免单条记录过大 */
export function splitTextIntoReferenceChunks(
  text: string,
  chunkSize: number = REFERENCE_CHUNK_CHAR_TARGET,
): string[] {
  if (text.length === 0) return [""];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    parts.push(text.slice(i, i + chunkSize));
  }
  return parts;
}
