/**
 * 参考书阅读器：将常见「编码错位」正文在展示层还原为可读中文。
 * 典型可逆情形：原始字节被 JavaScript 逐字节当成 Latin-1（U+00xx）存进字符串，
 * 可用 UTF-8 或 GB18030 重新解码。
 *
 * 不可逆情形（UTF-8 误读 GBK 产生大量 U+FFFD）无法从字符串单独还原，本模块不会强行替换。
 */

export type MojibakeRepairKind = "none" | "latin1-utf8" | "latin1-gb18030";

export type MojibakeRepairResult = {
  display: string;
  kind: MojibakeRepairKind;
};

function replacementRatio(s: string): number {
  if (s.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 0xfffd) n++;
  }
  return n / s.length;
}

function cjkRatio(s: string): number {
  if (s.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x4e00 && c <= 0x9fff) n++;
  }
  return n / s.length;
}

/** 是否整串均可视为单字节 0–255（误当 Latin-1 保存的常见前提） */
export function isAllByteUnits(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 255) return false;
  }
  return true;
}

export function stringToByteArrayLatin1(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    b[i] = s.charCodeAt(i) & 0xff;
  }
  return b;
}

function qualityScore(s: string): number {
  const len = Math.max(1, s.length);
  const rep = replacementRatio(s);
  const cjk = cjkRatio(s);
  let asciiLetters = 0;
  let printing = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10 || c === 13) continue;
    printing++;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) asciiLetters++;
  }
  const pr = printing / len;
  const latinRatio = printing > 0 ? asciiLetters / printing : 0;
  // 惩罚替换符；奖励常见汉字密度；略奖励通篇拉丁（英文小说）
  return cjk * 6 - rep * 18 + pr * latinRatio * 0.35;
}

function looksLikeMostlyEnglish(s: string): boolean {
  let ascii = 0;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10 || c === 13) continue;
    total++;
    if (c < 128) ascii++;
  }
  return total > 200 && ascii / total > 0.94;
}

function looksHealthyChineseNoisy(s: string): boolean {
  return replacementRatio(s) < 0.0015 && cjkRatio(s) > 0.08;
}

/**
 * 在「展示用字符串」与存储的 raw 不一致时，按 repair 类型做索引映射。
 */
export function rawOffsetsToDisplayOffsets(
  raw: string,
  kind: MojibakeRepairKind,
  start: number,
  end: number,
): { start: number; end: number } {
  if (kind === "none" || start < 0 || end < 0 || start > end || end > raw.length) {
    return { start, end };
  }
  if (!isAllByteUnits(raw)) return { start, end };
  const bytes = stringToByteArrayLatin1(raw);
  const enc = kind === "latin1-utf8" ? "utf-8" : "gb18030";
  const dec = new TextDecoder(enc, { fatal: false });
  const d0 = dec.decode(bytes.subarray(0, start)).length;
  const d1 = dec.decode(bytes.subarray(0, end)).length;
  return { start: d0, end: d1 };
}

/** display 串须与 analyzeMojibakeRepair(raw).display 一致 */
export function displayOffsetsToRawOffsets(
  raw: string,
  kind: MojibakeRepairKind,
  displayLen: number,
  start: number,
  end: number,
): { start: number; end: number } | null {
  if (kind === "none") return { start, end };
  if (!isAllByteUnits(raw)) return null;
  if (start < 0 || end < 0 || start > end || end > displayLen) return null;
  const bytes = stringToByteArrayLatin1(raw);
  const display = new TextDecoder(kind === "latin1-utf8" ? "utf-8" : "gb18030", { fatal: false }).decode(bytes);
  if (display.length !== displayLen) return null;
  const rs =
    kind === "latin1-utf8"
      ? utf16PrefixEndByteOffsetUtf8(bytes, display, start)
      : utf16PrefixEndByteOffsetGb18030(bytes, display, start);
  const re =
    kind === "latin1-utf8"
      ? utf16PrefixEndByteOffsetUtf8(bytes, display, end)
      : utf16PrefixEndByteOffsetGb18030(bytes, display, end);
  if (rs < 0 || re < 0 || rs > re || re > raw.length) return null;
  return { start: rs, end: re };
}

/** 使 decode(bytes[0:b]) 与 display 的前 utf16Index 个 UTF-16 码元完全一致 */
function utf16PrefixEndByteOffsetUtf8(bytes: Uint8Array, display: string, utf16Index: number): number {
  if (utf16Index <= 0) return 0;
  if (utf16Index >= display.length) return bytes.length;
  const dec = new TextDecoder("utf-8", { fatal: false });
  let b = 0;
  for (let i = 1; i <= utf16Index; i++) {
    const target = display.slice(0, i);
    while (b <= bytes.length) {
      if (dec.decode(bytes.subarray(0, b)) === target) break;
      b++;
    }
    if (b > bytes.length) return -1;
  }
  return b;
}

function utf16PrefixEndByteOffsetGb18030(bytes: Uint8Array, display: string, utf16Index: number): number {
  if (utf16Index <= 0) return 0;
  if (utf16Index > display.length) return -1;
  const dec = new TextDecoder("gb18030", { fatal: false });
  let b = 0;
  for (let i = 1; i <= utf16Index; i++) {
    const target = display.slice(0, i);
    while (b <= bytes.length) {
      if (dec.decode(bytes.subarray(0, b)) === target) break;
      b++;
    }
    if (b > bytes.length) return -1;
  }
  return b;
}

export function analyzeMojibakeRepair(raw: string): MojibakeRepairResult {
  if (!raw) return { display: raw, kind: "none" };

  const candidates: MojibakeRepairResult[] = [{ display: raw, kind: "none" }];

  if (isAllByteUnits(raw)) {
    const bytes = stringToByteArrayLatin1(raw);
    try {
      candidates.push({
        display: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
        kind: "latin1-utf8",
      });
    } catch {
      /* ignore */
    }
    try {
      candidates.push({
        display: new TextDecoder("gb18030", { fatal: false }).decode(bytes),
        kind: "latin1-gb18030",
      });
    } catch {
      /* ignore */
    }
  }

  let best = candidates[0]!;
  let bestScore = qualityScore(best.display);

  for (const c of candidates.slice(1)) {
    const sc = qualityScore(c.display);
    const betterRep = replacementRatio(c.display) + 1e-8 < replacementRatio(best.display);
    const clearlyBetter = sc > bestScore + 0.08 || (betterRep && sc >= bestScore - 0.02);
    if (clearlyBetter) {
      best = c;
      bestScore = sc;
    }
  }

  if (best.kind !== "none") {
    if (looksLikeMostlyEnglish(raw) && cjkRatio(best.display) > cjkRatio(raw) + 0.05) {
      return { display: raw, kind: "none" };
    }
    if (looksHealthyChineseNoisy(raw) && best.display !== raw) {
      return { display: raw, kind: "none" };
    }
    if (best.display === raw) {
      return { display: raw, kind: "none" };
    }
  }

  return best;
}
