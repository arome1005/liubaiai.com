import { useEffect, useMemo, useRef, useState } from "react";
import { exportBibleMarkdown, searchReferenceLibrary } from "../db/repo";
import type { BibleGlossaryTerm, ReferenceExcerpt, ReferenceSearchHit, Work, Chapter } from "../db/types";
import { generateWithProviderStream } from "../ai/providers";
import { getProviderConfig, loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiChatMessage, AiProviderId, AiSettings } from "../ai/types";
import { referenceReaderHref } from "../util/readUtf8TextFile";

function clampText(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 24)) + "\n\n…（已截断）";
}

function approxTokens(s: string): number {
  // Very rough: CJK chars are token-dense; ASCII is looser.
  // We only need a stable estimate for UI feedback.
  const chars = Array.from(s);
  let cjk = 0;
  for (const ch of chars) {
    const code = ch.codePointAt(0) ?? 0;
    const isCjk =
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // Extension A
      (code >= 0x20000 && code <= 0x2a6df) || // Extension B
      (code >= 0x2a700 && code <= 0x2b73f) || // Extension C
      (code >= 0x2b740 && code <= 0x2b81f) || // Extension D
      (code >= 0x2b820 && code <= 0x2ceaf) || // Extension E-F
      (code >= 0x3000 && code <= 0x303f); // punctuation
    if (isCjk) cjk++;
  }
  const total = chars.length;
  const ascii = Math.max(0, total - cjk);
  return Math.max(1, Math.ceil(cjk / 1.5 + ascii / 4));
}

