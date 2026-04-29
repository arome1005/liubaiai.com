/**
 * §G-04：生辉「同章多轮生成快照」— 本机 localStorage，与写作侧栏合并路径解耦（用户自行复制或到侧栏粘贴）。
 */
const STORE_KEY = "liubai:shengHuiSnapshots:v1";

export const SHENG_HUI_SNAPSHOTS_MAX_PER_BUCKET = 40;
/** W5：列表短名上限（与审计「8 字短名」一致，按码点截断） */
export const SHENG_HUI_SNAPSHOT_SHORT_LABEL_MAX = 8;

export type ShengHuiSnapshot = {
  id: string;
  createdAt: number;
  prose: string;
  /** 生成时使用的大纲与文策摘要，便于列表辨认 */
  outlinePreview: string;
  /** 用户编辑的短名，至多 {@link SHENG_HUI_SNAPSHOT_SHORT_LABEL_MAX} 字 */
  shortLabel?: string;
  /** 收藏：列表中优先展示，便于挑版本 */
  starred?: boolean;
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

function clampShortLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return [...t].slice(0, SHENG_HUI_SNAPSHOT_SHORT_LABEL_MAX).join("");
}

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
    const shortLabelRaw = (s as { shortLabel?: unknown }).shortLabel;
    const starredRaw = (s as { starred?: unknown }).starred;
    const entry: ShengHuiSnapshot = { id, createdAt, prose, outlinePreview };
    if (typeof shortLabelRaw === "string" && shortLabelRaw.trim()) {
      entry.shortLabel = clampShortLabel(shortLabelRaw);
    }
    if (starredRaw === true) entry.starred = true;
    snapshots.push(entry);
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
    starred: false,
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

/**
 * 更新单条快照的短名/收藏；`shortLabel: null` 或空串表示清除短名。
 */
export function updateShengHuiSnapshotMeta(
  workId: string,
  chapterId: string | null,
  snapshotId: string,
  patch: { shortLabel?: string | null; starred?: boolean },
): ShengHuiSnapshotBucket {
  const store = readStore();
  const key = bucketKey(workId, chapterId);
  const prev = normalizeBucket(store.buckets[key]);
  const snapshots = prev.snapshots.map((s) => {
    if (s.id !== snapshotId) return s;
    const next: ShengHuiSnapshot = { ...s };
    if ("shortLabel" in patch) {
      const v = patch.shortLabel;
      if (v == null || !String(v).trim()) {
        delete next.shortLabel;
      } else {
        const c = clampShortLabel(String(v));
        next.shortLabel = c || undefined;
        if (!next.shortLabel) delete next.shortLabel;
      }
    }
    if ("starred" in patch) {
      if (patch.starred) next.starred = true;
      else {
        delete next.starred;
      }
    }
    return next;
  });
  if (!prev.snapshots.some((x) => x.id === snapshotId)) {
    return prev;
  }
  store.buckets[key] = { snapshots, adoptedId: prev.adoptedId };
  writeStore(store);
  return normalizeBucket(store.buckets[key]);
}

/**
 * A.2/A.3 脏稿同步：「标为采纳」时，若当前主稿内容与被选快照 prose 不同，
 * 先把当前内容存为新快照（`outlinePreview` 用传入值），再将新快照标为 adoptedId。
 * 若相同，直接标原快照 adoptedId。
 * 返回更新后的桶和实际被标为采纳的 snapshotId。
 */
export function appendAndAdoptShengHuiSnapshot(
  workId: string,
  chapterId: string | null,
  currentOutput: string,
  selectedSnapshotId: string,
  outlinePreview: string,
): { bucket: ShengHuiSnapshotBucket; adoptedId: string } {
  const store = readStore();
  const key = bucketKey(workId, chapterId);
  const prev = normalizeBucket(store.buckets[key]);
  const selected = prev.snapshots.find((s) => s.id === selectedSnapshotId);
  const isDirty = !selected || selected.prose !== currentOutput;
  if (isDirty && currentOutput.trim()) {
    const snap: ShengHuiSnapshot = {
      id: newId(),
      createdAt: Date.now(),
      prose: currentOutput,
      outlinePreview: (() => {
        const t = outlinePreview.trim().replace(/\s+/g, " ");
        return t.length <= 100 ? t : t.slice(0, 100) + "…";
      })(),
    };
    const nextSnapshots = prune([...prev.snapshots, snap]);
    store.buckets[key] = { snapshots: nextSnapshots, adoptedId: snap.id };
    writeStore(store);
    return { bucket: normalizeBucket(store.buckets[key]), adoptedId: snap.id };
  }
  const next = selectedSnapshotId;
  store.buckets[key] = { snapshots: prev.snapshots, adoptedId: next };
  writeStore(store);
  return { bucket: normalizeBucket(store.buckets[key]), adoptedId: next };
}

/** 列表：收藏优先，同组内按时间新→旧。 */
export function sortShengHuiSnapshotsForList(snapshots: ShengHuiSnapshot[]): ShengHuiSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const sa = a.starred ? 1 : 0;
    const sb = b.starred ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return b.createdAt - a.createdAt;
  });
}
