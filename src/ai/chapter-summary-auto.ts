import { generateChapterSummaryWithRetry } from "./chapter-summary-generate";
import { loadAiSettings } from "./storage";
import { updateChapter } from "../db/repo";

/**
 * §11 步 20（可选增强）：章节概要自动生成队列（本机）。
 * - 目标：不打断写作，保存正文后后台尝试生成概要。
 * - 原则：复用 `generateChapterSummaryWithRetry` 与 `updateChapter(summary, summaryUpdatedAt)` 同源逻辑。
 * - 策略：按章去重 + 退避；对"门控类错误"（隐私/Key/无正文）不反复重试。
 */

type AutoSummaryStateV1 = {
  lastAttemptAt: number;
  lastSuccessAt: number;
  lastError?: string;
  lastContentLen?: number;
};

const KEY_PREFIX = "liubai:autoChapterSummary:v1:";

function key(workId: string, chapterId: string): string {
  return `${KEY_PREFIX}${workId}:${chapterId}`;
}

function readState(workId: string, chapterId: string): AutoSummaryStateV1 {
  try {
    const raw = localStorage.getItem(key(workId, chapterId));
    if (!raw) return { lastAttemptAt: 0, lastSuccessAt: 0 };
    const obj = JSON.parse(raw) as Partial<AutoSummaryStateV1>;
    return {
      lastAttemptAt: typeof obj.lastAttemptAt === "number" ? obj.lastAttemptAt : 0,
      lastSuccessAt: typeof obj.lastSuccessAt === "number" ? obj.lastSuccessAt : 0,
      lastError: typeof obj.lastError === "string" ? obj.lastError : undefined,
      lastContentLen: typeof obj.lastContentLen === "number" ? obj.lastContentLen : undefined,
    };
  } catch {
    return { lastAttemptAt: 0, lastSuccessAt: 0 };
  }
}

function writeState(workId: string, chapterId: string, next: AutoSummaryStateV1): void {
  try {
    localStorage.setItem(key(workId, chapterId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export type AutoSummaryStatus =
  | { kind: "idle" }
  | { kind: "queued"; chapterId: string }
  | { kind: "running"; chapterId: string }
  | { kind: "skipped"; chapterId: string; reason: string }
  | { kind: "error"; chapterId: string; message: string }
  | { kind: "ok"; chapterId: string; at: number; summary: string };

export type AutoSummaryQueue = {
  enqueue: (job: {
    workId: string;
    workTitle: string;
    chapterId: string;
    chapterTitle: string;
    chapterOrder: number;
    chapterContent: string;
    expectedUpdatedAt: number;
  }) => void;
  cancel: () => void;
  getStatus: () => AutoSummaryStatus;
  subscribe: (fn: (s: AutoSummaryStatus) => void) => () => void;
};

function isGateLikeError(msg: string): boolean {
  return (
    /请先在设置中同意云端 AI|请先在设置中填写当前模型的 API Key|生成概要需上传|本章暂无正文/i.test(msg)
  );
}

export function createAutoSummaryQueue(): AutoSummaryQueue {
  let currentAbort: AbortController | null = null;
  let queued:
    | {
        workId: string;
        workTitle: string;
        chapterId: string;
        chapterTitle: string;
        chapterOrder: number;
        chapterContent: string;
        expectedUpdatedAt: number;
      }
    | null = null;
  let status: AutoSummaryStatus = { kind: "idle" };
  const subs = new Set<(s: AutoSummaryStatus) => void>();

  function emit(s: AutoSummaryStatus) {
    status = s;
    for (const fn of subs) fn(s);
  }

  async function runOnce(job: NonNullable<typeof queued>) {
    const content = job.chapterContent.trim();
    if (!content) {
      emit({ kind: "skipped", chapterId: job.chapterId, reason: "本章暂无正文" });
      return;
    }

    const st = readState(job.workId, job.chapterId);
    const now = Date.now();

    // 基础退避：2 分钟内不重复尝试；内容没明显增长也跳过。
    if (now - st.lastAttemptAt < 2 * 60_000) {
      emit({ kind: "skipped", chapterId: job.chapterId, reason: "最近已尝试" });
      return;
    }
    if (typeof st.lastContentLen === "number" && content.length < st.lastContentLen + 600) {
      emit({ kind: "skipped", chapterId: job.chapterId, reason: "正文变更不大" });
      return;
    }

    writeState(job.workId, job.chapterId, { ...st, lastAttemptAt: now, lastContentLen: content.length });

    currentAbort = new AbortController();
    emit({ kind: "running", chapterId: job.chapterId });
    try {
      const text = await generateChapterSummaryWithRetry({
        workTitle: job.workTitle,
        chapterTitle: job.chapterTitle,
        chapterContent: content,
        settings: loadAiSettings(),
        signal: currentAbort.signal,
      });
      const st = Date.now();
      const newAt = await updateChapter(
        job.chapterId,
        {
          summary: text,
          summaryUpdatedAt: st,
          summaryScopeFromOrder: job.chapterOrder,
          summaryScopeToOrder: job.chapterOrder,
        },
        { expectedUpdatedAt: job.expectedUpdatedAt },
      );
      const at = newAt ?? st;
      const next = readState(job.workId, job.chapterId);
      writeState(job.workId, job.chapterId, { ...next, lastSuccessAt: at, lastError: undefined, lastContentLen: content.length });
      emit({ kind: "ok", chapterId: job.chapterId, at, summary: text });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const next = readState(job.workId, job.chapterId);
      writeState(job.workId, job.chapterId, { ...next, lastError: msg });
      emit({ kind: "error", chapterId: job.chapterId, message: msg });
      if (isGateLikeError(msg)) {
        // 门控类错误不应被"队列"反复打扰；由用户手动触发或改设置后再入队。
        return;
      }
    } finally {
      currentAbort = null;
    }
  }

  async function drain() {
    const job = queued;
    queued = null;
    if (!job) return;
    await runOnce(job);
  }

  function enqueue(job: NonNullable<typeof queued>) {
    queued = job;
    emit({ kind: "queued", chapterId: job.chapterId });
    // 微任务后启动，避免与保存 UI 同步阻塞。
    queueMicrotask(() => void drain());
  }

  function cancel() {
    queued = null;
    try {
      currentAbort?.abort();
    } catch {
      /* ignore */
    }
    emit({ kind: "idle" });
  }

  function subscribe(fn: (s: AutoSummaryStatus) => void) {
    subs.add(fn);
    fn(status);
    return () => subs.delete(fn);
  }

  return { enqueue, cancel, getStatus: () => status, subscribe };
}

