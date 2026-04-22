import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { exportBibleMarkdown } from "../db/repo";
import type {
  BibleCharacter,
  BibleGlossaryTerm,
  GlobalPromptTemplate,
  ReferenceExcerpt,
  ReferenceSearchHit,
  Work,
  Chapter,
} from "../db/types";
import { approxRoughTokenCount } from "../ai/approx-tokens";
import { addSessionApproxTokens, readSessionApproxTokens, resetSessionApproxTokens } from "../ai/sidepanel-session-tokens";
import { addTodayApproxTokens, readTodayApproxTokens } from "../ai/daily-approx-tokens";
import {
  buildWritingSidepanelInjectBlocks,
  buildWritingSidepanelMaterialsSummaryLines,
  buildWritingSidepanelMessages,
  type ChapterBibleFieldKey,
  validateDrawCardRequest,
  type WritingSidepanelAssembleInput,
  type WritingSkillMode,
  type WritingStyleSampleSlice,
  type WritingGlossaryTermSlice,
  type WritingStudyCharacterCardSlice,
} from "../ai/assemble-context";
import { filterWorkBibleMarkdownBySections } from "../ai/work-bible-sections";
import { generateWithProviderStream, isFirstAiGateCancelledError } from "../ai/client";
import {
  getProviderConfig,
  getProviderTemperature,
  loadAiSettings,
  patchProviderTemperature,
  saveAiSettings,
} from "../ai/storage";
import type { AiChatMessage, AiProviderConfig, AiProviderId, AiSettings } from "../ai/types";
import { resolveInjectionConfirmPrompt } from "../util/ai-injection-confirm";
import { CostGateModal, type CostGatePayload } from "./CostGateModal";
import {
  buildContextDegradeOverrides,
  errorSuggestsContextDegrade,
  type AiRunContextOverrides,
} from "../util/ai-degrade-retry";
import { normalizeWorkTagList, workTagsToProfileText } from "../util/work-tags";
import { computeToneDriftHints } from "../util/tone-drift-hint";
import { cosineDistance } from "../util/vector-math";
import { readEmbeddingCache, writeEmbeddingCache } from "../util/embedding-cache";
import { embedWithProvider } from "../ai/client";
import { searchWritingRagMerged, type WritingRagSources } from "../util/work-rag-runtime";
import { AiDraftMergeDialog, type AiDraftMergePayload } from "./AiDraftMergeDialog";
import { AiInlineErrorNotice } from "./AiInlineErrorNotice";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { AiPanelWritingPromptsRow } from "./ai-panel/AiPanelWritingPromptsRow";
import { renderPromptTemplate } from "../util/render-prompt-template";
import { cn } from "../lib/utils";
import { listModelPersonas } from "../util/model-personas";
import { aiPanelDraftStorageKey, pushDraftHistory, readDraftHistory, deleteDraftHistoryEntry, type AiDraftHistoryEntry } from "../util/ai-panel-draft";
import { isLocalAiProvider } from "../ai/local-provider";
import { doubaoModelDisplayLabel } from "../util/doubao-ui";
import { AiPanelRagSection, runAiPanelRagPreview } from "./ai-panel/AiPanelRagSection";
import { AiPanelStudyChapterSection } from "./ai-panel/AiPanelStudyChapterSection";
import { LINKED_CHAPTERS_UPDATED_EVENT, loadLinkedChapters } from "../util/linked-chapters-storage";
import {
  CHAPTER_OUTLINE_PASTE_UPDATED_EVENT,
  loadChapterOutlinePaste,
  saveChapterOutlinePaste,
} from "../util/chapter-outline-paste-storage";
import { readStudyChapterSelection, writeStudyChapterSelection } from "../util/study-chapter-selection-storage";
import { buildStudyNeedleText, pickSuggestedCharacterIds, pickSuggestedGlossaryIds } from "../util/study-suggestions";
import type {
  AiPanelWorkRagInjectDefaults,
  AiPanelWorkRagInjectDefaultsPatch,
  AiPanelWorkWritingVars,
  AiPanelWorkWritingVarsPatch,
} from "./ai-panel/types";
import { Bot } from "lucide-react";

function providerLogoImgSrc(p: AiProviderId): string | null {
  switch (p) {
    case "openai":
      return "/logos/openai.png";
    case "anthropic":
      return "/logos/claude.png";
    case "gemini":
      return "/logos/gemini.png";
    case "ollama":
    case "mlx":
      return "/logos/ollama.png";
    case "doubao":
      return "/logos/doubao.png";
    case "zhipu":
      return "/logos/zhipu.png";
    case "kimi":
      return "/logos/kimi.png";
    case "xiaomi":
      return "/logos/xiaomi.png";
    default:
      return null;
  }
}

function providerLogoFallbackText(p: AiProviderId): string {
  switch (p) {
    case "openai":
      return "";
    case "anthropic":
      return "雨";
    case "gemini":
      return "云";
    case "doubao":
      return "豆";
    case "zhipu":
      return "谱";
    case "kimi":
      return "月";
    case "xiaomi":
      return "米";
    case "ollama":
    case "mlx":
      return "龙";
    default:
      return "·";
  }
}