export function AiPanel(props: {
  onClose: () => void;
  workId: string;
  work: Work;
  chapter: Chapter | null;
  chapters: Chapter[];
  chapterContent: string;
  chapterBible: { goalText: string; forbidText: string; povText: string; sceneStance: string };
  glossaryTerms: BibleGlossaryTerm[];
  workStyle: { pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string };
  onUpdateWorkStyle: (patch: Partial<{ pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string }>) => void;
  linkedExcerptsForChapter: Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>;
  getSelectedText: () => string;
  insertAtCursor: (text: string) => void;
  appendToEnd: (text: string) => void;
  replaceSelection: (text: string) => void;
}) {
  const GEMINI_MIND = {
    初见: "gemini-3.1-flash-lite-preview",
    入微: "gemini-3-flash-preview",
    化境: "gemini-3.1-pro-preview",
  } as const;

  const GEMINI_GEAR_KEYS = ["初见", "入微", "化境"] as const;

  function geminiGearIndex(model: string): number {
    if (model === GEMINI_MIND["初见"]) return 0;
    if (model === GEMINI_MIND["入微"]) return 1;
    return 2;
  }

  function tempBand(t: number): "沉稳" | "意兴渐起" | "灵感喷发" {
    if (t <= 0.7) return "沉稳";
    if (t <= 1.2) return "意兴渐起";
    return "灵感喷发";
  }

  function tempSides(t: number): { left: string; right: string; center: string } {
    const band = tempBand(t);
    const center = `${band}（${t.toFixed(1)}）`;
    if (band === "沉稳") return { left: "沉稳", right: "意兴渐起", center };
    if (band === "意兴渐起") return { left: "沉稳", right: "灵感喷发", center };
    return { left: "意兴渐起", right: "灵感喷发", center };
  }

  function ProviderLogo(props: { provider: AiProviderId }) {
    const p = props.provider;
    const imgSrc =
      p === "openai"
        ? "/logos/openai.png"
        : p === "anthropic"
          ? "/logos/claude.png"
          : p === "gemini"
            ? "/logos/gemini.png"
            : p === "ollama"
              ? "/logos/ollama.png"
              : p === "doubao"
                ? "/logos/doubao.png"
                : p === "zhipu"
                  ? "/logos/zhipu.png"
                  : p === "kimi"
                    ? "/logos/kimi.png"
                    : p === "xiaomi"
                      ? "/logos/xiaomi.png"
                      : null;
    const text =
      p === "openai"
        ? ""
        : p === "anthropic"
          ? "雨"
          : p === "gemini"
            ? "云"
            : p === "doubao"
              ? "豆"
              : p === "zhipu"
                ? "谱"
                : p === "kimi"
                  ? "月"
                  : p === "xiaomi"
                    ? "米"
                    : "龙";
    return (
      <span
        aria-hidden
        className="provider-logo"
        data-provider={p}
        title={p}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            width={22}
            height={22}
            style={{ display: "block", width: 22, height: 22, objectFit: "contain" }}
            onError={(e) => {
              // Fallback to text badge if image not present.
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        {p === "doubao" ? (
          // Minimal linear flame icon (uses currentColor)
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            aria-hidden
            focusable="false"
            style={{ display: "block" }}
          >
            <path
              d="M13 3c.3 2.1-.9 3.6-2.2 5C9.7 9.2 9 10.2 9 12a3 3 0 0 0 6 0c0-1.2-.3-2.1-1-3.2.1 2.1-1.1 3.2-2.5 4.4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 21a7 7 0 0 1-7-7c0-2.6 1.4-4.7 3.2-6.6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 21a7 7 0 0 0 7-7c0-2.3-1.1-4.3-2.6-6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : imgSrc ? (
          // If image failed to load, it will be hidden by onError, and we show text.
          <span aria-hidden>{text}</span>
        ) : (
          text
        )}
      </span>
    );
  }

  function Meter(props: { value: number; max?: number }) {
    const max = props.max ?? 5;
    const v = Math.max(0, Math.min(max, Math.floor(props.value)));
    return (
      <span style={{ display: "inline-flex", gap: 6, verticalAlign: "middle" }} aria-label={`${v}/${max}`}>
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: i < v ? "rgba(250, 204, 21, 0.95)" : "rgba(148, 163, 184, 0.55)",
            }}
          />
        ))}
      </span>
    );
  }

  /** 云端「神思」温度 → 字数消耗星级（与各云端弹窗底部滑条联动） */
  function geminiCostStarsFromShensi(t: number) {
    const x = Math.max(0.1, Math.min(2.0, t));
    if (x < 0.8) return 3;
    if (x < 1.3) return 4;
    return 5;
  }

  const PROVIDER_UI: Record<
    AiProviderId,
    {
      label: string;
      subtitle: string;
      tip: string;
      quote: string;
      core: string;
      meters: { prose: number; follow: number; cost: number; costText?: string };
      note: string;
    }
  > = {
    openai: {
      label: "见山",
      subtitle: "逻辑之宗 · 纲举目张",
      tip: "见山（OpenAI）",
      quote: "“初看是山，看久了还是那座稳健的大山。”",
      core:
        "逻辑之宗，纲举目张。指令遵循极强，如利刃破竹，最擅长梳理宏大的世界观设定与严密的剧情逻辑。",
      meters: { prose: 5, follow: 5, cost: 2 },
      note: "适合“一览众山小”的逻辑架构，若追求极致的辞藻修饰，建议配合“听雨”使用。",
    },
    anthropic: {
      label: "听雨",
      subtitle: "辞藻丰盈 · 情感细腻",
      tip: "听雨（Claude）",
      quote: "“如檐下听雨，文字绵密入骨，最懂人心。”",
      core:
        "辞藻丰盈，情感细腻。像一位共情力极强的老友，成文质感极佳，自带一种天然的去“AI味”滤镜，是描写人物内心与凄美画面的首选。",
      meters: { prose: 5, follow: 4, cost: 3 },
      note: "如遇敏感剧情可能像雨天一样“多愁善感”而断更，建议微调措辞或跳过该段落。",
    },
    gemini: {
      label: "观云",
      subtitle: "创意如云 · 变幻万千",
      tip: "观云（Gemini）",
      quote: "“坐看云起，奇思妙想如漫天流云，不可捉摸。”",
      core:
        "创意如云，变幻万千。拥有惊人的上下文联想能力，最擅长在陷入瓶颈时为你提供打破常规的“神来之笔”，让剧情走向峰回路转。",
      meters: { prose: 4, follow: 3, cost: 2 },
      note: "云海辽阔，长文推理可能需要稍作等待，建议在开启“高思考预算”时保持耐心。",
    },
    ollama: {
      label: "潜龙",
      subtitle: "根植本地 · 私密纯粹",
      tip: "潜龙（Ollama）",
      quote: "“藏龙于渊，不假外求，深藏不露的底气。”",
      core:
        "根植本地，稳如泰山。不依赖云端，私密且纯粹。虽然平时深潜不出，但在处理基础创作任务时，有着龙跃于渊般的稳健爆发力。",
      meters: { prose: 3, follow: 3, cost: 1, costText: "极低消耗" },
      note: "本地运行受限于设备性能，适合快速草拟或在离线环境下作为创作基座。",
    },
    doubao: {
      label: "燎原",
      subtitle: "墨落星火 · 势成燎原",
      tip: "燎原（豆包）",
      quote: "“墨落星火，势成燎原。”",
      core:
        "它是扎根于东方文脉的智慧火种，不只是精准解析你的一字一句，更深谙汉语背后的山河底蕴与人文温度。于方寸屏幕间，赋你一支生花妙笔；借燎原之势，让你的文思，跨越山海，写尽天下。",
      meters: { prose: 3, follow: 5, cost: 2, costText: "极低" },
      note: "若遇到调用失败，多半是 Base URL 或 Model 命名不一致；请以你控制台/通用接口参数为准。",
    },
    zhipu: {
      label: "智谱",
      subtitle: "墨竹清劲 · 文理兼备",
      tip: "智谱 GLM",
      quote: "“竹影扫阶尘不动，月穿潭底水无痕。”",
      core:
        "GLM-5 / GLM-4.7 系列在中文理解与指令遵循上扎实，适合长文写作中的结构梳理、设定补全与多轮改写；模型 ID 请以开放平台文档（如 glm-5、glm-4.7、glm-4.7-flash）为准。",
      meters: { prose: 4, follow: 4, cost: 2 },
      note: "使用 OpenAI 兼容接口（/chat/completions）；若报错请核对 Base URL、Key 与模型 ID。",
    },
    kimi: {
      label: "Kimi",
      subtitle: "长卷如月 · 徐徐展开",
      tip: "Kimi（Moonshot）",
      quote: "“月色入户，清辉满纸。”",
      core:
        "Kimi 擅长在长上下文里保持线索不断裂，适合需要“带着前文记忆”续写与扩写的场景；流式输出与本 App 的生成体验契合。",
      meters: { prose: 4, follow: 4, cost: 3 },
      note: "默认 Base URL 为 Moonshot 文档中的 v1 根路径；模型名以控制台为准。",
    },
    xiaomi: {
      label: "小米",
      subtitle: "锋刃内敛 · 务实为文",
      tip: "小米 MiMo",
      quote: "“工欲善其事，必先利其器。”",
      core:
        "小米 MiMo 提供 OpenAI 兼容接口；写作常用 mimo-v2-pro（偏强）与 mimo-v2-flash（偏快），在高级后端配置中可一键选择。",
      meters: { prose: 3, follow: 4, cost: 2 },
      note: "Base URL 默认为 api.xiaomimimo.com/v1；请在控制台创建 API Key 后填入。若遇 CORS，需改用后端代理。",
    },
  };

  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [mode, setMode] = useState<"continue" | "rewrite" | "outline" | "summarize">("continue");
  const [userHint, setUserHint] = useState("");
  const [storyBackground, setStoryBackground] = useState("");
  const [characters, setCharacters] = useState("");
  const [relations, setRelations] = useState("");
  const [skillPreset, setSkillPreset] = useState<"none" | "tight" | "dialogue" | "describe" | "custom">("none");
  const [skillText, setSkillText] = useState("");
  const [includeLinkedExcerpts, setIncludeLinkedExcerpts] = useState(true);
  const [includeRecentSummaries, setIncludeRecentSummaries] = useState(true);
  const [recentN, setRecentN] = useState(3);
  const [currentContextMode, setCurrentContextMode] = useState<"full" | "summary" | "selection" | "none">("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [biblePreview, setBiblePreview] = useState<{ text: string; chars: number } | null>(null);
  const [bibleLoading, setBibleLoading] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragQuery, setRagQuery] = useState("");
  const [ragK, setRagK] = useState(6);
  const [ragHits, setRagHits] = useState<ReferenceSearchHit[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastReqRef = useRef<{
    provider: AiProviderId;
    providerCfg: AiSettings["openai"];
    messages: AiChatMessage[];
  } | null>(null);

  const providerCfg = useMemo(() => getProviderConfig(settings, settings.provider), [settings]);

  const isCloudProvider = settings.provider !== "ollama";
  const cloudAllowed = !isCloudProvider
    ? true
    : settings.privacy.consentAccepted && settings.privacy.allowCloudProviders;
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [pickerActive, setPickerActive] = useState<AiProviderId>("ollama");
  /** 选模型弹窗底部：观云有「模型档位」+「神思」；其它云端仅有「神思」；Ollama 无温度条 */
  const [modelPickerTune, setModelPickerTune] = useState<null | "gear" | "shensi">(null);

  useEffect(() => {
    if (!providerPickerOpen) setModelPickerTune(null);
  }, [providerPickerOpen]);

  useEffect(() => {
    if (pickerActive === "ollama") setModelPickerTune(null);
    else if (pickerActive !== "gemini" && modelPickerTune === "gear") setModelPickerTune(null);
  }, [pickerActive, modelPickerTune]);

  const selectedText = useMemo(() => props.getSelectedText(), [props]);

  const glossaryHitsInDraft = useMemo(() => {
    const text = draft;
    if (!text.trim() || props.glossaryTerms.length === 0) return [];
    const sorted = [...props.glossaryTerms].sort((a, b) => b.term.length - a.term.length);
    const seen = new Set<string>();
    const out: BibleGlossaryTerm[] = [];
    for (const t of sorted) {
      const term = (t.term ?? "").trim();
      if (!term) continue;
      if (text.includes(term) && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out.slice(0, 24);
  }, [draft, props.glossaryTerms]);

  const recentSummaryText = useMemo(() => {
    if (!props.chapter) return "";
    if (!includeRecentSummaries) return "";
    const n = Math.max(0, Math.min(12, recentN));
    if (n <= 0) return "";
    const curOrder = props.chapter.order;
    const prev = [...props.chapters]
      .filter((c) => c.order < curOrder)
      .sort((a, b) => b.order - a.order)
      .slice(0, n)
      .reverse();
    if (prev.length === 0) return "";
    const lines: string[] = [];
    for (const c of prev) {
      const s = (c.summary ?? "").trim();
      if (!s) continue;
      lines.push(`## ${c.title}`, s, "");
    }
    return lines.join("\n");
  }, [props.chapter, props.chapters, includeRecentSummaries, recentN]);

  const skillPresetText = useMemo(() => {
    if (skillPreset === "tight") return "写作技巧：更紧凑、减少解释性文字，多用具体动作与感官细节；避免空泛形容。";
    if (skillPreset === "dialogue") return "写作技巧：增加对话推动；对话要带信息差与情绪张力；避免无意义寒暄。";
    if (skillPreset === "describe") return "写作技巧：加强场景画面与氛围（光影/声音/气味/触感），并与人物动机联动。";
    if (skillPreset === "custom") return skillText.trim();
    return "";
  }, [skillPreset, skillText]);

  type InjectBlock = {
    id: string;
    title: string;
    chars: number;
    content: string;
    note?: string;
  };

  const injectBlocks = useMemo<InjectBlock[]>(() => {
    const blocks: InjectBlock[] = [];
    if (!props.chapter) return blocks;

    const ctxParts: string[] = [];
    ctxParts.push(`作品：${props.work.title}`);
    ctxParts.push(`章节：${props.chapter.title}`);
    if (storyBackground.trim()) ctxParts.push(`故事背景：\n${storyBackground.trim()}`);
    if (characters.trim()) ctxParts.push(`角色清单：\n${characters.trim()}`);
    if (relations.trim()) ctxParts.push(`角色关系：\n${relations.trim()}`);
    if (props.chapterBible.goalText.trim()) ctxParts.push(`本章目标：\n${props.chapterBible.goalText.trim()}`);
    if (props.chapterBible.forbidText.trim()) ctxParts.push(`禁止：\n${props.chapterBible.forbidText.trim()}`);
    if (props.chapterBible.povText.trim()) ctxParts.push(`视角/口吻：\n${props.chapterBible.povText.trim()}`);
    if (props.chapterBible.sceneStance.trim()) ctxParts.push(`场景状态：\n${props.chapterBible.sceneStance.trim()}`);
    if (skillPresetText) ctxParts.push(skillPresetText);

    if (includeLinkedExcerpts && props.linkedExcerptsForChapter.length > 0) {
      const ex = props.linkedExcerptsForChapter
        .slice(0, 8)
        .map((e, i) => `【摘录${i + 1}｜${e.refTitle}】\n${e.text}`)
        .join("\n\n");
      ctxParts.push(`参考摘录（与本章关联）：\n${ex}`);
    }

    const ctx = "上下文：\n" + clampText(ctxParts.join("\n\n"), Math.floor(settings.maxContextChars * 0.25));
    blocks.push({ id: "ctx", title: "上下文（作品/章节/变量/本章约束/摘录）", chars: ctx.length, content: ctx });

    if (includeRecentSummaries && recentSummaryText.trim()) {
      const s =
        "最近章节概要（仅供回忆事实）：\n" +
        clampText(recentSummaryText, Math.floor(settings.maxContextChars * 0.2));
      blocks.push({ id: "recent", title: `最近章节概要（N=${Math.max(0, Math.min(12, recentN))}）`, chars: s.length, content: s });
    }

    if (settings.includeBible) {
      const raw = biblePreview?.text?.trim() ? biblePreview.text.trim() : "";
      const shown = raw
        ? "创作圣经（如与正文冲突，以圣经为准）：\n" +
          clampText(raw, Math.floor(settings.maxContextChars * 0.45))
        : "创作圣经（如与正文冲突，以圣经为准）：\n（预览未加载；运行时会抓取并按上限截断）";
      blocks.push({
        id: "bible",
        title: "创作圣经（导出 Markdown）",
        chars: shown.length,
        content: shown,
        note: raw ? `预览已加载：${raw.length.toLocaleString()} 字` : undefined,
      });
    }

    if (ragEnabled) {
      const key = ragQuery.trim();
      const picked = ragHits.slice(0, Math.max(0, Math.min(20, ragK)));
      const s = key
        ? picked.length > 0
          ? [
              `参考库检索（top-k=${picked.length}，query=${key}）：`,
              ...picked.map((h, i) => {
                const snippet = `${h.snippetBefore}${h.snippetMatch}${h.snippetAfter}`.trim();
                return `【命中${i + 1}｜${h.refTitle}｜段${h.ordinal + 1}】\n${snippet}`;
              }),
            ].join("\n\n")
          : `参考库检索（query=${key}）：（暂无命中）`
        : "参考库检索：（未设置 query）";
      blocks.push({ id: "rag", title: "RAG：参考库检索注入", chars: s.length, content: s });
    }

    const content = props.chapterContent ?? "";
    if (currentContextMode === "full" && content.trim()) {
      const s = "当前正文：\n" + clampText(content, Math.floor(settings.maxContextChars * 0.45));
      blocks.push({ id: "cur", title: "当前章注入：全文", chars: s.length, content: s });
    } else if (currentContextMode === "summary" && (props.chapter.summary ?? "").trim()) {
      const s =
        "当前章节概要（仅供回忆事实）：\n" +
        clampText((props.chapter.summary ?? "").trim(), Math.floor(settings.maxContextChars * 0.2));
      blocks.push({ id: "cur", title: "当前章注入：概要", chars: s.length, content: s });
    } else if (currentContextMode === "selection" && selectedText.trim()) {
      const s = "当前选区：\n" + clampText(selectedText.trim(), Math.floor(settings.maxContextChars * 0.25));
      blocks.push({ id: "cur", title: "当前章注入：选区", chars: s.length, content: s });
    } else if (currentContextMode === "none") {
      blocks.push({ id: "cur", title: "当前章注入：不注入", chars: 0, content: "（不注入当前章内容）" });
    } else {
      blocks.push({ id: "cur", title: "当前章注入：空", chars: 0, content: "（当前选择的注入来源为空）" });
    }

    const hint = userHint.trim();
    if (hint) {
      const s = "额外要求：\n" + hint;
      blocks.push({ id: "hint", title: "额外要求", chars: s.length, content: s });
    }

    return blocks;
  }, [
    props.chapter,
    props.work.title,
    props.chapter?.title,
    props.chapterBible.goalText,
    props.chapterBible.forbidText,
    props.chapterBible.povText,
    props.chapterBible.sceneStance,
    props.linkedExcerptsForChapter,
    props.chapterContent,
    props.chapter?.summary,
    storyBackground,
    characters,
    relations,
    includeLinkedExcerpts,
    includeRecentSummaries,
    recentSummaryText,
    recentN,
    currentContextMode,
    selectedText,
    userHint,
    skillPresetText,
    settings.includeBible,
    settings.maxContextChars,
    biblePreview?.text,
    ragEnabled,
    ragQuery,
    ragK,
    ragHits,
  ]);

  const approxInjectChars = useMemo(() => injectBlocks.reduce((s, b) => s + (b.chars ?? 0), 0), [injectBlocks]);

  const approxInjectTokens = useMemo(() => {
    // Bible size is unknown until fetched; we keep it as a small constant signal.
    const s = settings.includeBible ? `${approxInjectChars}\n[BIBLE]` : String(approxInjectChars);
    return approxTokens(s);
  }, [approxInjectChars, settings.includeBible]);

  function updateSettings(patch: Partial<AiSettings>) {
    const next: AiSettings = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
  }

  function updateProvider(p: AiProviderId) {
    updateSettings({ provider: p });
  }

  async function run(input?: { provider: AiProviderId; providerCfg: any; messages: AiChatMessage[] }) {
    if (!props.chapter) {
      setError("请先选择章节。");
      return;
    }
    if (!input && isCloudProvider && !cloudAllowed) {
      setError(null);
      setProviderPickerOpen(true);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      let messages: AiChatMessage[];
      let usedProvider: AiProviderId;
      let usedProviderCfg: any;
      if (input) {
        messages = input.messages;
        usedProvider = input.provider;
        usedProviderCfg = input.providerCfg;
      } else {
        const sysParts: string[] = [
          "你是一个严谨的中文小说写作助手。你必须遵守用户提供的约束与设定，不要编造设定外事实。",
          "输出要求：中文；尽量具体可执行；不要输出与任务无关的解释。",
        ];
        if (props.workStyle.pov.trim()) sysParts.push(`叙述视角/人称：${props.workStyle.pov.trim()}`);
        if (props.workStyle.tone.trim()) sysParts.push(`整体调性：${props.workStyle.tone.trim()}`);
        if (props.workStyle.bannedPhrases.trim()) {
          sysParts.push("禁用词/禁用套话（必须避免）：\n" + props.workStyle.bannedPhrases.trim());
        }
        if (props.workStyle.extraRules.trim()) sysParts.push("额外硬约束：\n" + props.workStyle.extraRules.trim());

        const ctxParts: string[] = [];
        if (!isCloudProvider || settings.privacy.allowMetadata) {
          ctxParts.push(`作品：${props.work.title}`);
          ctxParts.push(`章节：${props.chapter.title}`);
        }
        if (props.workStyle.styleAnchor.trim()) {
          ctxParts.push("文风锚点（尽量贴近其用词/节奏/句法）：\n" + props.workStyle.styleAnchor.trim());
        }
        if (storyBackground.trim()) ctxParts.push(`故事背景：\n${storyBackground.trim()}`);
        if (characters.trim()) ctxParts.push(`角色清单：\n${characters.trim()}`);
        if (relations.trim()) ctxParts.push(`角色关系：\n${relations.trim()}`);
        if (props.chapterBible.goalText.trim()) ctxParts.push(`本章目标：\n${props.chapterBible.goalText.trim()}`);
        if (props.chapterBible.forbidText.trim()) ctxParts.push(`禁止：\n${props.chapterBible.forbidText.trim()}`);
        if (props.chapterBible.povText.trim()) ctxParts.push(`视角/口吻：\n${props.chapterBible.povText.trim()}`);
        if (props.chapterBible.sceneStance.trim()) ctxParts.push(`场景状态：\n${props.chapterBible.sceneStance.trim()}`);
        if (skillPresetText) ctxParts.push(skillPresetText);

        if (
          includeLinkedExcerpts &&
          props.linkedExcerptsForChapter.length > 0 &&
          (!isCloudProvider || settings.privacy.allowLinkedExcerpts)
        ) {
          const ex = props.linkedExcerptsForChapter
            .slice(0, 8)
            .map((e, i) => `【摘录${i + 1}｜${e.refTitle}】\n${e.text}`)
            .join("\n\n");
          ctxParts.push(`参考摘录（与本章关联）：\n${ex}`);
        }

        if (ragEnabled && (!isCloudProvider || settings.privacy.allowRagSnippets)) {
          const q = ragQuery.trim();
          if (q) {
            try {
              setRagLoading(true);
              const hits = await searchReferenceLibrary(q, { limit: Math.max(1, Math.min(20, ragK)) });
              setRagHits(hits);
            } finally {
              setRagLoading(false);
            }
          }
        }

        let bible = "";
        if (settings.includeBible && (!isCloudProvider || settings.privacy.allowBible)) {
          try {
            setBibleLoading(true);
            bible = await exportBibleMarkdown(props.workId);
            setBiblePreview({ text: bible, chars: bible.length });
          } finally {
            setBibleLoading(false);
          }
        }

        const content = props.chapterContent ?? "";
        const userParts: string[] = [];
        userParts.push("上下文：\n" + clampText(ctxParts.join("\n\n"), Math.floor(settings.maxContextChars * 0.25)));
        if (recentSummaryText.trim() && (!isCloudProvider || settings.privacy.allowRecentSummaries)) {
          userParts.push(
            "最近章节概要（仅供回忆事实）：\n" + clampText(recentSummaryText, Math.floor(settings.maxContextChars * 0.2)),
          );
        }
        if (bible.trim()) {
          userParts.push(
            "创作圣经（如与正文冲突，以圣经为准）：\n" + clampText(bible, Math.floor(settings.maxContextChars * 0.45)),
          );
        }
        if (ragEnabled && ragQuery.trim() && (!isCloudProvider || settings.privacy.allowRagSnippets)) {
          const picked = (ragHits.length ? ragHits : []).slice(0, Math.max(0, Math.min(20, ragK)));
          if (picked.length > 0) {
            const s = [
              `参考库检索（top-k=${picked.length}，query=${ragQuery.trim()}）：`,
              ...picked.map((h, i) => {
                const snippet = `${h.snippetBefore}${h.snippetMatch}${h.snippetAfter}`.trim();
                return `【命中${i + 1}｜${h.refTitle}｜段${h.ordinal + 1}】\n${snippet}`;
              }),
            ].join("\n\n");
            userParts.push("参考库检索片段（仅供引用原文信息，不要编造）：\n" + clampText(s, Math.floor(settings.maxContextChars * 0.25)));
          }
        }
        if (currentContextMode === "full" && content.trim() && (!isCloudProvider || settings.privacy.allowChapterContent)) {
          userParts.push("当前正文：\n" + clampText(content, Math.floor(settings.maxContextChars * 0.45)));
        } else if (
          currentContextMode === "summary" &&
          (props.chapter.summary ?? "").trim() &&
          (!isCloudProvider || settings.privacy.allowRecentSummaries)
        ) {
          userParts.push(
            "当前章节概要（仅供回忆事实）：\n" +
              clampText((props.chapter.summary ?? "").trim(), Math.floor(settings.maxContextChars * 0.2)),
          );
        } else if (currentContextMode === "selection" && selectedText.trim() && (!isCloudProvider || settings.privacy.allowSelection)) {
          userParts.push("当前选区：\n" + clampText(selectedText.trim(), Math.floor(settings.maxContextChars * 0.25)));
        }

        const hint = userHint.trim();
        if (hint) userParts.push("额外要求：\n" + hint);

        const task =
          mode === "continue"
            ? "请续写本章下一段（约 300～800 字），保持语气一致，承接当前正文末尾。"
            : mode === "outline"
              ? "请给出本章后续 6～10 个要点的场景推进大纲（每条一句）。"
              : mode === "summarize"
                ? "请用 6～10 条要点总结本章已写正文的事实信息（只列事实，不要推测）。"
                : selectedText.trim()
                  ? "请在不改变事实与设定的前提下重写所选文本，使其更紧凑更有画面感。输出只给重写后的文本。"
                  : "请从正文末尾开始重写最近一段，使其更紧凑更有画面感。输出只给重写后的文本。";

        messages = [
          { role: "system", content: sysParts.join("\n") },
          {
            role: "user",
            content:
              userParts.join("\n\n") +
              "\n\n任务：\n" +
              task +
              (mode === "rewrite" && selectedText.trim() ? `\n\n所选文本：\n${selectedText}` : ""),
          },
        ];
        usedProvider = settings.provider;
        usedProviderCfg = providerCfg;
      }

      lastReqRef.current = { provider: usedProvider, providerCfg: usedProviderCfg, messages };
      const r = await generateWithProviderStream({
        provider: usedProvider,
        config: usedProviderCfg,
        messages,
        signal: ac.signal,
        onDelta: (d) => setDraft((prev) => prev + d),
        temperature: usedProvider !== "ollama" ? settings.geminiTemperature : undefined,
      });
      if (!draft.trim() && (r.text ?? "").trim()) {
        setDraft((r.text ?? "").trim());
      }
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      if (!aborted) setError(e instanceof Error ? e.message : "AI 调用失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="ai-panel" aria-label="AI 面板">
      <div className="ai-panel-head">
        <strong>AI</strong>
        <button type="button" className="icon-btn" title="关闭" onClick={props.onClose}>
          ×
        </button>
      </div>

      <div className="ai-panel-row">
        <label className="small muted">提供方</label>
        <button
          type="button"
          className="btn"
          title={PROVIDER_UI[settings.provider]?.tip ?? ""}
          onClick={() => setProviderPickerOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <ProviderLogo provider={settings.provider} />
          <span>{PROVIDER_UI[settings.provider]?.label ?? settings.provider}</span>
        </button>
      </div>

      {providerPickerOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="选择模型提供方"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setProviderPickerOpen(false);
          }}
        >
          <div className="modal-card modal-card--wide model-picker">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0 }}>选择模型</h3>
              <button type="button" className="icon-btn" title="关闭" onClick={() => setProviderPickerOpen(false)}>
                ×
              </button>
            </div>

            <div className="model-picker-body">
              <div className="model-picker-left" role="tablist" aria-label="模型列表">
                {(["openai", "anthropic", "gemini", "doubao", "zhipu", "kimi", "xiaomi", "ollama"] as AiProviderId[]).map((id) => {
                  const ui = PROVIDER_UI[id];
                  const isCloud = id !== "ollama";
                  const disabled = isCloud && !(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
                  const active = pickerActive === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      data-provider={id}
                      aria-selected={active}
                      aria-disabled={disabled}
                      className={
                        "model-picker-item" +
                        (active ? " is-active" : "") +
                        (disabled ? " is-disabled" : "")
                      }
                      title={disabled ? "去设置开启" : ui.tip}
                      onClick={() => {
                        if (disabled) {
                          setProviderPickerOpen(false);
                          window.location.href = "/settings#ai-privacy";
                          return;
                        }
                        setPickerActive(id);
                      }}
                    >
                      <ProviderLogo provider={id} />
                      <span className="model-picker-item-main">
                        <span className="model-picker-item-title">{ui.label}</span>
                        <span className="model-picker-item-sub muted small">{ui.subtitle}</span>
                      </span>
                      <span className="model-picker-item-tag muted small">{settings.provider === id ? "当前" : ""}</span>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const ui = PROVIDER_UI[pickerActive];
                const isCloud = pickerActive !== "ollama";
                const disabled = isCloud && !(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
                return (
                  <div className="model-picker-right" role="tabpanel" aria-label="模型介绍" data-provider={pickerActive}>
                    <div className="model-picker-right-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ProviderLogo provider={pickerActive} />
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 18 }}>
                            {ui.label}
                          </div>
                          <div className="muted small">{ui.subtitle}</div>
                        </div>
                      </div>
                    </div>

                    <div className="model-picker-quote">{ui.quote}</div>
                    <div className="model-picker-core">{ui.core}</div>

                    <div className="model-picker-meters">
                      <div className="model-meter">
                        <div className="muted small">文采水平</div>
                        <Meter value={ui.meters.prose} />
                      </div>
                      <div className="model-meter">
                        <div className="muted small">指令遵从</div>
                        <Meter value={ui.meters.follow} />
                      </div>
                      <div className="model-meter">
                        <div className="muted small">字数消耗</div>
                        <Meter
                          value={
                            pickerActive !== "ollama"
                              ? geminiCostStarsFromShensi(settings.geminiTemperature)
                              : ui.meters.cost
                          }
                        />
                        {pickerActive === "ollama" && ui.meters.costText ? (
                          <span className="muted small" style={{ marginLeft: 8 }}>
                            （{ui.meters.costText}）
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="model-picker-note">
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>注意事项</div>
                      <div className="muted small" style={{ lineHeight: 1.65 }}>
                        {ui.note}
                      </div>
                    </div>

                    <div className="model-picker-tune model-picker-tune--dock">
                      <div
                        className="model-picker-tune-dock"
                        role="toolbar"
                        aria-label={
                          pickerActive === "gemini"
                            ? "观云调参"
                            : pickerActive === "ollama"
                              ? "本地模型"
                              : "云端调参"
                        }
                      >
                        {pickerActive === "gemini" ? (
                          <div className="model-picker-dock-anchor">
                            {modelPickerTune === "gear" ? (
                              <div className="model-picker-mini-pop model-picker-mini-pop--gear" role="dialog" aria-label="模型档位">
                                {(() => {
                                  const gIdx = geminiGearIndex(settings.gemini.model);
                                  const pct = (gIdx / 2) * 100;
                                  const invPct = 100 - pct;
                                  const tubeBg = `linear-gradient(to top,
                                    rgba(0,0,0,0.78) 0%,
                                    rgba(0,0,0,0.78) ${pct}%,
                                    rgba(0,0,0,0.12) ${pct}%,
                                    rgba(0,0,0,0.12) 100%)`;
                                  const label = GEMINI_GEAR_KEYS[gIdx] ?? "化境";
                                  return (
                                    <div className="temp-wrap model-picker-gear-thermo">
                                      <div className="temp-float temp-float--mini muted small" style={{ top: `${invPct}%` }}>
                                        {label}
                                      </div>
                                      <div className="temp-vert temp-vert--mini" aria-label="模型档位">
                                        <div className="temp-tube" aria-hidden="true" style={{ background: tubeBg }} />
                                        <input
                                          className="temp-slider temp-slider--vert"
                                          type="range"
                                          min={0}
                                          max={2}
                                          step={1}
                                          value={gIdx}
                                          onChange={(e) => {
                                            const i = Math.max(0, Math.min(2, Number(e.target.value) || 0));
                                            const k = GEMINI_GEAR_KEYS[i] ?? "化境";
                                            updateSettings({ gemini: { ...settings.gemini, model: GEMINI_MIND[k] } });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div className="model-picker-mini-pop-caret" aria-hidden />
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className={"model-picker-dock-btn" + (modelPickerTune === "gear" ? " is-active" : "")}
                              aria-pressed={modelPickerTune === "gear"}
                              aria-expanded={modelPickerTune === "gear"}
                              onClick={() => setModelPickerTune((p) => (p === "gear" ? null : "gear"))}
                            >
                              模型档位
                            </button>
                          </div>
                        ) : null}

                        {pickerActive !== "ollama" ? (
                          <div className="model-picker-dock-anchor">
                            {modelPickerTune === "shensi" ? (
                              <div className="model-picker-mini-pop model-picker-mini-pop--shensi" role="dialog" aria-label="神思">
                                {(() => {
                                  const pct = Math.max(0, Math.min(100, ((settings.geminiTemperature - 0.1) / 1.9) * 100));
                                  const invPct = 100 - pct;
                                  const tubeBg = `linear-gradient(to top,
                                    rgba(0,0,0,0.78) 0%,
                                    rgba(0,0,0,0.78) ${pct}%,
                                    rgba(0,0,0,0.12) ${pct}%,
                                    rgba(0,0,0,0.12) 100%)`;
                                  return (
                                    <div className="temp-wrap model-picker-shensi-body temp-pop-thermo">
                                      <div className="temp-float temp-float--mini muted small" style={{ top: `${invPct}%` }}>
                                        {tempSides(settings.geminiTemperature).center}
                                      </div>
                                      <div className="temp-vert temp-vert--mini" aria-label="Temperature">
                                        <div className="temp-tube" aria-hidden="true" style={{ background: tubeBg }} />
                                        <input
                                          className="temp-slider temp-slider--vert"
                                          type="range"
                                          min={0.1}
                                          max={2.0}
                                          step={0.1}
                                          value={settings.geminiTemperature}
                                          onChange={(e) => {
                                            const v = Math.max(0.1, Math.min(2.0, Number(e.target.value) || 1.2));
                                            updateSettings({ geminiTemperature: v });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div className="model-picker-mini-pop-caret" aria-hidden />
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className={"model-picker-dock-btn" + (modelPickerTune === "shensi" ? " is-active" : "")}
                              aria-pressed={modelPickerTune === "shensi"}
                              aria-expanded={modelPickerTune === "shensi"}
                              onClick={() => setModelPickerTune((p) => (p === "shensi" ? null : "shensi"))}
                            >
                              神思
                            </button>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          className="btn primary model-picker-dock-use"
                          aria-disabled={disabled}
                          title={disabled ? "去设置开启" : ""}
                          onClick={() => {
                            if (disabled) {
                              setProviderPickerOpen(false);
                              window.location.href = "/settings#ai-privacy";
                              return;
                            }
                            updateProvider(pickerActive);
                            setProviderPickerOpen(false);
                          }}
                        >
                          使用
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}
      <div className="ai-panel-row">
        <label className="small muted">模式</label>
        <select name="aiMode" value={mode} onChange={(e) => setMode(e.target.value as any)}>
          <option value="continue">续写</option>
          <option value="rewrite">改写</option>
          <option value="outline">大纲</option>
          <option value="summarize">事实总结</option>
        </select>
      </div>

      <details className="ai-panel-box">
        <summary>写作变量（显式控制）</summary>
        <label className="ai-panel-field">
          <span className="small muted">故事背景（可空）</span>
          <textarea name="storyBackground" value={storyBackground} onChange={(e) => setStoryBackground(e.target.value)} rows={3} />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">角色（可空）</span>
          <textarea name="characters" value={characters} onChange={(e) => setCharacters(e.target.value)} rows={3} />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">角色关系（可空）</span>
          <textarea name="relations" value={relations} onChange={(e) => setRelations(e.target.value)} rows={3} />
        </label>
        <div className="ai-panel-row">
          <label className="small muted">技巧预设</label>
          <select name="skillPreset" value={skillPreset} onChange={(e) => setSkillPreset(e.target.value as any)}>
            <option value="none">无</option>
            <option value="tight">紧凑</option>
            <option value="dialogue">对话推进</option>
            <option value="describe">画面氛围</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        {skillPreset === "custom" ? (
          <label className="ai-panel-field">
            <span className="small muted">自定义技巧</span>
            <textarea name="skillText" value={skillText} onChange={(e) => setSkillText(e.target.value)} rows={3} />
          </label>
        ) : null}
      </details>

      <details className="ai-panel-box">
        <summary>风格卡 / 调性锁（全书级）</summary>
        <label className="ai-panel-field">
          <span className="small muted">叙述视角 / 人称（可空）</span>
          <textarea
            name="stylePov"
            value={props.workStyle.pov}
            onChange={(e) => props.onUpdateWorkStyle({ pov: e.target.value })}
            rows={2}
            placeholder="例如：第三人称有限 · 贴近主角内心；过去时/现在时…"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">整体调性（可空）</span>
          <textarea
            name="styleTone"
            value={props.workStyle.tone}
            onChange={(e) => props.onUpdateWorkStyle({ tone: e.target.value })}
            rows={2}
            placeholder="例如：克制冷峻、少解释、多动作；偏硬核；节奏快…"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">禁用词 / 禁用套话（换行分隔，可空）</span>
          <textarea
            name="styleBannedPhrases"
            value={props.workStyle.bannedPhrases}
            onChange={(e) => props.onUpdateWorkStyle({ bannedPhrases: e.target.value })}
            rows={3}
            placeholder="例如：不由得、顿时、旋即、仿佛、不可思议…"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">文风锚点（短样例，可空）</span>
          <textarea
            name="styleAnchor"
            value={props.workStyle.styleAnchor}
            onChange={(e) => props.onUpdateWorkStyle({ styleAnchor: e.target.value })}
            rows={4}
            placeholder="粘贴一小段你满意的成稿，用来锁句式与节奏。"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">额外硬约束（可空）</span>
          <textarea
            name="styleExtraRules"
            value={props.workStyle.extraRules}
            onChange={(e) => props.onUpdateWorkStyle({ extraRules: e.target.value })}
            rows={3}
            placeholder="例如：避免上帝视角；不要出现现代网络词；对话不加引号…"
          />
        </label>
      </details>

      <details className="ai-panel-box">
        <summary>检索增强（RAG v1：参考库）</summary>
        <label className="ai-panel-check row row--check">
          <input name="ragEnabled" type="checkbox" checked={ragEnabled} onChange={(e) => setRagEnabled(e.target.checked)} />
          <span>启用参考库检索注入</span>
        </label>
        <label className="ai-panel-field">
          <span className="small muted">检索关键词（query）</span>
          <input
            className="input"
            name="ragQuery"
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            placeholder="例如：太初古矿、玉简、主角姓名…"
          />
        </label>
        <div className="ai-panel-row">
          <label className="small muted">top-k</label>
          <input
            type="number"
            name="ragTopK"
            min={1}
            max={20}
            value={ragK}
            onChange={(e) => setRagK(Number(e.target.value) || 6)}
            style={{ width: 72 }}
          />
          <button
            type="button"
            className="btn small"
            disabled={!ragEnabled || !ragQuery.trim() || ragLoading || busy}
            onClick={() => {
              const q = ragQuery.trim();
              if (!q) return;
              setRagLoading(true);
              void searchReferenceLibrary(q, { limit: Math.max(1, Math.min(20, ragK)) })
                .then((hits) => setRagHits(hits))
                .catch((e) => setError(e instanceof Error ? e.message : "检索失败"))
                .finally(() => setRagLoading(false));
            }}
          >
            {ragLoading ? "检索中…" : "检索预览"}
          </button>
        </div>
        {ragEnabled && ragQuery.trim() ? (
          ragHits.length > 0 ? (
            <ul className="rr-list">
              {ragHits.slice(0, Math.max(0, Math.min(12, ragK))).map((h) => (
                <li key={`${h.chunkId}-${h.highlightStart}-${h.highlightEnd}`} className="rr-list-item">
                  <a
                    className="rr-link"
                    href={referenceReaderHref({
                      refWorkId: h.refWorkId,
                      ordinal: h.ordinal,
                      startOffset: h.highlightStart,
                      endOffset: h.highlightEnd,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    title="在参考库打开（新标签页）"
                  >
                    {h.refTitle} · 段 {h.ordinal + 1}
                  </a>
                  <div className="muted small">{h.snippetBefore}{h.snippetMatch}{h.snippetAfter}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">暂无命中。你可以换关键词，或先去「参考库」确认已导入原著。</p>
          )
        ) : (
          <p className="muted small">提示：这是关键词检索注入（非向量）。用于把“参考原文片段”带进本次请求。</p>
        )}
      </details>

      <details className="ai-panel-box" open>
        <summary>上下文注入</summary>
        <label className="ai-panel-check row row--check">
          <input
            name="includeBible"
            type="checkbox"
            checked={settings.includeBible}
            onChange={(e) => updateSettings({ includeBible: e.target.checked })}
          />
          <span>注入创作圣经</span>
        </label>
        <label className="ai-panel-check row row--check">
          <input
            name="includeLinkedExcerpts"
            type="checkbox"
            checked={includeLinkedExcerpts}
            onChange={(e) => setIncludeLinkedExcerpts(e.target.checked)}
          />
          <span>注入本章关联摘录</span>
        </label>
        <div className="ai-panel-row">
          <label className="ai-panel-check row row--check" style={{ margin: 0 }}>
            <input
              name="includeRecentSummaries"
              type="checkbox"
              checked={includeRecentSummaries}
              onChange={(e) => setIncludeRecentSummaries(e.target.checked)}
            />
            <span>注入最近章节概要</span>
          </label>
          <input
            type="number"
            name="recentN"
            min={0}
            max={12}
            value={recentN}
            onChange={(e) => setRecentN(Number(e.target.value) || 0)}
            style={{ width: 72 }}
            title="最近 N 章"
          />
        </div>
        <div className="ai-panel-row">
          <label className="small muted">当前章注入</label>
          <select name="currentContextMode" value={currentContextMode} onChange={(e) => setCurrentContextMode(e.target.value as any)}>
            <option value="full">全文</option>
            <option value="summary">概要</option>
            <option value="selection">选区</option>
            <option value="none">不注入</option>
          </select>
        </div>
        <p className="muted small">
          预计注入：约 {approxInjectChars.toLocaleString()} 字 / ≈ {approxInjectTokens.toLocaleString()} tokens
          {" / "}
          {settings.maxContextChars.toLocaleString()}
        </p>
        {settings.includeBible ? (
          <p className="muted small" style={{ marginTop: "-0.25rem" }}>
            注：圣经内容在运行时抓取并截断，token/字符估算会偏保守。
          </p>
        ) : null}
      </details>

      <details className="ai-panel-box">
        <summary>本次注入预览（发送前可查看）</summary>
        <div className="ai-panel-row" style={{ marginTop: 8 }}>
          <span className="muted small">
            预计注入：约 {approxInjectChars.toLocaleString()} 字 / ≈ {approxInjectTokens.toLocaleString()} tokens
          </span>
          {settings.includeBible ? (
            <button
              type="button"
              className="btn small"
              disabled={bibleLoading || busy}
              onClick={() => {
                if (!settings.includeBible) return;
                setBibleLoading(true);
                void exportBibleMarkdown(props.workId)
                  .then((t) => setBiblePreview({ text: t, chars: t.length }))
                  .catch((e) => setError(e instanceof Error ? e.message : "圣经预览加载失败"))
                  .finally(() => setBibleLoading(false));
              }}
            >
              {bibleLoading ? "加载圣经…" : biblePreview?.text ? "刷新圣经预览" : "加载圣经预览"}
            </button>
          ) : null}
        </div>
        {injectBlocks.length === 0 ? (
          <p className="muted small">请先选择章节。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {injectBlocks.map((b) => (
              <details key={b.id} className="ai-panel-box" style={{ margin: 0 }}>
                <summary>
                  {b.title}
                  <span className="muted small"> · {b.chars.toLocaleString()} 字</span>
                  {b.note ? <span className="muted small"> · {b.note}</span> : null}
                </summary>
                <textarea readOnly value={b.content} rows={6} style={{ width: "100%", resize: "vertical", marginTop: 8 }} />
              </details>
            ))}
          </div>
        )}
      </details>

      <label className="ai-panel-field">
        <span className="small muted">额外要求（可空）</span>
        <textarea name="userHint" value={userHint} onChange={(e) => setUserHint(e.target.value)} rows={3} />
      </label>

      <div className="ai-panel-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
          {busy ? "生成中…" : "生成"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!busy}
          onClick={() => {
            abortRef.current?.abort();
          }}
        >
          取消
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !lastReqRef.current}
          onClick={() => {
            const last = lastReqRef.current;
            if (!last) return;
            void run({ provider: last.provider, providerCfg: last.providerCfg, messages: last.messages });
          }}
        >
          重试
        </button>
      </div>
      {error ? <p className="muted small ai-panel-error">{error}</p> : null}

      <label className="ai-panel-field">
        <span className="small muted">AI 草稿（不会自动写入正文）</span>
        <textarea name="aiDraft" value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} />
      </label>

      {glossaryHitsInDraft.length > 0 ? (
        <div className="rr-block">
          <div className="rr-block-title">一致性提示（来自术语/人名表）</div>
          <ul className="rr-list">
            {glossaryHitsInDraft.map((t) => (
              <li key={t.id} className="rr-list-item">
                <span style={{ fontWeight: 700 }}>{t.term}</span>
                <span className="muted small">
                  {t.category === "dead" ? " · 已死（请确认没有复活/误用）" : t.category === "name" ? " · 人名" : " · 术语"}
                  {t.note.trim() ? ` · ${t.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ai-panel-actions">
        <button
          type="button"
          className="btn"
          disabled={!draft.trim()}
          onClick={() => props.insertAtCursor(draft.trim() + "\n\n")}
        >
          插入到光标
        </button>
        <button
          type="button"
          className="btn"
          disabled={!draft.trim()}
          onClick={() => {
            const t = draft.trim();
            if (!t) return;
            props.appendToEnd("\n\n" + t + "\n");
          }}
        >
          追加到章尾
        </button>
        <button
          type="button"
          className="btn"
          disabled={!draft.trim() || !selectedText.trim()}
          title={selectedText.trim() ? "" : "请先选中要替换的文本"}
          onClick={() => {
            const t = draft.trim();
            if (!t) return;
            if (!selectedText.trim()) return;
            if (!window.confirm("确定用 AI 草稿替换当前选区？此操作会直接修改正文。")) return;
            props.replaceSelection(t);
          }}
        >
          替换选区
        </button>
      </div>

      <p className="muted small">
        提示：浏览器直连第三方模型可能遇到 CORS/网络限制；Ollama 默认 `http://localhost:11434`。
      </p>
    </aside>
  );
}

