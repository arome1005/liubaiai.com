type IgnoreStateV1 = {
  ignored: string[];
};

const KEY_PREFIX = "liubai:logicScanIgnore:v1:";

function key(workId: string): string {
  return KEY_PREFIX + workId;
}

export function fingerprintLogicFinding(input: {
  kind: string;
  title: string;
  description: string;
  chapterIds: string[];
}): string {
  const base = `${input.kind}|${input.title}|${input.description}|${[...input.chapterIds].sort().join(",")}`;
  // djb2-ish, stable and fast
  let h = 5381;
  for (let i = 0; i < base.length; i++) {
    h = ((h << 5) + h) ^ base.charCodeAt(i);
    h |= 0;
  }
  return `f:${(h >>> 0).toString(16)}`;
}

export function readLogicScanIgnored(workId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(workId));
    if (!raw) return new Set();
    const obj = JSON.parse(raw) as Partial<IgnoreStateV1>;
    const arr = Array.isArray(obj.ignored) ? obj.ignored.filter((x): x is string => typeof x === "string") : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function writeLogicScanIgnored(workId: string, ignored: Set<string>): void {
  try {
    const next: IgnoreStateV1 = { ignored: [...ignored] };
    localStorage.setItem(key(workId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

