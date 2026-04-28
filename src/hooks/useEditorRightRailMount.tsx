import { useEffect, type ComponentProps } from "react";
import { AiPanel } from "../components/AiPanel";
import { KnowledgeBaseRightPanel, RefRightPanel } from "../components/RightRailPanels";
import { WritingSettingsRightPanel } from "../components/WritingSettingsRightPanel";
import { useRightRail } from "../components/RightRailContext";

type AiPanelProps = ComponentProps<typeof AiPanel>;
type KnowledgeBaseRightPanelProps = ComponentProps<typeof KnowledgeBaseRightPanel>;
type RefRightPanelProps = ComponentProps<typeof RefRightPanel>;

interface UseEditorRightRailMountArgs {
  workId: string | null;
  work: AiPanelProps["work"] | null;
  activeChapter: AiPanelProps["chapter"];
  chapters: AiPanelProps["chapters"];
  aiPanelContent: AiPanelProps["chapterContent"];
  chapterBibleFields: AiPanelProps["chapterBible"];
  glossaryTerms: AiPanelProps["glossaryTerms"];
  bibleCharacters: AiPanelProps["bibleCharacters"];
  styleSampleSlices: AiPanelProps["styleSampleSlices"];
  aiPanelWorkStyle: AiPanelProps["workStyle"];
  updateWorkStyleFromPanel: AiPanelProps["onUpdateWorkStyle"];
  workAiWritingVars: AiPanelProps["workWritingVars"];
  patchWorkAiWritingVars: AiPanelProps["onWorkWritingVarsChange"];
  workAiRagInjectDefaults: AiPanelProps["workRagInjectDefaults"];
  patchWorkAiRagInjectDefaults: AiPanelProps["onWorkRagInjectDefaultsChange"];
  linkedExcerptsForChapter: AiPanelProps["linkedExcerptsForChapter"];
  aiContinueRunTick: AiPanelProps["continueRunTick"];
  aiLastContinueConsumedTick: AiPanelProps["lastContinueConsumedTick"];
  onAiContinueRunConsumed: AiPanelProps["onContinueRunConsumed"];
  aiDrawRunTick: AiPanelProps["drawRunTick"];
  aiLastDrawConsumedTick: AiPanelProps["lastDrawConsumedTick"];
  onAiDrawRunConsumed: AiPanelProps["onDrawRunConsumed"];
  aiUserHintPrefill: AiPanelProps["prefillUserHint"];
  onAiPrefillUserHintConsumed: AiPanelProps["onPrefillUserHintConsumed"];
  onAiMaterialsSummaryLinesChange: AiPanelProps["onMaterialsSummaryLinesChange"];
  writingSkillMode: AiPanelProps["writingSkillMode"];
  setWritingSkillMode: AiPanelProps["onWritingSkillModeChange"];
  autoSummaryStatus: KnowledgeBaseRightPanelProps["autoSummaryStatus"];
  onAiPanelClose: AiPanelProps["onClose"];
  getSelectedText: AiPanelProps["getSelectedText"];
  insertAtCursor: AiPanelProps["insertAtCursor"];
  appendToEnd: AiPanelProps["appendToEnd"];
  replaceSelection: AiPanelProps["replaceSelection"];
  ensureChapterViewBeforeInsert: AiPanelProps["ensureChapterViewBeforeInsert"];
  onSummaryJumpToChapter: KnowledgeBaseRightPanelProps["onJumpToChapter"];
  onSummaryChapterPatch: KnowledgeBaseRightPanelProps["onChapterPatch"];
  onRefInsert: RefRightPanelProps["onInsert"];
  openPullOutlineDialog: NonNullable<AiPanelProps["onRequestPullOutline"]>;
  pushedOutlinesCount: number;
}

