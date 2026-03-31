import { useMemo, useRef, useState } from "react";
import { exportBibleMarkdown } from "../db/repo";
import type { ReferenceExcerpt, Work, Chapter } from "../db/types";
import { generateWithProviderStream } from "../ai/providers";
import { loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiChatMessage, AiProviderId, AiSettings } from "../ai/types";

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
  workStyle: { pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string };
  onUpdateWorkStyle: (patch: Partial<{ pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string }>) => void;
  linkedExcerptsForChapter: Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>;
  getSelectedText: () => string;
  insertAtCursor: (text: string) => void;
  appendToEnd: (text: string) => void;
  replaceSelection: (text: string) => void;
}) {
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
  const abortRef = useRef<AbortController | null>(null);
  const lastReqRef = useRef<{
    provider: AiProviderId;
    providerCfg: AiSettings["openai"];
    messages: AiChatMessage[];
  } | null>(null);

  const providerCfg = useMemo(() => {
    const p = settings.provider;
    return p === "openai"
      ? settings.openai
      : p === "anthropic"
        ? settings.anthropic
        : p === "gemini"
          ? settings.gemini
          : settings.ollama;
  }, [settings]);

  const selectedText = useMemo(() => props.getSelectedText(), [props]);

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
        ctxParts.push(`作品：${props.work.title}`);
        ctxParts.push(`章节：${props.chapter.title}`);
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

        if (includeLinkedExcerpts && props.linkedExcerptsForChapter.length > 0) {
          const ex = props.linkedExcerptsForChapter
            .slice(0, 8)
            .map((e, i) => `【摘录${i + 1}｜${e.refTitle}】\n${e.text}`)
            .join("\n\n");
          ctxParts.push(`参考摘录（与本章关联）：\n${ex}`);
        }

        let bible = "";
        if (settings.includeBible) {
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
        if (recentSummaryText.trim()) {
          userParts.push(
            "最近章节概要（仅供回忆事实）：\n" + clampText(recentSummaryText, Math.floor(settings.maxContextChars * 0.2)),
          );
        }
        if (bible.trim()) {
          userParts.push(
            "创作圣经（如与正文冲突，以圣经为准）：\n" + clampText(bible, Math.floor(settings.maxContextChars * 0.45)),
          );
        }
        if (currentContextMode === "full" && content.trim()) {
          userParts.push("当前正文：\n" + clampText(content, Math.floor(settings.maxContextChars * 0.45)));
        } else if (currentContextMode === "summary" && (props.chapter.summary ?? "").trim()) {
          userParts.push(
            "当前章节概要（仅供回忆事实）：\n" +
              clampText((props.chapter.summary ?? "").trim(), Math.floor(settings.maxContextChars * 0.2)),
          );
        } else if (currentContextMode === "selection" && selectedText.trim()) {
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
        <select value={settings.provider} onChange={(e) => updateProvider(e.target.value as AiProviderId)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Claude</option>
          <option value="gemini">Gemini</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>
      <div className="ai-panel-row">
        <label className="small muted">模式</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
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
          <textarea value={storyBackground} onChange={(e) => setStoryBackground(e.target.value)} rows={3} />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">角色（可空）</span>
          <textarea value={characters} onChange={(e) => setCharacters(e.target.value)} rows={3} />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">角色关系（可空）</span>
          <textarea value={relations} onChange={(e) => setRelations(e.target.value)} rows={3} />
        </label>
        <div className="ai-panel-row">
          <label className="small muted">技巧预设</label>
          <select value={skillPreset} onChange={(e) => setSkillPreset(e.target.value as any)}>
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
            <textarea value={skillText} onChange={(e) => setSkillText(e.target.value)} rows={3} />
          </label>
        ) : null}
      </details>

      <details className="ai-panel-box">
        <summary>风格卡 / 调性锁（全书级）</summary>
        <label className="ai-panel-field">
          <span className="small muted">叙述视角 / 人称（可空）</span>
          <textarea
            value={props.workStyle.pov}
            onChange={(e) => props.onUpdateWorkStyle({ pov: e.target.value })}
            rows={2}
            placeholder="例如：第三人称有限 · 贴近主角内心；过去时/现在时…"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">整体调性（可空）</span>
          <textarea
            value={props.workStyle.tone}
            onChange={(e) => props.onUpdateWorkStyle({ tone: e.target.value })}
            rows={2}
            placeholder="例如：克制冷峻、少解释、多动作；偏硬核；节奏快…"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">禁用词 / 禁用套话（换行分隔，可空）</span>
          <textarea
            value={props.workStyle.bannedPhrases}
            onChange={(e) => props.onUpdateWorkStyle({ bannedPhrases: e.target.value })}
            rows={3}
            placeholder="例如：不由得、顿时、旋即、仿佛、不可思议…"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">文风锚点（短样例，可空）</span>
          <textarea
            value={props.workStyle.styleAnchor}
            onChange={(e) => props.onUpdateWorkStyle({ styleAnchor: e.target.value })}
            rows={4}
            placeholder="粘贴一小段你满意的成稿，用来锁句式与节奏。"
          />
        </label>
        <label className="ai-panel-field">
          <span className="small muted">额外硬约束（可空）</span>
          <textarea
            value={props.workStyle.extraRules}
            onChange={(e) => props.onUpdateWorkStyle({ extraRules: e.target.value })}
            rows={3}
            placeholder="例如：避免上帝视角；不要出现现代网络词；对话不加引号…"
          />
        </label>
      </details>

      <details className="ai-panel-box" open>
        <summary>上下文注入</summary>
        <label className="ai-panel-check row row--check">
          <input
            type="checkbox"
            checked={settings.includeBible}
            onChange={(e) => updateSettings({ includeBible: e.target.checked })}
          />
          <span>注入创作圣经</span>
        </label>
        <label className="ai-panel-check row row--check">
          <input
            type="checkbox"
            checked={includeLinkedExcerpts}
            onChange={(e) => setIncludeLinkedExcerpts(e.target.checked)}
          />
          <span>注入本章关联摘录</span>
        </label>
        <div className="ai-panel-row">
          <label className="ai-panel-check row row--check" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={includeRecentSummaries}
              onChange={(e) => setIncludeRecentSummaries(e.target.checked)}
            />
            <span>注入最近章节概要</span>
          </label>
          <input
            type="number"
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
          <select value={currentContextMode} onChange={(e) => setCurrentContextMode(e.target.value as any)}>
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
        <textarea value={userHint} onChange={(e) => setUserHint(e.target.value)} rows={3} />
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
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} />
      </label>

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

