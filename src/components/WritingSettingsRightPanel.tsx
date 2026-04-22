import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_SETTINGS_UPDATED_EVENT, loadAiSettings, saveAiSettings } from "../ai/storage";
import type { Chapter, Work } from "../db/types";
import { BibleMarkdownPreview } from "./RightRailPanels";
import { AiPanelInjectDefaultsSection } from "./ai-panel/AiPanelInjectDefaultsSection";
import { AiPanelRagSection } from "./ai-panel/AiPanelRagSection";
import { AiPanelStyleCardSection } from "./ai-panel/AiPanelStyleCardSection";
import { AiPanelWritingVarsSection } from "./ai-panel/AiPanelWritingVarsSection";
import type {
  AiPanelWorkRagInjectDefaults,
  AiPanelWorkRagInjectDefaultsPatch,
  AiPanelWorkStyle,
  AiPanelWorkStylePatch,
  AiPanelWorkWritingVars,
  AiPanelWorkWritingVarsPatch,
} from "./ai-panel/types";
import { neighborSummaryPoolChaptersForWritingPanel } from "../util/neighbor-summary-pool";
import type { WritingSkillMode } from "../ai/assemble-context";
import { AiPanelRunModeSection } from "./ai-panel/AiPanelRunModeSection";

const STYLE_VARS_ACCORDION_KEY = "liubai:writingSettingsStyleVarsAccordion:v1";

function readStyleVarsPrimary(): "style" | "vars" {
  try {
    const v = localStorage.getItem(STYLE_VARS_ACCORDION_KEY);
    if (v === "vars") return "vars";
  } catch {
    /* ignore */
  }
  return "style";
}

function persistStyleVarsPrimary(next: "style" | "vars") {
  try {
    localStorage.setItem(STYLE_VARS_ACCORDION_KEY, next);
  } catch {
    /* ignore */
  }
}