/** 单一视觉：PNG 或一字回退，避免与侧栏列表双行文字错位 */
function AiProviderLogo(props: { provider: AiProviderId }) {
  const p = props.provider;
  const imgSrc = providerLogoImgSrc(p);
  const text = providerLogoFallbackText(p);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(imgSrc) && !imgFailed;

  return (
    <span aria-hidden className="provider-logo" data-provider={p} title={p}>
      {showImg ? (
        <img
          src={imgSrc!}
          alt=""
          className="provider-logo-img"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="provider-logo-fallback">{text || "·"}</span>
      )}
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const AiPanel = memo(function AiPanelBase(props: {
  onClose: () => void;
  /** 在右侧栏壳层内使用时隐藏标题行（避免重复两行标题） */
  hideHeader?: boolean;
  /**
   * 递增时触发一次：打开侧栏后由父组件递增；本面板切到「续写」并立即 `run`（结果仅进侧栏草稿，不写入正文）。
   * 总体规划 §11 步 17。
   */
  continueRunTick?: number;
  /** 父级已消费的 tick，避免 AiPanel 重挂载时对同一 tick 重复 run */
  lastContinueConsumedTick?: number;
  onContinueRunConsumed?: (tick: number) => void;
  /** §11 步 18：递增则切「抽卡」并自动 run（无额外提示词；概要+前文尾 → 草稿） */
  drawRunTick?: number;
  lastDrawConsumedTick?: number;
  onDrawRunConsumed?: (tick: number) => void;
  /** 锦囊「提示词」跳转：一次性覆盖侧栏「额外要求」 */
  prefillUserHint?: string | null;
  onPrefillUserHintConsumed?: () => void;
  workId: string;
  work: Work;
  chapter: Chapter | null;
  chapters: Chapter[];
  chapterContent: string;
  chapterBible: {
    goalText: string;
    forbidText: string;
    povText: string;
    sceneStance: string;
    characterStateText: string;
  };
  glossaryTerms: BibleGlossaryTerm[];
  /** 书斋：锦囊「人物卡」同源数据（整书） */
  bibleCharacters: BibleCharacter[];
  /** §11 步 43：锦囊「笔感」页维护的参考段落 */
  styleSampleSlices: WritingStyleSampleSlice[];
  workStyle: { pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string; sentenceRhythm?: string; punctuationStyle?: string; dialogueDensity?: "low" | "medium" | "high"; emotionStyle?: "cold" | "neutral" | "warm"; narrativeDistance?: "omniscient" | "limited" | "deep_pov" };
  onUpdateWorkStyle: (patch: Partial<{ pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string; sentenceRhythm?: string; punctuationStyle?: string; dialogueDensity?: "low" | "medium" | "high"; emotionStyle?: "cold" | "neutral" | "warm"; narrativeDistance?: "omniscient" | "limited" | "deep_pov" }>) => void;
  workWritingVars: AiPanelWorkWritingVars;
  onWorkWritingVarsChange: (patch: AiPanelWorkWritingVarsPatch) => void;
  workRagInjectDefaults: AiPanelWorkRagInjectDefaults;
  onWorkRagInjectDefaultsChange: (patch: AiPanelWorkRagInjectDefaultsPatch) => void;
  linkedExcerptsForChapter: Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>;
  getSelectedText: () => string;
  insertAtCursor: (text: string) => void;
  appendToEnd: (text: string) => void;
  replaceSelection: (text: string) => void;
  /** 同步「本次生成 · 使用材料（简版）」行，供正文工具栏悬停简报 */
  onMaterialsSummaryLinesChange?: (lines: string[]) => void;
  /** 运行模式由侧栏「设定」托管，与 `EditorPage` 状态同步 */
  writingSkillMode: WritingSkillMode;
  onWritingSkillModeChange: (m: WritingSkillMode) => void;
}) {
  const navigate = useNavigate();
  const {
    storyBackground,
    characters,
    relations,
    skillPreset,
    skillText,
  } = props.workWritingVars;

  const ri = props.workRagInjectDefaults;
  const includeLinkedExcerpts = ri.includeLinkedExcerpts;
  const includeRecentSummaries = ri.includeRecentSummaries;
  const recentN = ri.recentN;
  const neighborSummaryIncludeById = ri.neighborSummaryIncludeById;
  const chapterBibleInjectMask = ri.chapterBibleInjectMask;
  const workBibleSectionMask = ri.workBibleSectionMask;
  const currentContextMode = ri.currentContextMode;
  const ragEnabled = ri.ragEnabled;
  const ragWorkSources = ri.ragWorkSources;
  const ragK = ri.ragK;

  const patchRagInject = props.onWorkRagInjectDefaultsChange;
  const setRagWorkSourcesUp = (up: SetStateAction<WritingRagSources>) => {
    patchRagInject({
      ragWorkSources: typeof up === "function" ? up(ragWorkSources) : up,
    });
  };
  const _setNeighborSummaryIncludeByIdUp = (up: SetStateAction<Record<string, boolean>>) => {
    patchRagInject({
      neighborSummaryIncludeById: typeof up === "function" ? up(neighborSummaryIncludeById) : up,
    });
  };
  void _setNeighborSummaryIncludeByIdUp;
  const _setChapterBibleInjectMaskUp = (up: SetStateAction<Record<ChapterBibleFieldKey, boolean>>) => {
    patchRagInject({
      chapterBibleInjectMask: typeof up === "function" ? up(chapterBibleInjectMask) : up,
    });
  };
  void _setChapterBibleInjectMaskUp;
  const _setWorkBibleSectionMaskUp = (up: SetStateAction<Record<string, boolean>>) => {
    patchRagInject({
      workBibleSectionMask: typeof up === "function" ? up(workBibleSectionMask) : up,
    });
  };
  void _setWorkBibleSectionMaskUp;

  const GEMINI_MIND = {
    初见: "gemini-3.1-flash-lite-preview",
    入微: "gemini-3-flash-preview",
    化境: "gemini-3.1-pro-preview",
  } as const;

  const _GEMINI_GEAR_KEYS = ["初见", "入微", "化境"] as const;
  void _GEMINI_GEAR_KEYS;

  function _geminiGearIndex(model: string): number {
    if (model === GEMINI_MIND["初见"]) return 0;
    if (model === GEMINI_MIND["入微"]) return 1;
    return 2;
  }
  void _geminiGearIndex;

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
      quote: '"初看是山，看久了还是那座稳健的大山。"',
      core:
        "逻辑之宗，纲举目张。指令遵循极强，如利刃破竹，最擅长梳理宏大的世界观设定与严密的剧情逻辑。",
      meters: { prose: 5, follow: 5, cost: 2 },
      note: "适合\"一览众山小\"的逻辑架构，若追求极致的辞藻修饰，建议配合\"听雨\"使用。",
    },
    anthropic: {
      label: "听雨",
      subtitle: "辞藻丰盈 · 情感细腻",
      tip: "听雨（Claude）",
      quote: '"如檐下听雨，文字绵密入骨，最懂人心。"',
      core:
        "辞藻丰盈，情感细腻。像一位共情力极强的老友，成文质感极佳，自带一种天然的去\"AI味\"滤镜，是描写人物内心与凄美画面的首选。",
      meters: { prose: 5, follow: 4, cost: 3 },
      note: "如遇敏感剧情可能像雨天一样\"多愁善感\"而断更，建议微调措辞或跳过该段落。",
    },
    gemini: {
      label: "观云",
      subtitle: "创意如云 · 变幻万千",
      tip: "观云（Gemini）",
      quote: '"坐看云起，奇思妙想如漫天流云，不可捉摸。"',
      core:
        "创意如云，变幻万千。拥有惊人的上下文联想能力，最擅长在陷入瓶颈时为你提供打破常规的\"神来之笔\"，让剧情走向峰回路转。",
      meters: { prose: 4, follow: 3, cost: 2 },
      note: "云海辽阔，长文推理可能需要稍作等待，建议在开启\"高思考预算\"时保持耐心。",
    },
    ollama: {
      label: "潜龙",
      subtitle: "本地 · Ollama",
      tip: "潜龙（Ollama）",
      quote: '"藏龙于渊，不假外求，深藏不露的底气。"',
      core:
        "根植本地，稳如泰山。不依赖云端，私密且纯粹。虽然平时深潜不出，但在处理基础创作任务时，有着龙跃于渊般的稳健爆发力。",
      meters: { prose: 3, follow: 3, cost: 1, costText: "极低消耗" },
      note: "本地运行受限于设备性能，适合快速草拟或在离线环境下作为创作基座。",
    },
    mlx: {
      label: "潜龙",
      subtitle: "本地 · MLX",
      tip: "潜龙（Apple MLX）",
      quote: '"藏龙于渊，不假外求，深藏不露的底气。"',
      core:
        "根植本地，稳如泰山。通过 Apple MLX 在本机推理，私密且纯粹；请确保已启动兼容 OpenAI 接口的本地服务并正确填写 Base URL。",
      meters: { prose: 3, follow: 3, cost: 1, costText: "极低消耗" },
      note: "MLX 的模型名与端口以你的部署为准；浏览器若遇 CORS 请用 dev 代理或桌面端。",
    },
    doubao: {
      label: "燎原",
      subtitle: "墨落星火 · 势成燎原",
      tip: "燎原（豆包）",
      quote: '"墨落星火，势成燎原。"',
      core:
        "它是扎根于东方文脉的智慧火种，不只是精准解析你的一字一句，更深谙汉语背后的山河底蕴与人文温度。于方寸屏幕间，赋你一支生花妙笔；借燎原之势，让你的文思，跨越山海，写尽天下。",
      meters: { prose: 3, follow: 5, cost: 2, costText: "极低" },
      note: "若遇到调用失败，多半是 Base URL 或 Model 命名不一致；请以你控制台/通用接口参数为准。",
    },
    zhipu: {
      label: "智谱",
      subtitle: "墨竹清劲 · 文理兼备",
      tip: "智谱 GLM",
      quote: '"竹影扫阶尘不动，月穿潭底水无痕。"',
      core:
        "GLM-5 / GLM-4.7 系列在中文理解与指令遵循上扎实，适合长文写作中的结构梳理、设定补全与多轮改写；模型 ID 请以开放平台文档（如 glm-5、glm-4.7、glm-4.7-flash）为准。",
      meters: { prose: 4, follow: 4, cost: 2 },
      note: "使用 OpenAI 兼容接口（/chat/completions）；若报错请核对 Base URL、Key 与模型 ID。",
    },
    kimi: {
      label: "Kimi",
      subtitle: "长卷如月 · 徐徐展开",
      tip: "Kimi（Moonshot）",
      quote: '"月色入户，清辉满纸。"',
      core:
        "Kimi 擅长在长上下文里保持线索不断裂，适合需要\"带着前文记忆\"续写与扩写的场景；流式输出与本 App 的生成体验契合。",
      meters: { prose: 4, follow: 4, cost: 3 },
      note: "默认 Base URL 为 Moonshot 文档中的 v1 根路径；模型名以控制台为准。",
    },
    xiaomi: {
      label: "小米",
      subtitle: "锋刃内敛 · 务实为文",
      tip: "小米 MiMo",
      quote: '"工欲善其事，必先利其器。"',
      core:
        "小米 MiMo 提供 OpenAI 兼容接口；写作常用 mimo-v2-pro（偏强）与 mimo-v2-flash（偏快），在高级后端配置中可一键选择。",
      meters: { prose: 3, follow: 4, cost: 2 },
      note: "Base URL 填官方 api.mimo-v2.com/v1 即可。本地开发请用 npm run dev，已走同源代理避免浏览器跨域拦截；静态部署或遇 Failed to fetch 时需后端转发。",
    },
  };

  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [chapterOutlinePaste, setChapterOutlinePaste] = useState("");
  const [studyPickedCharacterIds, setStudyPickedCharacterIds] = useState<string[]>([]);
  const [studyPickedGlossaryIds, setStudyPickedGlossaryIds] = useState<string[]>([]);
  const [studyCharacterSource, setStudyCharacterSource] = useState<"cards" | "npc">("cards");
  const [studyNpcText, setStudyNpcText] = useState("");
  /** 防章节切换瞬间把 localStorage 默认值写覆盖到上一章 */
  const studySelectionHydratedForChapterRef = useRef<string | null>(null);
  /** 快捷窗选入的写作风格 / 要求（渲染后的正文），与下方「额外要求」文本框合并后参与组装 */
  const [writingStyleInject, setWritingStyleInject] = useState("");
  const [writingReqInject, setWritingReqInject] = useState("");
  const [selectedStyleTemplateId, setSelectedStyleTemplateId] = useState<string | null>(null);
  const [selectedReqTemplateId, setSelectedReqTemplateId] = useState<string | null>(null);
  const [styleTemplateTitle, setStyleTemplateTitle] = useState<string | null>(null);
  const [reqTemplateTitle, setReqTemplateTitle] = useState<string | null>(null);
  const [styleMode, setStyleMode] = useState<"quick" | "custom">("quick");
  const [reqMode, setReqMode] = useState<"quick" | "custom">("quick");
  const [styleCustomText, setStyleCustomText] = useState("");
  const [reqCustomText, setReqCustomText] = useState("");

  // 书斋：本章勾选（localStorage）；新章节给一套默认推荐（可改）
  useEffect(() => {
    if (!props.workId || !props.chapter) {
      setStudyPickedCharacterIds([]);
      setStudyPickedGlossaryIds([]);
      setStudyCharacterSource("cards");
      setStudyNpcText("");
      studySelectionHydratedForChapterRef.current = null;
      return;
    }
    const chapterId = props.chapter.id;
    studySelectionHydratedForChapterRef.current = null;

    const saved = readStudyChapterSelection(props.workId, chapterId);
    const charSet = new Set(props.bibleCharacters.map((c) => c.id));
    const glossSet = new Set(props.glossaryTerms.map((g) => g.id));

    if (saved) {
      const charIds = saved.characterIds.filter((id) => charSet.has(id));
      let glossIds = saved.glossaryIds.filter((id) => glossSet.has(id));
      if (saved.glossaryMode === "full_book") {
        glossIds = props.glossaryTerms.map((g) => g.id).filter((id) => glossSet.has(id));
      }
      setStudyPickedCharacterIds(charIds);
      setStudyPickedGlossaryIds(glossIds);
      setStudyCharacterSource(saved.characterSource === "npc" ? "npc" : "cards");
      setStudyNpcText(saved.npcText ?? "");
      studySelectionHydratedForChapterRef.current = chapterId;
      return;
    }

    const needleEarly = buildStudyNeedleText([
      props.chapterContent,
      props.chapter.summary,
      props.chapterBible.characterStateText,
    ]);
    const sugChar = pickSuggestedCharacterIds(props.bibleCharacters, needleEarly);
    const sugGloss = pickSuggestedGlossaryIds(props.glossaryTerms, needleEarly);
    setStudyPickedCharacterIds(sugChar);
    setStudyPickedGlossaryIds(sugGloss);
    setStudyCharacterSource("cards");
    setStudyNpcText("");
    studySelectionHydratedForChapterRef.current = chapterId;
  }, [
    props.workId,
    props.chapter?.id,
    props.bibleCharacters,
    props.glossaryTerms,
    props.chapterContent,
    props.chapter?.summary,
    props.chapterBible.characterStateText,
  ]);

  useEffect(() => {
    if (!props.workId || !props.chapter) return;
    if (studySelectionHydratedForChapterRef.current !== props.chapter.id) return;
    writeStudyChapterSelection(props.workId, props.chapter.id, {
      v: 2,
      characterIds: studyPickedCharacterIds,
      glossaryIds: studyPickedGlossaryIds,
      glossaryMode: "chapter_pick",
      characterSource: studyCharacterSource,
      npcText: studyNpcText,
    });
  }, [
    props.chapter,
    props.workId,
    studyCharacterSource,
    studyNpcText,
    studyPickedCharacterIds,
    studyPickedGlossaryIds,
  ]);

  useEffect(() => {
    // 兼容旧入口：仍消费一次性 prefill，但不再显示「额外要求」输入框
    if (props.prefillUserHint == null) return;
    props.onPrefillUserHintConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPrefillUserHintConsumed intentionally omitted
  }, [props.prefillUserHint]);

  // per-chapter outline/plot paste (manual)
  useEffect(() => {
    if (!props.workId || !props.chapter) {
      setChapterOutlinePaste("");
      return;
    }
    setChapterOutlinePaste(loadChapterOutlinePaste(props.workId, props.chapter.id));
  }, [props.workId, props.chapter?.id]);

  useEffect(() => {
    const on = (e: Event) => {
      const ev = e as CustomEvent<{ workId?: string; chapterId?: string }>;
      if (!props.chapter) return;
      if (ev.detail?.workId === props.workId && ev.detail?.chapterId === props.chapter.id) {
        setChapterOutlinePaste(loadChapterOutlinePaste(props.workId, props.chapter.id));
      }
    };
    window.addEventListener(CHAPTER_OUTLINE_PASTE_UPDATED_EVENT, on as EventListener);
    return () => window.removeEventListener(CHAPTER_OUTLINE_PASTE_UPDATED_EVENT, on as EventListener);
  }, [props.workId, props.chapter?.id]);

  const [sessionBudgetUiTick, setSessionBudgetUiTick] = useState(0);
  /** P1-04：今日用量刷新触发器（发送完成后 +1） */
  const [dailyUsageTick, setDailyUsageTick] = useState(0);
  /** P1-04：成本门控弹窗 pending（deferred-promise 模式） */
  const [costGatePending, setCostGatePending] = useState<(CostGatePayload & { resolve: (ok: boolean) => void }) | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionTokensUsed = useMemo(() => {
    void sessionBudgetUiTick;
    return settings.aiSessionApproxTokenBudget > 0 ? readSessionApproxTokens() : 0;
  }, [settings.aiSessionApproxTokenBudget, sessionBudgetUiTick, busy]);
  /** P1-04：今日已用 tokens（始终展示，随 dailyUsageTick / busy 变化刷新） */
  const todayTokensUsed = useMemo(() => {
    void dailyUsageTick;
    void busy;
    return readTodayApproxTokens();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyUsageTick, busy]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  /** P0-D：草稿元信息（最近一次生成） */
  const [draftMeta, setDraftMeta] = useState<{
    provider: string;
    mode: string;
    roughTokens: number;
    generatedAt: number;
  } | null>(null);
  /** P0-D：元信息卡是否展开 */
  const [draftMetaOpen, setDraftMetaOpen] = useState(false);
  /** P1-C：草稿历史列表 */
  const [draftHistory, setDraftHistory] = useState<AiDraftHistoryEntry[]>([]);
  /** P1-C：历史区是否展开 */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [biblePreview, setBiblePreview] = useState<{ text: string; chars: number } | null>(null);
  const [bibleLoading, setBibleLoading] = useState(false);
  void bibleLoading;
  const [linkedChaptersTick, setLinkedChaptersTick] = useState(0);

  useEffect(() => {
    function onLinked() {
      setLinkedChaptersTick((x) => x + 1);
    }
    window.addEventListener(LINKED_CHAPTERS_UPDATED_EVENT, onLinked as EventListener);
    return () => window.removeEventListener(LINKED_CHAPTERS_UPDATED_EVENT, onLinked as EventListener);
  }, []);
  const [ragQuery, setRagQuery] = useState("");
  const [ragHits, setRagHits] = useState<ReferenceSearchHit[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  /** 用户单独取消的命中 chunkId 集合；换 query 时自动清空 */
  const [ragExcluded, setRagExcluded] = useState<ReadonlySet<string>>(new Set());

  // 换关键词时清空单条排除集合
  useEffect(() => { setRagExcluded(new Set()); }, [ragQuery]);

  const runRagPreview = useCallback(() => {
    void runAiPanelRagPreview({
      workId: props.workId,
      work: props.work,
      chapters: props.chapters,
      activeChapterId: props.chapter?.id ?? null,
      ragQuery,
      ragK,
      ragWorkSources,
      setRagHits,
      setRagLoading,
      setError,
    });
  }, [props.workId, props.work, props.chapters, props.chapter?.id, ragQuery, ragK, ragWorkSources]);

  const abortRef = useRef<AbortController | null>(null);
  const lastReqRef = useRef<{
    provider: AiProviderId;
    providerCfg: AiSettings["openai"];
    messages: AiChatMessage[];
  } | null>(null);
  const runContextOverridesRef = useRef<AiRunContextOverrides | null>(null);
  const degradeAttemptedRef = useRef(false);
  const [showDegradeRetry, setShowDegradeRetry] = useState(false);
  const [mergePayload, setMergePayload] = useState<AiDraftMergePayload | null>(null);
  const skipDraftPersistRef = useRef(false);

  const draftStorageKey = props.chapter && props.workId ? aiPanelDraftStorageKey(props.workId, props.chapter.id) : null;

  useLayoutEffect(() => {
    if (!draftStorageKey) {
      setDraft("");
      setDraftHistory([]);
      return;
    }
    skipDraftPersistRef.current = true;
    try {
      setDraft(sessionStorage.getItem(draftStorageKey) ?? "");
    } catch {
      setDraft("");
    }
    setDraftHistory(props.workId && props.chapter ? readDraftHistory(props.workId, props.chapter.id) : []);
  }, [draftStorageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!draftStorageKey) return;
    if (skipDraftPersistRef.current) {
      skipDraftPersistRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(draftStorageKey, draft);
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [draft, draftStorageKey]);

  const providerCfg = useMemo(() => getProviderConfig(settings, settings.provider), [settings]);

  const isCloudProvider = !isLocalAiProvider(settings.provider);
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
    if (isLocalAiProvider(pickerActive)) {
      setModelPickerTune(null);
      return;
    }

    // 允许任意云端提供方使用「模型档位」，前提是该提供方存在 >=2 个可用 persona（档位）。
    // 否则切换 provider 时会把无效的 gear 面板关掉。
    if (modelPickerTune === "gear") {
      const personasAll = listModelPersonas(pickerActive).filter((p) => (p.modelId ?? "").trim());
      if (personasAll.length < 2) setModelPickerTune(null);
    }
  }, [pickerActive, modelPickerTune]);

  const selectedText = useMemo(() => props.getSelectedText(), [props]);

  const promptRenderVars = useMemo(
    () => ({
      work_title: props.work.title ?? "",
      work_tags: (props.work.tags ?? []).join("，"),
      chapter_title: props.chapter?.title ?? "",
      chapter_summary: props.chapter?.summary ?? "",
      chapter_content: props.chapter?.content ?? "",
    }),
    [props.work.title, props.work.tags, props.chapter?.title, props.chapter?.summary, props.chapter?.content],
  );

  const composedUserHint = useMemo(() => {
    const parts: string[] = [];
    const styleText = styleMode === "custom" ? styleCustomText : writingStyleInject;
    const reqText = reqMode === "custom" ? reqCustomText : writingReqInject;
    if (styleText.trim()) parts.push(`【文风】\n${styleText.trim()}`);
    if (reqText.trim()) parts.push(`【要求】\n${reqText.trim()}`);
    return parts.join("\n\n");
  }, [writingReqInject, writingStyleInject, styleMode, reqMode, styleCustomText, reqCustomText]);

  const onStyleTemplatePick = useCallback(
    (t: GlobalPromptTemplate | null) => {
      setSelectedStyleTemplateId(t?.id ?? null);
      setStyleTemplateTitle(t?.title ?? null);
      if (!t) {
        setWritingStyleInject("");
        return;
      }
      setWritingStyleInject(
        renderPromptTemplate(t.body, {
          work_title: promptRenderVars.work_title,
          work_tags: promptRenderVars.work_tags,
          chapter_title: promptRenderVars.chapter_title,
          chapter_summary: promptRenderVars.chapter_summary,
          chapter_content: promptRenderVars.chapter_content,
        }),
      );
    },
    [promptRenderVars],
  );

  const onReqTemplatePick = useCallback(
    (t: GlobalPromptTemplate | null) => {
      setSelectedReqTemplateId(t?.id ?? null);
      setReqTemplateTitle(t?.title ?? null);
      if (!t) {
        setWritingReqInject("");
        return;
      }
      setWritingReqInject(
        renderPromptTemplate(t.body, {
          work_title: promptRenderVars.work_title,
          work_tags: promptRenderVars.work_tags,
          chapter_title: promptRenderVars.chapter_title,
          chapter_summary: promptRenderVars.chapter_summary,
          chapter_content: promptRenderVars.chapter_content,
        }),
      );
    },
    [promptRenderVars],
  );

  const toneDriftHints = useMemo(() => {
    if (!settings.toneDriftHintEnabled) return [];
    const t = draft.trim();
    if (!t) return [];
    return computeToneDriftHints({
      bannedPhrases: props.workStyle.bannedPhrases,
      styleAnchor: props.workStyle.styleAnchor,
      draftText: draft,
    });
  }, [settings.toneDriftHintEnabled, draft, props.workStyle.bannedPhrases, props.workStyle.styleAnchor]);

  const [toneEmbedHint, setToneEmbedHint] = useState<string | null>(null);
  const [toneEmbedBusy, setToneEmbedBusy] = useState(false);
  const [toneEmbedErr, setToneEmbedErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.toneDriftHintEnabled) {
      setToneEmbedHint(null);
      setToneEmbedErr(null);
      setToneEmbedBusy(false);
      return;
    }
    const provider = settings.provider;
    if (isLocalAiProvider(provider) || !cloudAllowed) {
      setToneEmbedHint(null);
      setToneEmbedErr(null);
      setToneEmbedBusy(false);
      return;
    }
    const embModel = (providerCfg.embeddingModel ?? "").trim();
    const anchor = (props.workStyle.styleAnchor ?? "").trim();
    const t = draft.trim();
    if (!embModel || anchor.length < 24 || t.length < 24) {
      setToneEmbedHint(null);
      setToneEmbedErr(null);
      setToneEmbedBusy(false);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setToneEmbedBusy(true);
    setToneEmbedErr(null);
    void (async () => {
      try {
        const aText = anchor.slice(0, 2400);
        const bText = t.slice(0, 2400);
        const cachedA = readEmbeddingCache(provider, embModel, aText);
        const cachedB = readEmbeddingCache(provider, embModel, bText);
        const a =
          cachedA ??
          (await embedWithProvider({ provider, config: providerCfg, input: aText, signal: ac.signal })).embedding;
        const b =
          cachedB ??
          (await embedWithProvider({ provider, config: providerCfg, input: bText, signal: ac.signal })).embedding;
        if (!cachedA) writeEmbeddingCache(provider, embModel, aText, a);
        if (!cachedB) writeEmbeddingCache(provider, embModel, bText, b);
        const dist = cosineDistance(a, b);
        if (dist == null) throw new Error("embedding 距离计算失败");

        // 经验阈值：>0.22 认为差异明显；>0.30 强提示。仅提示不阻断。
        const line =
          dist >= 0.3
            ? `标杆段距离偏大（cos 距离≈${dist.toFixed(2)}），草稿调性可能明显偏离文风锚点。`
            : dist >= 0.22
              ? `标杆段距离略大（cos 距离≈${dist.toFixed(2)}），建议对照文风锚点检查节奏/用词。`
              : null;
        if (cancelled) return;
        setToneEmbedHint(line);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "embedding 计算失败";
        setToneEmbedErr(msg);
        setToneEmbedHint(null);
      } finally {
        if (!cancelled) setToneEmbedBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 该 effect 仅关心调性提示相关输入
  }, [settings.toneDriftHintEnabled, cloudAllowed, providerCfg, props.workStyle.styleAnchor, draft]);

  const sessionBudget = settings.aiSessionApproxTokenBudget;

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

  const neighborSummaryPoolChapters = useMemo(() => {
    if (!props.chapter) return [];
    const n = Math.max(0, Math.min(12, recentN));
    if (n <= 0) return [];
    const curOrder = props.chapter.order;
    return [...props.chapters]
      .filter((c) => c.order < curOrder)
      .sort((a, b) => b.order - a.order)
      .slice(0, n)
      .reverse()
      .filter((c) => (c.summary ?? "").trim());
  }, [props.chapter, props.chapters, recentN]);

  const neighborSummaryPoolCount = neighborSummaryPoolChapters.length;
  const neighborSummaryIncludedCount = useMemo(
    () => neighborSummaryPoolChapters.filter((c) => neighborSummaryIncludeById[c.id] !== false).length,
    [neighborSummaryPoolChapters, neighborSummaryIncludeById],
  );

  const recentSummaryText = useMemo(() => {
    if (!props.chapter) return "";
    if (!includeRecentSummaries) return "";
    if (neighborSummaryPoolChapters.length === 0) return "";
    const lines: string[] = [];
    for (const c of neighborSummaryPoolChapters) {
      if (neighborSummaryIncludeById[c.id] === false) continue;
      const s = (c.summary ?? "").trim();
      if (!s) continue;
      lines.push(`## ${c.title}`, s, "");
    }
    return lines.join("\n");
  }, [props.chapter, includeRecentSummaries, neighborSummaryPoolChapters, neighborSummaryIncludeById]);

  const linkedChapters = useMemo(() => {
    void linkedChaptersTick;
    if (!props.workId || !props.chapter) return null;
    return loadLinkedChapters(props.workId, props.chapter.id);
  }, [props.workId, props.chapter?.id, linkedChaptersTick]);

  const linkedChapterSummaryText = useMemo(() => {
    if (!props.chapter || !linkedChapters) return "";
    const ids = new Set(linkedChapters.summaryChapterIds);
    const curId = props.chapter.id;
    const picked = props.chapters
      .filter((c) => c.id !== curId && ids.has(c.id) && (c.summary ?? "").trim())
      .sort((a, b) => b.order - a.order);
    return picked.map((c) => `【#${c.order}｜${c.title}】\n${(c.summary ?? "").trim()}`).join("\n\n---\n\n");
  }, [props.chapter, props.chapters, linkedChapters]);

  const linkedChapterFullText = useMemo(() => {
    if (!props.chapter || !linkedChapters) return "";
    const ids = new Set(linkedChapters.fullChapterIds);
    const curId = props.chapter.id;
    const picked = props.chapters.filter((c) => c.id !== curId && ids.has(c.id) && (c.content ?? "").trim());
    picked.sort((a, b) => b.updatedAt - a.updatedAt);
    return picked
      .map((c) => `【#${c.order}｜${c.title}】\n${(c.content ?? "").trim()}`)
      .join("\n\n---\n\n");
  }, [props.chapter, props.chapters, linkedChapters]);

  const skillPresetText = useMemo(() => {
    if (skillPreset === "tight") return "写作技巧：更紧凑、减少解释性文字，多用具体动作与感官细节；避免空泛形容。";
    if (skillPreset === "dialogue") return "写作技巧：增加对话推动；对话要带信息差与情绪张力；避免无意义寒暄。";
    if (skillPreset === "describe") return "写作技巧：加强场景画面与氛围（光影/声音/气味/触感），并与人物动机联动。";
    if (skillPreset === "custom") return skillText.trim();
    return "";
  }, [skillPreset, skillText]);

  /** 与 `buildWritingSidepanelMessages` 同源字段；材料预览与真实请求一致（步 9 / 15） */
  const tagProfileText = useMemo(() => workTagsToProfileText(props.work.tags), [props.work.tags]);
  const tagCount = useMemo(() => normalizeWorkTagList(props.work.tags)?.length ?? 0, [props.work.tags]);

  const glossarySlices = useMemo((): WritingGlossaryTermSlice[] => {
    return props.glossaryTerms.map((g) => ({
      term: g.term,
      category: g.category,
      note: g.note ?? "",
    }));
  }, [props.glossaryTerms]);

  const studyCharacterCardSlices = useMemo((): WritingStudyCharacterCardSlice[] => {
    if (studyCharacterSource !== "cards") return [];
    const byId = new Map(props.bibleCharacters.map((c) => [c.id, c]));
    const out: WritingStudyCharacterCardSlice[] = [];
    for (const id of studyPickedCharacterIds) {
      const c = byId.get(id);
      if (!c) continue;
      if (!(c.name ?? "").trim()) continue;
      out.push({
        name: c.name,
        motivation: c.motivation ?? "",
        relationships: c.relationships ?? "",
        voiceNotes: c.voiceNotes ?? "",
        taboos: c.taboos ?? "",
      });
    }
    return out;
  }, [props.bibleCharacters, studyCharacterSource, studyPickedCharacterIds]);

  const studyGlossarySlices = useMemo((): WritingGlossaryTermSlice[] => {
    const byId = new Map(props.glossaryTerms.map((g) => [g.id, g]));
    const out: WritingGlossaryTermSlice[] = [];
    for (const id of studyPickedGlossaryIds) {
      const g = byId.get(id);
      if (!g) continue;
      if (!(g.term ?? "").trim()) continue;
      out.push({ term: g.term, category: g.category, note: g.note ?? "" });
    }
    return out;
  }, [props.glossaryTerms, studyPickedGlossaryIds]);

  const glossaryTermCountForSummary = useMemo(
    () => studyGlossarySlices.filter((g) => (g.term ?? "").trim()).length,
    [studyGlossarySlices],
  );

  const styleSampleCountForSummary = useMemo(
    () => props.styleSampleSlices.filter((s) => (s.body ?? "").trim()).length,
    [props.styleSampleSlices],
  );

  const sidepanelAssembleInput = useMemo((): WritingSidepanelAssembleInput | null => {
    if (!props.chapter) return null;
    return {
      workStyle: props.workStyle,
      tagProfileText,
      workTitle: props.work.title,
      chapterTitle: props.chapter.title,
      storyBackground,
      characters,
      relations,
      chapterBible: props.chapterBible,
      skillPresetText,
      includeLinkedExcerpts,
      linkedExcerpts: props.linkedExcerptsForChapter.map((e) => ({ refTitle: e.refTitle, text: e.text })),
      maxContextChars: settings.maxContextChars,
      isCloudProvider,
      privacy: settings.privacy,
      includeBible: settings.includeBible,
      bibleMarkdown:
        settings.includeBible && biblePreview?.text
          ? filterWorkBibleMarkdownBySections(biblePreview.text, workBibleSectionMask)
          : "",
      chapterBibleInjectMask,
      workBibleSectionMask,
      neighborSummaryIncludedCount,
      recentSummaryText,
      includeRecentSummaries,
      linkedChapterSummaryText,
      linkedChapterFullText,
      linkedChapterSummaryCount: linkedChapters?.summaryChapterIds.length ?? 0,
      linkedChapterFullCount: linkedChapters?.fullChapterIds.length ?? 0,
      ragEnabled,
      ragQuery,
      ragK,
      ragHits: ragHits.filter((h) => !ragExcluded.has(h.chunkId)),
      ragSources: ragWorkSources,
      chapterContent: props.chapterContent,
      chapterSummary: props.chapter.summary,
      selectedText,
      currentContextMode,
      userHint: composedUserHint,
      mode: props.writingSkillMode,
      recentN,
      chapterOutlinePaste,
      styleSamples: props.styleSampleSlices,
      glossaryTerms: glossarySlices,
      chapterStudyCharacterCards: studyCharacterCardSlices,
      chapterStudyNpcNotes: studyCharacterSource === "npc" ? studyNpcText : "",
      studyGlossaryMode: "chapter_pick",
      chapterStudyGlossaryTerms: studyGlossarySlices,
    };
  }, [
    props.chapter,
    props.work.title,
    props.chapter?.title,
    props.bibleCharacters,
    props.glossaryTerms,
    props.workWritingVars,
    props.workRagInjectDefaults,
    props.chapterBible,
    skillPresetText,
    props.linkedExcerptsForChapter,
    settings.maxContextChars,
    settings.privacy,
    settings.includeBible,
    isCloudProvider,
    biblePreview?.text,
    neighborSummaryIncludedCount,
    recentSummaryText,
    linkedChapterSummaryText,
    linkedChapterFullText,
    linkedChapters?.summaryChapterIds.length,
    linkedChapters?.fullChapterIds.length,
    ragQuery,
    ragHits,
    ragExcluded,
    props.chapterContent,
    props.chapter?.summary,
    selectedText,
    composedUserHint,
    props.writingSkillMode,
    props.workStyle,
    tagProfileText,
    props.styleSampleSlices,
    glossarySlices,
    chapterOutlinePaste,
    studyCharacterCardSlices,
    studyCharacterSource,
    studyGlossarySlices,
    studyNpcText,
  ]);

  const injectBlocks = useMemo(() => {
    if (!sidepanelAssembleInput) return [];
    return buildWritingSidepanelInjectBlocks(sidepanelAssembleInput, {
      bibleRawLength: biblePreview?.text?.trim() ? biblePreview.chars : undefined,
    });
  }, [sidepanelAssembleInput, biblePreview?.text, biblePreview?.chars]);

  const approxInjectChars = useMemo(() => injectBlocks.reduce((s, b) => s + (b.chars ?? 0), 0), [injectBlocks]);

  const approxInjectTokens = useMemo(() => {
    // Bible size is unknown until fetched; we keep it as a small constant signal.
    const s = settings.includeBible ? `${approxInjectChars}\n[BIBLE]` : String(approxInjectChars);
    return approxRoughTokenCount(s);
  }, [approxInjectChars, settings.includeBible]);

  /** 可解释性简版（步 15）：与装配器字段对齐，见 `buildWritingSidepanelMaterialsSummaryLines` */
  const materialsSummaryLines = useMemo(() => {
    if (!props.chapter) return ["未选择章节时不会组装请求。"];
    return buildWritingSidepanelMaterialsSummaryLines({
      workTitle: props.work.title,
      chapterTitle: props.chapter.title,
      providerLabel: PROVIDER_UI[settings.provider]?.label ?? settings.provider,
      modelId: providerCfg.model ?? "",
      workStyle: props.workStyle,
      chapterBible: props.chapterBible,
      includeBible: settings.includeBible,
      isCloudProvider,
      privacy: settings.privacy,
      includeLinkedExcerpts,
      linkedExcerptCount: props.linkedExcerptsForChapter.length,
      includeRecentSummaries,
      recentN,
      currentContextMode,
      skillMode: props.writingSkillMode,
      ragEnabled,
      ragQuery,
      ragK,
      ragSources: ragWorkSources,
      tagProfileText,
      tagCount,
      styleSampleCount: styleSampleCountForSummary,
      glossaryTermCount: glossaryTermCountForSummary,
      studyCharacterCardCount: studyCharacterCardSlices.length,
      studyCharacterSource,
      studyNpcNoteChars: studyNpcText.trim().length,
      studyGlossaryMode: "chapter_pick",
      studyGlossaryPickCount: studyGlossarySlices.filter((g) => (g.term ?? "").trim()).length,
      neighborSummaryPoolCount,
      neighborSummaryIncludedCount,
      chapterBibleInjectMask,
      workBibleSectionMask,
      approxInjectChars,
      approxInjectTokens,
    });
  }, [
    props.chapter,
    props.work.title,
    props.chapter?.title,
    props.chapterBible,
    props.workStyle,
    settings.provider,
    settings.includeBible,
    settings.privacy,
    providerCfg.model,
    includeLinkedExcerpts,
    props.linkedExcerptsForChapter.length,
    includeRecentSummaries,
    recentN,
    currentContextMode,
    props.writingSkillMode,
    ragEnabled,
    ragQuery,
    ragK,
    ragWorkSources,
    isCloudProvider,
    approxInjectChars,
    approxInjectTokens,
    tagProfileText,
    tagCount,
    styleSampleCountForSummary,
    glossaryTermCountForSummary,
    studyCharacterCardSlices.length,
    studyCharacterSource,
    studyGlossarySlices,
    studyNpcText,
    neighborSummaryPoolCount,
    neighborSummaryIncludedCount,
    chapterBibleInjectMask,
    workBibleSectionMask,
  ]);

  useEffect(() => {
    props.onMaterialsSummaryLinesChange?.(materialsSummaryLines);
  }, [materialsSummaryLines, props.onMaterialsSummaryLinesChange]);

  function updateSettings(patch: Partial<AiSettings>) {
    const next: AiSettings = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
  }

  function updateProvider(p: AiProviderId) {
    updateSettings({ provider: p });
  }

  async function run(
    input?: { provider: AiProviderId; providerCfg: AiProviderConfig; messages: AiChatMessage[] },
    opts?: { mode?: WritingSkillMode; fromDegrade?: boolean },
  ) {
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
    setDraftMeta(null);
    setDraftMetaOpen(false);
    setShowDegradeRetry(false);
    if (!opts?.fromDegrade) degradeAttemptedRef.current = false;
    const modeForAssemble: WritingSkillMode = opts?.mode ?? props.writingSkillMode;
    try {
      if (!input && modeForAssemble === "draw") {
        const v = validateDrawCardRequest({
          chapterContent: props.chapterContent ?? "",
          chapterSummary: props.chapter?.summary,
          isCloudProvider,
          privacy: settings.privacy,
        });
        if (!v.ok) {
          setError(v.message);
          return;
        }
      }
      let messages: AiChatMessage[];
      let usedProvider: AiProviderId;
      let usedProviderCfg: AiProviderConfig;
      if (input) {
        messages = input.messages;
        usedProvider = input.provider;
        usedProviderCfg = input.providerCfg;
      } else {
        const ov = runContextOverridesRef.current;
        runContextOverridesRef.current = null;

        const effMax = ov?.maxContextChars ?? settings.maxContextChars;
        const effIncludeBible =
          ov?.includeBible !== undefined ? ov.includeBible : settings.includeBible;
        const effRag = ov?.ragEnabled !== undefined ? ov.ragEnabled : ragEnabled;
        const effRecent =
          ov?.includeRecentSummaries !== undefined ? ov.includeRecentSummaries : includeRecentSummaries;
        const effLinked =
          ov?.includeLinkedExcerpts !== undefined ? ov.includeLinkedExcerpts : includeLinkedExcerpts;
        const effCtxMode = ov?.currentContextMode ?? currentContextMode;

        const qRag = ragQuery.trim();
        const needBibleForRagChunks =
          effRag &&
          !!qRag &&
          ragWorkSources.workBibleExport &&
          (!isCloudProvider || settings.privacy.allowRagSnippets);

        let bibleRaw = "";
        const needBibleFull = effIncludeBible && (!isCloudProvider || settings.privacy.allowBible);
        if (needBibleFull || needBibleForRagChunks) {
          if (needBibleFull) {
            try {
              setBibleLoading(true);
              bibleRaw = await exportBibleMarkdown(props.workId);
              setBiblePreview({ text: bibleRaw, chars: bibleRaw.length });
            } finally {
              setBibleLoading(false);
            }
          } else {
            bibleRaw = await exportBibleMarkdown(props.workId);
          }
        }
        const bibleForPrompt =
          effIncludeBible && bibleRaw.trim()
            ? filterWorkBibleMarkdownBySections(bibleRaw, workBibleSectionMask)
            : "";

        let ragHitsForRequest: ReferenceSearchHit[] = effRag ? ragHits.filter((h) => !ragExcluded.has(h.chunkId)) : [];
        if (effRag && (!isCloudProvider || settings.privacy.allowRagSnippets) && qRag) {
          try {
            setRagLoading(true);
            const hits = await searchWritingRagMerged({
              workId: props.workId,
              query: qRag,
              limit: Math.max(1, Math.min(20, ragK)),
              sources: ragWorkSources,
              chapters: props.chapters,
              progressCursorChapterId: props.work.progressCursor,
              excludeManuscriptChapterId: props.chapter?.id ?? null,
              bibleMarkdownOverride: bibleRaw.trim() ? bibleRaw : undefined,
            });
            setRagHits(hits);
            ragHitsForRequest = hits.filter((h) => !ragExcluded.has(h.chunkId));
          } finally {
            setRagLoading(false);
          }
        }

        const recentForAssemble = effRecent ? recentSummaryText : "";
        const linkedForAssemble = effLinked
          ? props.linkedExcerptsForChapter.map((e) => ({ refTitle: e.refTitle, text: e.text }))
          : [];
        const linkedChapterSummariesForAssemble = linkedChapterSummaryText;
        const linkedChapterFullForAssemble = linkedChapterFullText;

        const assembleInput: WritingSidepanelAssembleInput = {
          workStyle: props.workStyle,
          tagProfileText,
          workTitle: props.work.title,
          chapterTitle: props.chapter.title,
          storyBackground,
          characters,
          relations,
          chapterBible: props.chapterBible,
          chapterBibleInjectMask,
          workBibleSectionMask,
          skillPresetText,
          includeLinkedExcerpts: effLinked,
          linkedExcerpts: linkedForAssemble,
          maxContextChars: effMax,
          isCloudProvider,
          privacy: settings.privacy,
          includeBible: effIncludeBible,
          bibleMarkdown: bibleForPrompt,
          recentSummaryText: recentForAssemble,
          includeRecentSummaries: effRecent,
          linkedChapterSummaryText: linkedChapterSummariesForAssemble,
          linkedChapterFullText: linkedChapterFullForAssemble,
          linkedChapterSummaryCount: linkedChapters?.summaryChapterIds.length ?? 0,
          linkedChapterFullCount: linkedChapters?.fullChapterIds.length ?? 0,
          neighborSummaryIncludedCount,
          ragEnabled: effRag,
          ragQuery,
          ragK,
          ragHits: ragHitsForRequest,
          ragSources: ragWorkSources,
          chapterContent: props.chapterContent,
          chapterSummary: props.chapter.summary,
          selectedText,
          currentContextMode: effCtxMode,
          userHint: composedUserHint,
          mode: modeForAssemble,
          recentN,
          chapterOutlinePaste,
          styleSamples: props.styleSampleSlices,
          glossaryTerms: glossarySlices,
          chapterStudyCharacterCards: studyCharacterCardSlices,
          chapterStudyNpcNotes: studyCharacterSource === "npc" ? studyNpcText : "",
          studyGlossaryMode: "chapter_pick",
          chapterStudyGlossaryTerms: studyGlossarySlices,
        };
        messages = buildWritingSidepanelMessages(assembleInput);
        usedProvider = settings.provider;
        usedProviderCfg = providerCfg;

        const willSendBibleToCloud =
          effIncludeBible &&
          isCloudProvider &&
          settings.privacy.allowBible &&
          bibleForPrompt.trim().length > 0;
        const injPrompt = resolveInjectionConfirmPrompt({
          messages,
          settings,
          willSendBibleToCloud,
        });
        if (injPrompt.shouldPrompt) {
          const ok = await new Promise<boolean>((resolve) => {
            setCostGatePending({
              reasons: injPrompt.reasons,
              tokensApprox: injPrompt.tokensApprox,
              dailyUsed: readTodayApproxTokens(),
              dailyBudget: settings.dailyTokenBudget,
              triggerLabel: "注入量确认",
              resolve,
            });
          });
          if (!ok) return;
        }
      }

      const sessionBudgetCap = settings.aiSessionApproxTokenBudget;
      const requestTokApprox = messages.reduce((sum, m) => sum + approxRoughTokenCount(m.content), 0);

      // P1-04：单次调用预警（singleCallWarnTokens）—— 低于 injectConfirmOnOversizeTokens 才生效
      if (settings.singleCallWarnTokens > 0 && requestTokApprox >= settings.singleCallWarnTokens) {
        const ok = await new Promise<boolean>((resolve) => {
          setCostGatePending({
            reasons: [`本次请求粗估约 ${requestTokApprox.toLocaleString()} tokens，已超过单次预警阈值 ${settings.singleCallWarnTokens.toLocaleString()}。`],
            tokensApprox: requestTokApprox,
            dailyUsed: readTodayApproxTokens(),
            dailyBudget: settings.dailyTokenBudget,
            triggerLabel: "单次调用预警",
            resolve,
          });
        });
        if (!ok) return;
      }

      // P1-04：日预算超出预警
      if (settings.dailyTokenBudget > 0) {
        const todayUsed = readTodayApproxTokens();
        if (todayUsed + requestTokApprox > settings.dailyTokenBudget) {
          const ok = await new Promise<boolean>((resolve) => {
            setCostGatePending({
              reasons: [`今日累计（${todayUsed.toLocaleString()} tokens）加本次（约 ${requestTokApprox.toLocaleString()} tokens）将超过日预算 ${settings.dailyTokenBudget.toLocaleString()} tokens。`],
              tokensApprox: requestTokApprox,
              dailyUsed: todayUsed,
              dailyBudget: settings.dailyTokenBudget,
              triggerLabel: "日预算预警",
              resolve,
            });
          });
          if (!ok) return;
        }
      }

      if (sessionBudgetCap > 0) {
        const used = readSessionApproxTokens();
        if (used + requestTokApprox > sessionBudgetCap) {
          setError(
            `本会话累计粗估约 ${used.toLocaleString()} tokens，本次请求约 ${requestTokApprox.toLocaleString()}，将超过上限 ${sessionBudgetCap.toLocaleString()}。可在「后端模型配置 → 默认与上下文」调高上限或设为 0；也可点草稿区「清零本会话累计」。`,
          );
          return;
        }
      }

      lastReqRef.current = { provider: usedProvider, providerCfg: usedProviderCfg, messages };
      const r = await generateWithProviderStream({
        provider: usedProvider,
        config: usedProviderCfg,
        messages,
        signal: ac.signal,
        onDelta: (d) => setDraft((prev) => prev + d),
        temperature: !isLocalAiProvider(usedProvider) ? getProviderTemperature(settings, usedProvider) : undefined,
      });
      if (!draft.trim() && (r.text ?? "").trim()) {
        setDraft((r.text ?? "").trim());
      }
      const outTok = approxRoughTokenCount((r.text ?? "").trim());
      addSessionApproxTokens(requestTokApprox + Math.max(0, outTok));
      addTodayApproxTokens(requestTokApprox + Math.max(0, outTok));
      setDraftMeta({
        provider: usedProvider,
        mode: modeForAssemble,
        roughTokens: requestTokApprox + Math.max(0, outTok),
        generatedAt: Date.now(),
      });
      if (props.workId && props.chapter && (r.text ?? "").trim()) {
        pushDraftHistory(props.workId, props.chapter.id, (r.text ?? "").trim());
        setDraftHistory(readDraftHistory(props.workId, props.chapter.id));
      }
      setSessionBudgetUiTick((x) => x + 1);
      setDailyUsageTick((x) => x + 1);
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) return;
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      if (!aborted) {
        const msg = e instanceof Error ? e.message : "AI 调用失败";
        setError(msg);
        if (errorSuggestsContextDegrade(msg) && !degradeAttemptedRef.current) {
          setShowDegradeRetry(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function runWithDegrade() {
    degradeAttemptedRef.current = true;
    runContextOverridesRef.current = buildContextDegradeOverrides({
      maxContextChars: settings.maxContextChars,
      currentContextMode,
      hasChapterSummary: !!(props.chapter?.summary ?? "").trim(),
    });
    void run(undefined, { fromDegrade: true });
  }

  function confirmDraftMerge(p: AiDraftMergePayload) {
    if (p.kind === "insert") props.insertAtCursor(p.payload);
    else if (p.kind === "append") props.appendToEnd(p.payload);
    else props.replaceSelection(p.after);
    setMergePayload(null);
  }

  const runRef = useRef(run);
  runRef.current = run;
  /** 防 StrictMode / 重挂载对同一 tick 重复 run；与父级 `lastContinueConsumedTick` 配合 */
  const continueLocalStartedRef = useRef(0);
  useEffect(() => {
    const t = props.continueRunTick ?? 0;
    const consumed = props.lastContinueConsumedTick ?? 0;
    if (t === 0 || t === consumed || t === continueLocalStartedRef.current) return;
    continueLocalStartedRef.current = t;
    props.onContinueRunConsumed?.(t);
    props.onWritingSkillModeChange("continue");
    void runRef.current(undefined, { mode: "continue" });
  }, [props.continueRunTick, props.lastContinueConsumedTick, props.onContinueRunConsumed]);

  const drawLocalStartedRef = useRef(0);
  useEffect(() => {
    const t = props.drawRunTick ?? 0;
    const consumed = props.lastDrawConsumedTick ?? 0;
    if (t === 0 || t === consumed || t === drawLocalStartedRef.current) return;
    drawLocalStartedRef.current = t;
    props.onDrawRunConsumed?.(t);
    props.onWritingSkillModeChange("draw");
    void runRef.current(undefined, { mode: "draw" });
  }, [props.drawRunTick, props.lastDrawConsumedTick, props.onDrawRunConsumed]);

  return (
    <aside className="ai-panel" aria-label="AI 面板">
      {props.hideHeader ? null : (
        <div className="ai-panel-head">
          <strong>AI</strong>
          <button type="button" className="icon-btn" title="关闭" onClick={props.onClose}>
            ×
          </button>
        </div>
      )}

      <div className="ai-panel-body-stack">
        <section className="ai-panel-section ai-panel-section--flat" aria-label="AI 模型选择">
          <div className="flex items-center justify-between gap-2 px-0.5 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70 tracking-wider">
              <Bot className="h-3 w-3" />
              AI模型
            </span>
            <button
              type="button"
              onClick={() => setProviderPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.98]"
            >
              {(() => {
                const logoSrc = providerLogoImgSrc(settings.provider);
                return (
                  <span className="flex items-center gap-1.5">
                    {logoSrc ? (
                      <img src={logoSrc} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
                    ) : null}
                    <span className="font-semibold text-foreground">
                      {PROVIDER_UI[settings.provider]?.label ?? settings.provider}
                    </span>
                  </span>
                );
              })()}
            </button>
          </div>
        </section>

        {props.chapter ? (
          <AiPanelStudyChapterSection
            characters={props.bibleCharacters}
            glossaryTerms={props.glossaryTerms}
            characterSource={studyCharacterSource}
            onCharacterSourceChange={setStudyCharacterSource}
            npcText={studyNpcText}
            onNpcTextChange={setStudyNpcText}
            pickedCharacterIds={studyPickedCharacterIds}
            onPickedCharacterIdsChange={setStudyPickedCharacterIds}
            pickedGlossaryIds={studyPickedGlossaryIds}
            onPickedGlossaryIdsChange={setStudyPickedGlossaryIds}
          />
        ) : null}

      <Dialog open={providerPickerOpen} onOpenChange={setProviderPickerOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="work-form-modal-overlay"
          aria-describedby={undefined}
          className={cn(
            "model-picker-dialog z-[var(--z-modal-app-content)] max-h-[min(92vh,880px)] w-full max-w-[min(880px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg sm:max-w-[min(880px,calc(100vw-2rem))]",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
            <DialogTitle className="text-left text-lg font-semibold">选择模型</DialogTitle>
            <button type="button" className="icon-btn" title="关闭" onClick={() => setProviderPickerOpen(false)}>
              ×
            </button>
          </div>

          <div className="model-picker model-picker--dialog">
            <div className="model-picker-body">
              <div className="model-picker-left" role="tablist" aria-label="模型列表">
                {(
                  [
                    "openai",
                    "anthropic",
                    "gemini",
                    "doubao",
                    "zhipu",
                    "kimi",
                    "xiaomi",
                    "ollama",
                    "mlx",
                  ] as AiProviderId[]
                ).map((id) => {
                  const ui = PROVIDER_UI[id];
                  const isCloud = !isLocalAiProvider(id);
                  const disabled = isCloud && !(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
                  const active = pickerActive === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      data-provider={id}
                      aria-selected={active}
                      className={
                        "model-picker-item" +
                        (active ? " is-active" : "") +
                        (disabled ? " is-disabled" : "")
                      }
                      title={
                        disabled
                          ? `${ui.tip}（云端未开启：可查看介绍，确认使用请点右下角「使用」）`
                          : ui.tip
                      }
                      onClick={() => setPickerActive(id)}
                    >
                      <AiProviderLogo provider={id} />
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
                const isCloud = !isLocalAiProvider(pickerActive);
                const disabled = isCloud && !(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
                return (
                  <div className="model-picker-right" role="tabpanel" aria-label="模型介绍" data-provider={pickerActive}>
                    <div className="model-picker-right-scroll">
                      <div className="model-picker-right-head">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <AiProviderLogo provider={pickerActive} />
                          <div>
                            <div style={{ fontWeight: 900, fontSize: 18 }}>{ui.label}</div>
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
                            !isLocalAiProvider(pickerActive)
                              ? geminiCostStarsFromShensi(getProviderTemperature(settings, pickerActive))
                              : ui.meters.cost
                            }
                          />
                          {isLocalAiProvider(pickerActive) && ui.meters.costText ? (
                            <span className="muted small" style={{ marginLeft: 8 }}>
                              （{ui.meters.costText}）
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {(() => {
                        const cfg = getProviderConfig(settings, pickerActive);
                        const personas = listModelPersonas(pickerActive).filter((p) => p.modelId);
                        if (personas.length === 0) return null;
                        return (
                          <div className="model-persona">
                            <div style={{ fontWeight: 800, margin: "14px 0 8px" }}>推荐模型</div>
                            <div className="model-persona-grid" role="list" aria-label="推荐模型列表">
                              {personas.map((p) => {
                                const on = (cfg.model ?? "").trim() === p.modelId;
                                const stars = p.costStars ?? ui.meters.cost;
                                return (
                                  <button
                                    key={p.modelId}
                                    type="button"
                                    role="listitem"
                                    className={"model-persona-card" + (on ? " is-on" : "")}
                                    title={p.modelId}
                                    onClick={() => {
                                      const cur = getProviderConfig(settings, pickerActive);
                                      updateSettings({ [pickerActive]: { ...cur, model: p.modelId } } as Partial<AiSettings>);
                                    }}
                                  >
                                    <div className="model-persona-card-head">
                                      <div className="model-persona-card-title">{p.title}</div>
                                      <div className="model-persona-card-badges">
                                        {p.tags?.slice(0, 2).map((t) => (
                                          <span key={t} className="model-persona-badge muted small">
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="muted small">{p.subtitle}</div>
                                    <div className="model-persona-card-desc muted small">{p.description}</div>
                                    <div className="model-persona-card-foot muted small">
                                      <span className="model-persona-modelid">{p.modelId}</span>
                                      <span className="model-persona-cost">
                                        {Array.from({ length: stars }).fill("★").join("")}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {pickerActive === "doubao" ? (
                              <p className="muted small" style={{ marginTop: 10, lineHeight: 1.55 }}>
                                当前展示：<strong>{doubaoModelDisplayLabel(getProviderConfig(settings, "doubao"))}</strong>
                                {(getProviderConfig(settings, "doubao").modelDisplayName ?? "").trim() ? (
                                  <>
                                    <br />
                                    <span style={{ opacity: 0.88 }}>
                                      实际 endpoint：
                                      <code style={{ fontSize: "0.85em" }}>
                                        {(getProviderConfig(settings, "doubao").model ?? "").trim()}
                                      </code>
                                    </span>
                                  </>
                                ) : null}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}

                      <div className="model-picker-note">
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>注意事项</div>
                        <div className="muted small" style={{ lineHeight: 1.65 }}>
                          {ui.note}
                        </div>
                      </div>
                    </div>

                    <div className="model-picker-tune model-picker-tune--dock">
                      <div
                        className="model-picker-tune-dock"
                        role="toolbar"
                        aria-label={
                          pickerActive === "gemini"
                            ? "观云调参"
                            : isLocalAiProvider(pickerActive)
                              ? "本地模型"
                              : "云端调参"
                        }
                      >
                        {(() => {
                          if (isLocalAiProvider(pickerActive)) return null;
                          const personasAll = listModelPersonas(pickerActive).filter((p) => (p.modelId ?? "").trim());
                          const gearPersonas = personasAll;
                          if (gearPersonas.length < 2) return null;

                          const activeModelId = (getProviderConfig(settings, pickerActive).model ?? "").trim();
                          const idx = Math.max(
                            0,
                            Math.min(
                              gearPersonas.length - 1,
                              Math.max(
                                0,
                                gearPersonas.findIndex((p) => (p.modelId ?? "").trim() === activeModelId),
                              ),
                            ),
                          );
                          const pct = gearPersonas.length <= 1 ? 0 : (idx / (gearPersonas.length - 1)) * 100;
                          const invPct = 100 - pct;
                          const tubeBg = `linear-gradient(to top,
                            rgba(0,0,0,0.78) 0%,
                            rgba(0,0,0,0.78) ${pct}%,
                            rgba(0,0,0,0.12) ${pct}%,
                            rgba(0,0,0,0.12) 100%)`;
                          const label = gearPersonas[idx]?.title ?? "档位";

                          return (
                            <div className="model-picker-dock-anchor">
                              {modelPickerTune === "gear" ? (
                                <div className="model-picker-mini-pop model-picker-mini-pop--gear" role="dialog" aria-label="模型档位">
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
                                        max={gearPersonas.length - 1}
                                        step={1}
                                        value={idx}
                                        onChange={(e) => {
                                          const i = Math.max(0, Math.min(gearPersonas.length - 1, Number(e.target.value) || 0));
                                          const m = (gearPersonas[i]?.modelId ?? "").trim();
                                          if (!m) return;
                                          const cur = getProviderConfig(settings, pickerActive);
                                          updateSettings({ [pickerActive]: { ...cur, model: m } } as Partial<AiSettings>);
                                        }}
                                      />
                                    </div>
                                  </div>
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
                          );
                        })()}

                        {!isLocalAiProvider(pickerActive) ? (
                          <div className="model-picker-dock-anchor">
                            {modelPickerTune === "shensi" ? (
                              <div className="model-picker-mini-pop model-picker-mini-pop--shensi" role="dialog" aria-label="深思">
                                {(() => {
                                  const t = getProviderTemperature(settings, pickerActive);
                                  const pct = Math.max(0, Math.min(100, ((t - 0.1) / 1.9) * 100));
                                  const invPct = 100 - pct;
                                  return (
                                    <div className="model-picker-shensi-pop">
                                      <div className="model-picker-shensi-col">
                                        <div className="temp-wrap model-picker-shensi-body temp-pop-thermo">
                                          <div className="temp-float temp-float--mini muted small" style={{ top: `${invPct}%` }}>
                                            {tempSides(t).center}
                                          </div>
                                          <div className="temp-vert temp-vert--mini" aria-label="Temperature">
                                            <div
                                              className="temp-tube temp-tube--fill"
                                              aria-hidden="true"
                                              style={{ ["--fill" as never]: `${pct}%` }}
                                            />
                                            <input
                                              className="temp-slider temp-slider--vert"
                                              type="range"
                                              min={0.1}
                                              max={2.0}
                                              step={0.1}
                                              value={t}
                                              onChange={(e) => {
                                                const v = Math.max(0.1, Math.min(2.0, Number(e.target.value) || 1.2));
                                                updateSettings(patchProviderTemperature(settings, pickerActive, v));
                                              }}
                                            />
                                          </div>
                                        </div>
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
                              深思
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
                              void navigate("/settings#ai-privacy");
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
        </DialogContent>
      </Dialog>
      </div>

      <AiPanelWritingPromptsRow
        selectedStyleTemplateId={selectedStyleTemplateId}
        selectedReqTemplateId={selectedReqTemplateId}
        styleTemplateTitle={styleTemplateTitle}
        reqTemplateTitle={reqTemplateTitle}
        onStyleTemplatePick={onStyleTemplatePick}
        onReqTemplatePick={onReqTemplatePick}
        styleMode={styleMode}
        onStyleModeChange={setStyleMode}
        styleCustomText={styleCustomText}
        onStyleCustomTextChange={setStyleCustomText}
        reqMode={reqMode}
        onReqModeChange={setReqMode}
        reqCustomText={reqCustomText}
        onReqCustomTextChange={setReqCustomText}
      />

      <label className="ai-panel-field">
        <span className="small muted">本章细纲 / 剧情（手动粘贴）</span>
        <textarea
          name="chapterOutlinePaste"
          value={chapterOutlinePaste}
          onChange={(e) => {
            const v = e.target.value;
            setChapterOutlinePaste(v);
            if (!props.chapter) return;
            saveChapterOutlinePaste(props.workId, props.chapter.id, v);
          }}
          rows={6}
          placeholder="粘贴细纲/剧情节拍（用于生成正文的主依据）。例如：\n- 场景目标：...\n- 节拍：A→B→转折→钩子\n- 必出现信息：...\n"
        />
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
        <button
          type="button"
          className="btn"
          title="打开草稿弹窗"
          onClick={() => setDraftDialogOpen(true)}
        >
          草稿
        </button>
      </div>
      {error ? <AiInlineErrorNotice message={error} /> : null}
      {showDegradeRetry ? (
        <div className="rr-block" style={{ marginTop: 8 }}>
          <button type="button" className="btn" disabled={busy} onClick={() => runWithDegrade()}>
            精简并重试
          </button>
          <span className="muted small" style={{ marginLeft: 8 }}>
            减半字数上限，并暂时关闭全书锦囊、RAG、邻章概要、关联摘录；全文且本章有概要时改为概要模式。
          </span>
        </div>
      ) : null}

      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent
          overlayClassName="work-form-modal-overlay"
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn(
            "z-[var(--z-modal-app-content)] max-h-[min(92vh,920px)] w-full max-w-[min(980px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
            <DialogTitle className="text-left text-lg font-semibold">AI 草稿</DialogTitle>
            <button type="button" className="icon-btn" title="关闭" onClick={() => setDraftDialogOpen(false)}>
              ×
            </button>
          </div>
          <div className="p-4 sm:p-5" style={{ overflow: "auto" }}>
            <div className="muted small" style={{ marginBottom: 10, lineHeight: 1.55 }}>
              与正文分离、不自动写入；合并前会弹出对比确认。切换章节草稿按章分别保存在本会话内。
            </div>
            {draftMeta && (
              <div className="draft-meta-card">
                <button
                  type="button"
                  className="draft-meta-card__toggle"
                  onClick={() => setDraftMetaOpen((v) => !v)}
                  aria-expanded={draftMetaOpen}
                >
                  {draftMetaOpen ? "▾" : "▸"}{" "}来源信息
                </button>
                {draftMetaOpen && (
                  <dl className="draft-meta-card__body">
                    <div className="draft-meta-row">
                      <dt>模型</dt>
                      <dd>{draftMeta.provider}</dd>
                    </div>
                    <div className="draft-meta-row">
                      <dt>模式</dt>
                      <dd>{{
                        continue: "续写",
                        outline: "扩写",
                        summarize: "概要",
                        rewrite: "改写",
                        draw: "抽卡",
                      }[draftMeta.mode] ?? draftMeta.mode}</dd>
                    </div>
                    <div className="draft-meta-row">
                      <dt>粗估消耗</dt>
                      <dd>~{draftMeta.roughTokens.toLocaleString()} tokens</dd>
                    </div>
                    <div className="draft-meta-row">
                      <dt>生成时间</dt>
                      <dd>{new Date(draftMeta.generatedAt).toLocaleTimeString()}</dd>
                    </div>
                  </dl>
                )}
              </div>
            )}
            {draftHistory.length > 0 && (
              <div className="draft-history-section">
                <button
                  type="button"
                  className="draft-history-toggle"
                  onClick={() => setHistoryOpen((v) => !v)}
                  aria-expanded={historyOpen}
                >
                  {historyOpen ? "▾" : "▸"}{" "}历史草稿（{draftHistory.length}）
                </button>
                {historyOpen && (
                  <ul className="draft-history-list">
                    {draftHistory.map((entry) => (
                      <li key={entry.savedAt} className="draft-history-item">
                        <div className="draft-history-item-head">
                          <span className="draft-history-item-time muted small">
                            {new Date(entry.savedAt).toLocaleTimeString()}
                          </span>
                          <div className="draft-history-item-actions">
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => setDraft(entry.content)}
                              title="恢复此版本到草稿框"
                            >
                              恢复
                            </button>
                            <button
                              type="button"
                              className="btn small secondary"
                              onClick={() => {
                                if (!props.workId || !props.chapter) return;
                                deleteDraftHistoryEntry(props.workId, props.chapter.id, entry.savedAt);
                                setDraftHistory(readDraftHistory(props.workId, props.chapter.id));
                              }}
                              title="删除此条历史"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <div className="draft-history-item-preview muted small">{entry.preview}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <label className="ai-panel-field ai-panel-field--draft">
              <textarea name="aiDraft" value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} />
            </label>
            <div className="ai-panel-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button
                type="button"
                className="btn"
                disabled={!draft.trim()}
                onClick={() => {
                  const t = draft.trim();
                  if (!t) return;
                  setMergePayload({ kind: "insert", payload: t + "\n\n" });
                }}
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
                  setMergePayload({ kind: "append", payload: "\n\n" + t + "\n" });
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
                  const before = props.getSelectedText().trim();
                  if (!t || !before) return;
                  setMergePayload({ kind: "replace", before, after: t });
                }}
              >
                替换选区
              </button>
            </div>
            {/* P1-04：今日已用 token 始终显示 */}
            <p className="muted small ai-panel-session-budget" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              <span>
                今日已用（粗估）
                <strong style={{ marginLeft: 4 }}>{todayTokensUsed.toLocaleString()}</strong>
                {settings.dailyTokenBudget > 0 && (
                  <span
                    style={{
                      color: todayTokensUsed >= settings.dailyTokenBudget ? "var(--destructive)" : "inherit",
                    }}
                  >
                    {" "}/ {settings.dailyTokenBudget.toLocaleString()}
                  </span>
                )}
                {" "}tokens
              </span>
              {settings.dailyTokenBudget > 0 && (
                <span
                  style={{
                    display: "inline-block",
                    width: 64,
                    height: 4,
                    borderRadius: 2,
                    background: "var(--border)",
                    overflow: "hidden",
                    verticalAlign: "middle",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${Math.min(100, Math.round((todayTokensUsed / settings.dailyTokenBudget) * 100))}%`,
                      background: todayTokensUsed >= settings.dailyTokenBudget ? "var(--destructive)" : "var(--primary)",
                      borderRadius: 2,
                    }}
                  />
                </span>
              )}
            </p>
            {sessionBudget > 0 ? (
              <p className="muted small ai-panel-session-budget">
                本会话侧栏累计（粗估）{sessionTokensUsed.toLocaleString()} / {sessionBudget.toLocaleString()} tokens ·{" "}
                <button
                  type="button"
                  className="btn small secondary"
                  disabled={busy}
                  onClick={() => {
                    resetSessionApproxTokens();
                    setSessionBudgetUiTick((x) => x + 1);
                  }}
                >
                  清零本会话累计
                </button>
              </p>
            ) : null}

            {toneDriftHints.length > 0 || toneEmbedHint || toneEmbedErr || toneEmbedBusy ? (
              <div className="rr-block ai-tone-drift-hint" role="status" style={{ marginTop: 12 }}>
                <div className="rr-block-title">调性提示（轻量规则 · 仅参考）</div>
                <ul className="rr-list">
                  {toneDriftHints.map((h, i) => (
                    <li key={i} className="rr-list-item muted small">
                      {h}
                    </li>
                  ))}
                  {toneEmbedBusy ? <li className="rr-list-item muted small">标杆段距离计算中…</li> : null}
                  {toneEmbedHint ? <li className="rr-list-item muted small">{toneEmbedHint}</li> : null}
                  {toneEmbedErr ? <li className="rr-list-item muted small">标杆段距离不可用：{toneEmbedErr}</li> : null}
                </ul>
              </div>
            ) : null}

            {glossaryHitsInDraft.length > 0 ? (
              <div className="rr-block" style={{ marginTop: 12 }}>
                <div className="rr-block-title">一致性提示（来自术语/人名表）</div>
                <ul className="rr-list">
                  {glossaryHitsInDraft.map((t) => (
                    <li key={t.id} className="rr-list-item">
                      <span style={{ fontWeight: 700 }}>{t.term}</span>
                      <span className="muted small">
                        {t.category === "dead"
                          ? " · 已死（请确认没有复活/误用）"
                          : t.category === "name"
                            ? " · 人名"
                            : " · 术语"}
                        {t.note.trim() ? ` · ${t.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AiPanelRagSection
        variant="sessionOnly"
        workId={props.workId}
        work={props.work}
        chapters={props.chapters}
        activeChapterId={props.chapter?.id ?? null}
        ragEnabled={ragEnabled}
        onRagEnabledChange={(v) => patchRagInject({ ragEnabled: v })}
        ragWorkSources={ragWorkSources}
        setRagWorkSources={setRagWorkSourcesUp}
        ragQuery={ragQuery}
        onRagQueryChange={setRagQuery}
        ragK={ragK}
        onRagKChange={(n) => patchRagInject({ ragK: n })}
        ragHits={ragHits}
        ragLoading={ragLoading}
        ragExcluded={ragExcluded}
        setRagExcluded={setRagExcluded}
        busy={busy}
        onRunPreview={runRagPreview}
      />

      <AiDraftMergeDialog
        open={mergePayload !== null}
        payload={mergePayload}
        getSelectedText={props.getSelectedText}
        onCancel={() => setMergePayload(null)}
        onConfirm={confirmDraftMerge}
      />

      {/* P1-04：成本门控弹窗 */}
      {costGatePending && (
        <CostGateModal
          reasons={costGatePending.reasons}
          tokensApprox={costGatePending.tokensApprox}
          dailyUsed={costGatePending.dailyUsed}
          dailyBudget={costGatePending.dailyBudget}
          triggerLabel={costGatePending.triggerLabel}
          onConfirm={() => { costGatePending.resolve(true); setCostGatePending(null); }}
          onCancel={() => { costGatePending.resolve(false); setCostGatePending(null); }}
        />
      )}
    </aside>
  );
});

