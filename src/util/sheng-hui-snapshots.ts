/**
 * §G-04：生辉「同章多轮生成快照」— 本机 localStorage，与写作侧栏合并路径解耦（用户自行复制或到侧栏粘贴）。
 */
const STORE_KEY = "liubai:shengHuiSnapshots:v1";

export const SHENG_HUI_SNAPSHOTS_MAX_PER_BUCKET = 40;

export type ShengHuiSnapshot = {
  id: string;
  createdAt: number;
  prose: string;
  /** 生成时使用的大纲与文策摘要，便于列表辨认 */
  outlinePreview: string;
};

export type ShengHuiSnapshotBucket = {
  snapshots: ShengHuiSnapshot[];
  /** 用户标注的「当前采纳」；仅 UX，不自动写入正文 */
  adoptedId: string | null;
};

type StoreV1 = {
  v: 1;
  buckets: Record<string, ShengHuiSnapshotBucket>;
};

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function safeParse(raw: string | null): StoreV1 | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    if ((j as { v?: unknown }).v !== 1) return null;
    const buckets = (j as { buckets?: unknown }).buckets;
    if (!buckets || typeof buckets !== "object") return null;
    return { v: 1, buckets: buckets as Record<string, ShengHuiSnapshotBucket> };
  } catch {
    return null;
  }
}

function readStore(): StoreV1 {
  try {
    return safeParse(localStorage.getItem(STORE_KEY)) ?? { v: 1, buckets: {} };
  } catch {
    return { v: 1, buckets: {} };
  }
}

function writeStore(store: StoreV1) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function bucketKey(workId: string, chapterId: string | null): string {
  return `${workId}::${chapterId ?? "__none__"}`;
}

function normalizeBucket(raw: ShengHuiSnapshotBucket | undefined): ShengHuiSnapshotBucket {
  if (!raw || !Array.isArray(raw.snapshots)) {
    return { snapshots: [], adoptedId: null };
  }
  const snapshots: ShengHuiSnapshot[] = [];
  for (const s of raw.snapshots) {
    if (!s || typeof s !== "object") continue;
    const id = (s as { id?: unknown }).id;
    const createdAt = (s as { createdAt?: unknown }).createdAt;
    const prose = (s as { prose?: unknown }).prose;
    const outlinePreview = (s as { outlinePreview?: unknown }).outlinePreview;
    if (typeof id !== "string" || !id) continue;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) continue;
    if (typeof prose !== "string") continue;
    if (typeof outlinePreview !== "string") continue;
    snapshots.push({ id, createdAt, prose, outlinePreview });
  }
  let adoptedId = raw.adoptedId;
  if (adoptedId !== null && typeof adoptedId !== "string") adoptedId = null;
  if (adoptedId && !snapshots.some((x) => x.id === adoptedId)) adoptedId = null;
  return { snapshots, adoptedId };
}

export function loadShengHuiSnapshotBucket(workId: string, chapterId: string | null): ShengHuiSnapshotBucket {
  const store = readStore();
  const key = bucketKey(workId, chapterId);
  return normalizeBucket(store.buckets[key]);
}

function prune(snapshots: ShengHuiSnapshot[]): ShengHuiSnapshot[] {
  if (snapshots.length <= SHENG_HUI_SNAPSHOTS_MAX_PER_BUCKET) return snapshots;
  const sorted = [...snapshots].sort((a, b) => a.createdAt - b.createdAt);
  return sorted.slice(-SHENG_HUI_SNAPSHOTS_MAX_PER_BUCKET);
}

function outlinePreviewFrom(outline: string): string {
  const t = outline.trim().replace(/\s+/g, " ");
  if (t.length <= 100) return t;
  return t.slice(0, 100) + "…";
}

export function appendShengHuiSnapshot(
  workId: string,
  chapterId: string | null,
  outlineAndStrategy: string,
  prose: string,
): ShengHuiSnapshot {
  const store = readStore();
  const key = bucketKey(workId, chapterId);
  const prev = normalizeBucket(store.buckets[key]);
  const snap: ShengHuiSnapshot = {
    id: newId(),
    createdAt: Date.now(),
    prose,
    outlinePreview: outlinePreviewFrom(outlineAndStrategy),
  };
  const nextSnapshots = prune([...prev.snapshots, snap]);
  let adoptedId = prev.adoptedId;
  if (adoptedId && !nextSnapshots.some((x) => x.id === adoptedId)) adoptedId = null;

  store.buckets[key] = { snapshots: nextSnapshots, adoptedId };
  writeStore(store);
  return snap;
}

export function setShengHuiAdoptedSnapshot(
  workId: string,
  chapterId: string | null,
  adoptedId: string | null,
): ShengHuiSnapshotBucket {
  const store = readStore();
  const key = bucketKey(workId, chapterId);
  const prev = normalizeBucket(store.buckets[key]);
  let next = adoptedId;
  if (next && !prev.snapshots.some((s) => s.id === next)) next = null;
  store.buckets[key] = { snapshots: prev.snapshots, adoptedId: next };
  writeStore(store);
  return store.buckets[key]!;
}

export function deleteShengHuiSnapshot(workId: string, chapterId: string | null, snapshotId: string): ShengHuiSnapshotBucket {
  const store = readStore();
  const key = bucketKey(workId, chapterId);
  const prev = normalizeBucket(store.buckets[key]);
  const snapshots = prev.snapshots.filter((s) => s.id !== snapshotId);
  let adoptedId = prev.adoptedId;
  if (adoptedId === snapshotId) adoptedId = null;
  store.buckets[key] = { snapshots, adoptedId };
  writeStore(store);
  return store.buckets[key]!;
}
