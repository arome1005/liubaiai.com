import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, PenLine, Search, Users } from "lucide-react";
import { AI_SETTINGS_UPDATED_EVENT, loadAiSettings, saveAiSettings } from "../ai/storage";
import type { Chapter, Work } from "../db/types";
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
import {
  summarizeInjectDefaults,
  summarizeRagDefaults,
  summarizeWorkStyle,
  summarizeWritingVars,
} from "./writing-settings/writing-settings-summaries";
import { useWritingSettingsSections } from "../hooks/useWritingSettingsSections";
import { WritingSettingsAnchorNav } from "./writing-settings/WritingSettingsAnchorNav";
import { WritingSettingsDisclosure } from "./writing-settings/WritingSettingsDisclosure";
import { WritingSettingsGroupLabel } from "./writing-settings/WritingSettingsGroupLabel";

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
}) {
  const wv = props.workWritingVars;
  const ri = props.workRagInjectDefaults;

  const { sectionOpen, setSection, collapseAll, expandAll } = useWritingSettingsSections();

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

  const emptyRagExcluded = useRef(new Set<string>()).current;
  const noopSetRagExcluded = useCallback(() => {}, []);
  const noopOnRunPreview = useCallback(() => {}, []);
  const noopOnRagQueryChange = useCallback(() => {}, []);

  const badgeStyle = useMemo(() => summarizeWorkStyle(props.workStyle), [props.workStyle]);
  const badgeVars = useMemo(() => summarizeWritingVars(wv), [wv]);
  const badgeRag = useMemo(() => summarizeRagDefaults(ri), [ri]);
  const badgeInject = useMemo(() => summarizeInjectDefaults(ri, includeBibleGlobal), [ri, includeBibleGlobal]);

  return (
    <div className="rr-panel writing-settings-right-panel">
      <WritingSettingsAnchorNav onCollapseAll={collapseAll} onExpandAll={expandAll} />

      <div id="ws-section-style" className="ws-section-group flex scroll-mt-[4.5rem] flex-col gap-2">
        <WritingSettingsGroupLabel hint="全书级风格卡：叙述视角、调性、禁用词、文风锚点与高级指纹。写作变量：故事背景、角色、关系与技巧预设。">
          文风与变量
        </WritingSettingsGroupLabel>
        <WritingSettingsDisclosure
          title="全书风格卡 · 本书默认（全书级）"
          description="叙述视角、调性、禁用词、文风锚点与高级指纹"
          badge={badgeStyle}
          icon={<PenLine />}
          open={sectionOpen.style}
          onOpenChange={(o) => setSection("style", o)}
        >
          <AiPanelStyleCardSection workStyle={props.workStyle} onUpdateWorkStyle={props.onUpdateWorkStyle} wrap="plain" />
        </WritingSettingsDisclosure>
        <WritingSettingsDisclosure
          title="写作变量 · 本书默认"
          description="故事背景、角色、关系与技巧预设"
          badge={badgeVars}
          icon={<Users />}
          open={sectionOpen.vars}
          onOpenChange={(o) => setSection("vars", o)}
        >
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
        </WritingSettingsDisclosure>
      </div>

      <div id="ws-section-rag" className="ws-section-group flex scroll-mt-[4.5rem] flex-col gap-2">
        <WritingSettingsGroupLabel hint="检索增强（RAG）：开关、检索范围与 top-k。上下文注入：本书锦囊、本章摘录与邻章概要、本章锦囊字段等默认是否进入生成上下文。">
          检索与注入
        </WritingSettingsGroupLabel>
        <WritingSettingsDisclosure
          title="检索增强 · 本书默认（RAG）"
          description="检索开关、范围与 top-k"
          badge={badgeRag}
          icon={<Search />}
          open={sectionOpen.rag}
          onOpenChange={(o) => setSection("rag", o)}
        >
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
        </WritingSettingsDisclosure>
        <WritingSettingsDisclosure
          title="上下文注入 · 本书默认"
          description="锦囊、摘录、邻章概要与本章字段"
          badge={badgeInject}
          icon={<Layers />}
          open={sectionOpen.inject}
          onOpenChange={(o) => setSection("inject", o)}
        >
          <label className="ai-panel-check row row--check" style={{ marginTop: 0 }}>
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
            chapter={props.chapter}
          />
        </WritingSettingsDisclosure>
      </div>
    </div>
  );
}
