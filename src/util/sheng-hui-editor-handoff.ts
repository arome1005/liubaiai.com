import { readSessionPayloadV1, writeSessionPayloadV1, clearSessionPayload } from "./session-payload";

const KEY = "liubai:shengHuiEditorHandoff:v1";
/** 避免撑爆 sessionStorage（与 build 侧大章上限同量级、留余量） */
export const SHENG_HUI_EDITOR_HANDOFF_MAX_CHARS = 120_000;

export type ShengHuiHandoffFromEditor = {
  v: 1;
  workId: string;
  chapterId: string;
  /** 带到生辉的「当前草稿」种子：写作台选区、藏经命中段等 */
  outputSeed: string;
  generateMode: "polish" | "rewrite" | "continue";
  createdAt: number;
};

export function writeShengHuiEditorHandoff(input: {
  workId: string;
  chapterId: string;
  outputSeed: string;
  generateMode: "polish" | "rewrite" | "continue";
}): void {
  let text = input.outputSeed;
  if (text.length > SHENG_HUI_EDITOR_HANDOFF_MAX_CHARS) {
    text = text.slice(0, SHENG_HUI_EDITOR_HANDOFF_MAX_CHARS);
  }
  writeSessionPayloadV1(KEY, {
    workId: input.workId,
    chapterId: input.chapterId,
    outputSeed: text,
    generateMode: input.generateMode,
  });
}

export function readShengHuiEditorHandoff(): ShengHuiHandoffFromEditor | null {
  const j = readSessionPayloadV1(KEY);
  if (!j) return null;
  if (typeof j.outputSeed !== "string") return null;
  const m = j.generateMode;
  const mode = m === "polish" || m === "rewrite" || m === "continue" ? m : "polish";
  return {
    v: 1,
    workId: j.workId as string,
    chapterId: j.chapterId as string,
    outputSeed: j.outputSeed,
    generateMode: mode,
    createdAt: j.createdAt as number,
  };
}

export function clearShengHuiEditorHandoff(): void {
  clearSessionPayload(KEY);
}