export function useEditorRightRailMount(args: UseEditorRightRailMountArgs) {
  const { setTabContent, setTabEnabled } = useRightRail();
  const {
    workId,
    work,
    activeChapter,
    chapters,
    aiPanelContent,
    chapterBibleFields,
    glossaryTerms,
    bibleCharacters,
    styleSampleSlices,
    aiPanelWorkStyle,
    updateWorkStyleFromPanel,
    workAiWritingVars,
    patchWorkAiWritingVars,
    workAiRagInjectDefaults,
    patchWorkAiRagInjectDefaults,
    linkedExcerptsForChapter,
    aiContinueRunTick,
    aiLastContinueConsumedTick,
    onAiContinueRunConsumed,
    aiDrawRunTick,
    aiLastDrawConsumedTick,
    onAiDrawRunConsumed,
    aiUserHintPrefill,
    onAiPrefillUserHintConsumed,
    onAiMaterialsSummaryLinesChange,
    writingSkillMode,
    setWritingSkillMode,
    autoSummaryStatus,
    onAiPanelClose,
    getSelectedText,
    insertAtCursor,
    appendToEnd,
    replaceSelection,
    ensureChapterViewBeforeInsert,
    onSummaryJumpToChapter,
    onSummaryChapterPatch,
    onRefInsert,
    openPullOutlineDialog,
    pushedOutlinesCount,
  } = args;

  useEffect(() => {
    if (!workId || !work) return;

    setTabEnabled("ai", true);
    setTabContent(
      "ai",
      <AiPanel
        hideHeader
        onClose={onAiPanelClose}
        continueRunTick={aiContinueRunTick}
        lastContinueConsumedTick={aiLastContinueConsumedTick}
        onContinueRunConsumed={onAiContinueRunConsumed}
        drawRunTick={aiDrawRunTick}
        lastDrawConsumedTick={aiLastDrawConsumedTick}
        onDrawRunConsumed={onAiDrawRunConsumed}
        prefillUserHint={aiUserHintPrefill}
        onPrefillUserHintConsumed={onAiPrefillUserHintConsumed}
        onMaterialsSummaryLinesChange={onAiMaterialsSummaryLinesChange}
        writingSkillMode={writingSkillMode}
        onWritingSkillModeChange={setWritingSkillMode}
        workId={workId}
        work={work}
        chapter={activeChapter}
        chapters={chapters}
        chapterContent={aiPanelContent}
        chapterBible={chapterBibleFields}
        glossaryTerms={glossaryTerms}
        bibleCharacters={bibleCharacters}
        styleSampleSlices={styleSampleSlices}
        workStyle={aiPanelWorkStyle}
        onUpdateWorkStyle={updateWorkStyleFromPanel}
        workWritingVars={workAiWritingVars}
        onWorkWritingVarsChange={patchWorkAiWritingVars}
        workRagInjectDefaults={workAiRagInjectDefaults}
        onWorkRagInjectDefaultsChange={patchWorkAiRagInjectDefaults}
        linkedExcerptsForChapter={linkedExcerptsForChapter}
        getSelectedText={getSelectedText}
        insertAtCursor={insertAtCursor}
        appendToEnd={appendToEnd}
        replaceSelection={replaceSelection}
        ensureChapterViewBeforeInsert={ensureChapterViewBeforeInsert}
        onRequestPullOutline={openPullOutlineDialog}
        outlineEntriesCount={pushedOutlinesCount}
      />,
    );

    setTabEnabled("summary", true);
    setTabContent(
      "summary",
      <KnowledgeBaseRightPanel
        workId={workId}
        work={work}
        chapter={activeChapter}
        chapterEditorContent={aiPanelContent}
        chapters={chapters}
        autoSummaryStatus={autoSummaryStatus}
        onJumpToChapter={onSummaryJumpToChapter}
        onChapterPatch={onSummaryChapterPatch}
      />,
    );

    setTabEnabled("bible", true);
    setTabContent(
      "bible",
      <WritingSettingsRightPanel
        workId={workId}
        work={work}
        chapters={chapters}
        chapter={activeChapter}
        workStyle={aiPanelWorkStyle}
        onUpdateWorkStyle={updateWorkStyleFromPanel}
        workWritingVars={workAiWritingVars}
        onWorkWritingVarsChange={patchWorkAiWritingVars}
        workRagInjectDefaults={workAiRagInjectDefaults}
        onWorkRagInjectDefaultsChange={patchWorkAiRagInjectDefaults}
        writingSkillMode={writingSkillMode}
        onWritingSkillModeChange={setWritingSkillMode}
      />,
    );

    setTabEnabled("ref", true);
    setTabContent(
      "ref",
      <RefRightPanel
        linked={linkedExcerptsForChapter}
        onInsert={onRefInsert}
      />,
    );

    return () => {
      setTabContent("ai", null);
      setTabContent("summary", null);
      setTabContent("bible", null);
      setTabContent("ref", null);
    };
  }, [
    workId,
    work,
    activeChapter,
    chapters,
    aiPanelContent,
    chapterBibleFields,
    glossaryTerms,
    bibleCharacters,
    styleSampleSlices,
    aiPanelWorkStyle,
    updateWorkStyleFromPanel,
    workAiWritingVars,
    patchWorkAiWritingVars,
    workAiRagInjectDefaults,
    patchWorkAiRagInjectDefaults,
    linkedExcerptsForChapter,
    aiContinueRunTick,
    aiLastContinueConsumedTick,
    onAiContinueRunConsumed,
    aiDrawRunTick,
    aiLastDrawConsumedTick,
    onAiDrawRunConsumed,
    aiUserHintPrefill,
    onAiPrefillUserHintConsumed,
    onAiMaterialsSummaryLinesChange,
    writingSkillMode,
    setWritingSkillMode,
    autoSummaryStatus,
    onAiPanelClose,
    getSelectedText,
    insertAtCursor,
    appendToEnd,
    replaceSelection,
    ensureChapterViewBeforeInsert,
    onSummaryJumpToChapter,
    onSummaryChapterPatch,
    onRefInsert,
    openPullOutlineDialog,
    pushedOutlinesCount,
    setTabContent,
    setTabEnabled,
  ]);
}
