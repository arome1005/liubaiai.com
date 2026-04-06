/** 总体规划 §11 步 4：首次调用任意 LLM 前须完成一次确认（localStorage 记一次）。 */

const KEY = "liubai:firstAiUseGateCompleted";

export class FirstAiGateCancelledError extends Error {
  constructor() {
    super("已取消首次使用 AI 确认");
    this.name = "FirstAiGateCancelledError";
  }
}

export function readFirstAiUseGateCompleted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFirstAiUseGateCompleted(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

let sharedPromise: Promise<boolean> | null = null;
let pendingResolve: ((ok: boolean) => void) | null = null;
let openDialog: (() => void) | null = null;
let settledThisOpen = false;

export function registerFirstAiGateDialogOpener(fn: () => void) {
  openDialog = fn;
}

/**
 * 若尚未完成首次确认，则唤起宿主对话框；用户确认后写入 `KEY`。
 * 取消则 resolve(false)，调用方应中止请求且不当作致命错误。
 */
export function requestFirstAiUseGate(): Promise<boolean> {
  if (readFirstAiUseGateCompleted()) return Promise.resolve(true);
  if (sharedPromise) return sharedPromise;
  settledThisOpen = false;
  sharedPromise = new Promise<boolean>((resolve) => {
    pendingResolve = resolve;
    openDialog?.();
  }).finally(() => {
    sharedPromise = null;
    pendingResolve = null;
  });
  return sharedPromise;
}

export function settleFirstAiGate(ok: boolean): void {
  if (settledThisOpen) return;
  settledThisOpen = true;
  if (ok) writeFirstAiUseGateCompleted();
  pendingResolve?.(ok);
}

export function isFirstAiGateCancelledError(e: unknown): e is FirstAiGateCancelledError {
  return e instanceof FirstAiGateCancelledError;
}