export function WritingSettingsRightPanel(props: {
  workId: string;
  work: Work;
  chapters: Chapter[];
  chapter: Chapter | null;
  workStyle: AiPanelWorkStyle;
  onUpdateWorkStyle: (patch: AiPanelWorkStylePatch) => void;
  workWritingVars: AiPanelWorkWritingVars;
  onWorkWritingVarsChange: (patch: AiPanelWorkWritingVarsPatch) => void;
  workRagInjectDefaults: AiPanelWorkRagInjectDefaults;
  onWorkRagInjectDefaultsChange: (patch: AiPanelWorkRagInjectDefaultsPatch) => void;
  writingSkillMode: WritingSkillMode;
  onWritingSkillModeChange: (m: WritingSkillMode) => void;
}) {
  const wv = props.workWritingVars;
  const ri = props.workRagInjectDefaults;

  // React to includeBible changes dispatched by AiPanel's updateSettings (same-tab)
  const [includeBibleGlobal, setIncludeBibleGlobal] = useState(() => loadAiSettings().includeBible);
  useEffect(() => {
    const handler = () => setIncludeBibleGlobal(loadAiSettings().includeBible);
    window.addEventListener(AI_SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(AI_SETTINGS_UPDATED_EVENT, handler);
  }, []);

  const neighborPool = useMemo(
    () => neighborSummaryPoolChaptersForWritingPanel(props.chapters, props.chapter, ri.recentN),
    [props.chapters, props.chapter, ri.recentN],
  );

  const [styleVarsPrimary, setStyleVarsPrimary] = useState<"style" | "vars">(() => readStyleVarsPrimary());

  // Stable refs for AiPanelRagSection session-only props that are unused in defaultsOnly variant
  const emptyRagExcluded = useRef(new Set<string>()).current;
  const noopSetRagExcluded = useCallback(() => {}, []);
  const noopOnRunPreview = useCallback(() => {}, []);
  const noopOnRagQueryChange = useCallback(() => {}, []);

  const ctxPreviewText = useMemo(() => {
    const workTitle = props.work.title ?? "";
    const chapterTitle = props.chapter?.title ?? "";
    return ["上下文：", `作品：${workTitle || "（未命名）"}`, "", `章节：${chapterTitle || "（未选择章节）"}`].join("\n");
  }, [props.work.title, props.chapter?.title]);

  const recentPreviewText = useMemo(() => {
    if (!props.chapter) return "（未选择章节）";
    if (!ri.includeRecentSummaries) return "（未启用「最近章节概要」注入）";
    if (neighborPool.length === 0) return "（当前窗口内无已填概要的章节）";
    const lines: string[] = [];
    for (const c of neighborPool) {
      if (ri.neighborSummaryIncludeById[c.id] === false) continue;
      const s = (c.summary ?? "").trim();
      if (!s) continue;
      lines.push(`## ${c.title}`, s, "");
    }
    return lines.join("\n").trim() || "（未选中任何概要章节）";
  }, [props.chapter, ri.includeRecentSummaries, ri.neighborSummaryIncludeById, neighborPool]);

  return (
    <div className="rr-panel writing-settings-right-panel">
      <div className="rr-block">
        <AiPanelRunModeSection mode={props.writingSkillMode} onModeChange={props.onWritingSkillModeChange} />
      </div>
      <div className="rr-block">
        <details
          className="ai-panel-box"
          aria-labelledby="ws-acc-style-summary"
          open={styleVarsPrimary === "style"}
          onToggle={(e) => {
            if (e.currentTarget.open) {
              setStyleVarsPrimary("style");
              persistStyleVarsPrimary("style");
            } else {
              setStyleVarsPrimary("vars");
              persistStyleVarsPrimary("vars");
            }
          }}
        >
          <summary id="ws-acc-style-summary">全书风格卡 · 本书默认（全书级）</summary>
          <AiPanelStyleCardSection workStyle={props.workStyle} onUpdateWorkStyle={props.onUpdateWorkStyle} wrap="plain" />
        </details>
        <details
          className="ai-panel-box"
          aria-labelledby="ws-acc-vars-summary"
          open={styleVarsPrimary === "vars"}
          onToggle={(e) => {
            if (e.currentTarget.open) {
              setStyleVarsPrimary("vars");
              persistStyleVarsPrimary("vars");
            } else {
              setStyleVarsPrimary("style");
              persistStyleVarsPrimary("style");
            }
          }}
        >
          <summary id="ws-acc-vars-summary">写作变量 · 本书默认</summary>
          <AiPanelWritingVarsSection
            wrap="plain"
            storyBackground={wv.storyBackground}
            onStoryBackgroundChange={(v) => props.onWorkWritingVarsChange({ storyBackground: v })}
            characters={wv.characters}
            onCharactersChange={(v) => props.onWorkWritingVarsChange({ characters: v })}
            relations={wv.relations}
            onRelationsChange={(v) => props.onWorkWritingVarsChange({ relations: v })}
            skillPreset={wv.skillPreset}
            onSkillPresetChange={(v) => props.onWorkWritingVarsChange({ skillPreset: v })}
            skillText={wv.skillText}
            onSkillTextChange={(v) => props.onWorkWritingVarsChange({ skillText: v })}
          />
        </details>
      </div>
      <div className="rr-block">
        <details className="ai-panel-box" aria-labelledby="ws-acc-rag-summary">
          <summary id="ws-acc-rag-summary">检索增强 · 本书默认（RAG）</summary>
          <AiPanelRagSection
            useDisclosure={false}
            variant="defaultsOnly"
            workId={props.workId}
            work={props.work}
            chapters={props.chapters}
            activeChapterId={props.chapter?.id ?? null}
            ragEnabled={ri.ragEnabled}
            onRagEnabledChange={(v) => props.onWorkRagInjectDefaultsChange({ ragEnabled: v })}
            ragWorkSources={ri.ragWorkSources}
            setRagWorkSources={(up) =>
              props.onWorkRagInjectDefaultsChange({
                ragWorkSources: typeof up === "function" ? up(ri.ragWorkSources) : up,
              })
            }
            ragQuery=""
            onRagQueryChange={noopOnRagQueryChange}
            ragK={ri.ragK}
            onRagKChange={(n) => props.onWorkRagInjectDefaultsChange({ ragK: n })}
            ragHits={[]}
            ragLoading={false}
            ragExcluded={emptyRagExcluded}
            setRagExcluded={noopSetRagExcluded}
            busy={false}
            onRunPreview={noopOnRunPreview}
          />
        </details>
      </div>
      <div className="rr-block">
        <details className="ai-panel-box" aria-labelledby="ws-acc-inject-summary">
          <summary id="ws-acc-inject-summary">上下文注入 · 本书默认</summary>
          <label className="ai-panel-check row row--check" style={{ marginTop: 8 }}>
            <input
              name="includeBibleGlobal"
              type="checkbox"
              checked={includeBibleGlobal}
              onChange={(e) => {
                const next = e.target.checked;
                setIncludeBibleGlobal(next);
                try {
                  const cur = loadAiSettings();
                  saveAiSettings({ ...cur, includeBible: next });
                } catch {
                  /* ignore */
                }
              }}
            />
            <span>注入本书锦囊</span>
          </label>
          <AiPanelInjectDefaultsSection
            wrap="plain"
            includeBible={includeBibleGlobal}
            includeLinkedExcerpts={ri.includeLinkedExcerpts}
            onIncludeLinkedExcerptsChange={(v) => props.onWorkRagInjectDefaultsChange({ includeLinkedExcerpts: v })}
            includeRecentSummaries={ri.includeRecentSummaries}
            onIncludeRecentSummariesChange={(v) => props.onWorkRagInjectDefaultsChange({ includeRecentSummaries: v })}
            recentN={ri.recentN}
            onRecentNChange={(n) => props.onWorkRagInjectDefaultsChange({ recentN: n })}
            neighborSummaryPoolChapters={neighborPool}
            neighborSummaryIncludeById={ri.neighborSummaryIncludeById}
            setNeighborSummaryIncludeById={(up) =>
              props.onWorkRagInjectDefaultsChange({
                neighborSummaryIncludeById: typeof up === "function" ? up(ri.neighborSummaryIncludeById) : up,
              })
            }
            chapterBibleInjectMask={ri.chapterBibleInjectMask}
            setChapterBibleInjectMask={(up) =>
              props.onWorkRagInjectDefaultsChange({
                chapterBibleInjectMask: typeof up === "function" ? up(ri.chapterBibleInjectMask) : up,
              })
            }
            workBibleSectionMask={ri.workBibleSectionMask}
            setWorkBibleSectionMask={(up) =>
              props.onWorkRagInjectDefaultsChange({
                workBibleSectionMask: typeof up === "function" ? up(ri.workBibleSectionMask) : up,
              })
            }
            currentContextMode={ri.currentContextMode}
            onCurrentContextModeChange={(v) => props.onWorkRagInjectDefaultsChange({ currentContextMode: v })}
            chapter={props.chapter}
          />
        </details>
      </div>
      <div className="rr-block">
        <details className="ai-panel-box" aria-labelledby="ws-acc-bible-preview-summary">
          <summary id="ws-acc-bible-preview-summary">锦囊 Markdown 预览（全书级导出）</summary>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, marginTop: 6 }}>
            <BibleMarkdownPreview workId={props.workId} />
          </div>
        </details>
      </div>

      <div className="rr-block">
        <details className="ai-panel-box" aria-labelledby="ws-acc-preview-summary">
          <summary id="ws-acc-preview-summary">本次注入预览（上下文 / 最近概要）</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <details className="ai-panel-box" style={{ margin: 0 }}>
              <summary>上下文（作品/章节）</summary>
              <textarea readOnly value={ctxPreviewText} rows={6} style={{ width: "100%", resize: "vertical", marginTop: 8 }} />
            </details>
            <details className="ai-panel-box" style={{ margin: 0 }}>
              <summary>最近章节概要（N={Math.max(0, Math.min(12, ri.recentN))}）</summary>
              <textarea readOnly value={recentPreviewText} rows={8} style={{ width: "100%", resize: "vertical", marginTop: 8 }} />
            </details>
          </div>
        </details>
      </div>
    </div>
  );
}
