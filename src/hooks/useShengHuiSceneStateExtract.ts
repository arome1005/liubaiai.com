import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { generateWithProviderStream } from "../ai/client";
import type { SceneStateCard } from "../ai/sheng-hui-generate";
import { getProviderConfig } from "../ai/storage";
import type { AiSettings } from "../ai/types";
import type { Chapter } from "../db/types";
import { isAbortError } from "../util/is-abort-error";
import type { ShengHuiSnapshot } from "../util/sheng-hui-snapshots";

/**
 * C.6：容错解析场景状态 AI 输出。
 * 兼容全角冒号（：）/ 半角（:）/ 前后空格 / Markdown 粗体或标题前缀。
 */
function parseSceneStateResult(raw: string): SceneStateCard {
  // 去掉 Markdown 标题/粗体标记后逐行扫描
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^#{1,3}\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);

  const FIELDS: Array<[keyof SceneStateCard, string[]]> = [
    ["location",  ["场所", "地点", "地址"]],
    ["timeOfDay", ["时间", "时段"]],
    ["charState", ["人物状态", "角色状态", "人物", "角色"]],
    ["tension",   ["悬念/张力", "悬念", "张力", "冲突"]],
  ];

  const get = (aliases: string[]) => {
    for (const line of lines) {
      for (const alias of aliases) {
        // 匹配「前缀：」或「前缀:」（含全角/半角 + 可有空格）
        const re = new RegExp(`^${alias}\\s*[：:]\\s*(.*)$`, "i");
        const m = line.match(re);
        if (m) return (m[1] ?? "").trim();
      }
    }
    return "";
  };

  return {
    location:  get(FIELDS[0][1]),
    timeOfDay: get(FIELDS[1][1]),
    charState: get(FIELDS[2][1]),
    tension:   get(FIELDS[3][1]),
  };
}

/**
 * 从最新快照或章节正文末尾 AI 提取「场景状态卡」；可 {@link stopSceneStateExtract} 中断（B.1）。
 */
export function useShengHuiSceneStateExtract(args: {
  settings: AiSettings;
  workId: string | null;
  latestSnapshot: ShengHuiSnapshot | null;
  selectedChapter: Chapter | undefined;
  setSceneState: Dispatch<SetStateAction<SceneStateCard>>;
  setSceneStateOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { settings, workId, latestSnapshot, selectedChapter, setSceneState, setSceneStateOpen } = args;
  const [sceneStateExtracting, setSceneStateExtracting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const stopSceneStateExtract = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const extractSceneStateFromLatestSnapshot = useCallback(async () => {
    const proseFull = (latestSnapshot?.prose ?? selectedChapter?.content ?? "");
    if (!proseFull.trim() || inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSceneStateExtracting(true);
    try {
      const cfg = getProviderConfig(settings, settings.provider);
      const prompt = `请从以下中文小说段落的**末尾部分**，提取四项场景状态信息，用于下一段续写时的衔接。
每项用一句话，不超过30字。若信息不明确则留空。
格式（严格按此，不要加其他内容）：
场所：xxx
时间：xxx
人物状态：xxx
悬念/张力：xxx

【段落】
${proseFull.slice(-2000)}`;
      let result = "";
      await generateWithProviderStream({
        provider: settings.provider,
        config: cfg,
        messages: [{ role: "user", content: prompt }],
        onDelta: (d) => {
          result += d;
        },
        signal: ac.signal,
        usageLog: { task: "生辉·场景状态", workId },
      });
      setSceneState(parseSceneStateResult(result));
      setSceneStateOpen(true);
    } catch (e) {
      if (!isAbortError(e)) toast.error("AI 提取场景状态失败，请手动填写。");
    } finally {
      inFlightRef.current = false;
      if (abortRef.current === ac) {
        abortRef.current = null;
      }
      setSceneStateExtracting(false);
    }
  }, [latestSnapshot, selectedChapter, setSceneState, setSceneStateOpen, settings, workId]);

  return { sceneStateExtracting, extractSceneStateFromLatestSnapshot, stopSceneStateExtract };
}
