import { Link } from "react-router-dom";
import { PenLine, BookOpen as BookOpenIcon } from "lucide-react";
import { Button } from "../ui/button";
import { ShengHuiStepHint } from "./ShengHuiStepHint";
import { ShengHuiManuscriptStatusBar, type ShengHuiStatusRough } from "./ShengHuiManuscriptStatusBar";
import { ShengHuiManuscriptDualModeBody } from "./ShengHuiManuscriptDualModeBody";
import { ShengHuiToneDriftBar } from "./ShengHuiToneDriftBar";
import type { ShengHuiParagraphToolbarAction } from "../../ai/sheng-hui-paragraph-toolbar-messages";
import { useShengHuiManuscriptReadEditMode } from "../../hooks/useShengHuiManuscriptReadEditMode";
import { useShengHuiToneDrift } from "../../hooks/useShengHuiToneDrift";
import { buildWorkEditorUrl } from "../../util/sheng-hui-deeplink";
import type { Work, WorkStyleCard } from "../../db/types";
import { cn } from "../../lib/utils";
import type { ShengHuiEmotionTemperature } from "../../ai/sheng-hui-generate";
import type { AiSettings } from "../../ai/types";
import type { ShengHuiBuildResult } from "../../hooks/useShengHuiGenerationLifecycle";
import type { ShengHuiGenerationCompletePayload } from "../../hooks/useShengHuiGenerationCompleteCard";
import { ShengHuiGenerationCompleteCard } from "./ShengHuiGenerationCompleteCard";

export function ShengHuiCenterManuscriptColumn(props: {
  showStepHint: boolean;
  onDismissStepHint: () => void;
  output: string;
  onOutputChange: (v: string) => void;
  busy: boolean;
  modeDesc: string;
  wordCount: number;
  onCopy: () => void;
  onWriteBack: () => void;
  writeBackStatus: null | "ok" | "error";
  writeBackError: string;
  canWriteBack: boolean;
  work: Work | null;
  workId: string | null;
  chapterId: string | null;
  /** 1–5 情绪档，影响主稿纸色微差 */
  emotionTemperature: ShengHuiEmotionTemperature;
  /** 仅顶栏+主稿，放大衬线区 */
  focusMode: boolean;
  targetWords: number;
  /** 流式生成等业务错误；与 W4 状态条合并展示 */
  generateError: string | null;
  onDismissGenerateError: () => void;
  genElapsedSec: number;
  lastRoughEstimate: ShengHuiStatusRough;
  todayTokensSnapshot: number;
  settings: AiSettings;
  setError: (v: string | null) => void;
  buildGenerateArgs: () => Promise<ShengHuiBuildResult>;
  /** 笔感卡，供调性检测与装配一致 */
  styleCard: WorkStyleCard | undefined;
  cloudAllowed: boolean;
  /** 第三节：一次生成完成总结卡 */
  generationComplete: ShengHuiGenerationCompletePayload | null;
  onDismissGenerationComplete: () => void;
  onRerunGeneration: () => void;
  /** 段工具流在父级注册，便于与主栏「停止」并账 */
  paragraphToolbar?: {
    onAction: (action: ShengHuiParagraphToolbarAction, index: number) => void;
    disabled: boolean;
    busyIndex: number | null;
  };
}) {
  const {
    showStepHint,
    onDismissStepHint,
    output,
    onOutputChange,
    busy,
    modeDesc,
    wordCount,
    onCopy,
    onWriteBack,
    writeBackStatus,
    writeBackError,
    canWriteBack,
    work,
    workId,
    chapterId,
    emotionTemperature,
    focusMode,
    targetWords,
    generateError,
    onDismissGenerateError,
    genElapsedSec,
    lastRoughEstimate,
    todayTokensSnapshot,
    settings,
    // 保留 props（与当前接口同形）：未来段工具/错误重写可直接 re-bind 此处。
    setError: _setError,
    buildGenerateArgs: _buildGenerateArgs,
    styleCard,
    cloudAllowed,
    generationComplete,
    onDismissGenerationComplete,
    onRerunGeneration,
    paragraphToolbar: paragraphToolbarProp,
  } = props;

  const paperTint =
    emotionTemperature <= 2
      ? "sheng-hui-paper--cool"
      : emotionTemperature >= 4
        ? "sheng-hui-paper--warm"
        : "sheng-hui-paper--neutral";

  const { isEditing, enterEdit, exitEdit } = useShengHuiManuscriptReadEditMode(output, busy);

  const paragraphToolbar =
    output.trim() && paragraphToolbarProp
      ? paragraphToolbarProp
      : undefined;

  const { toneDriftHints, toneEmbedHint, toneEmbedBusy, toneEmbedErr } = useShengHuiToneDrift({
    settings,
    cloudAllowed,
    styleCard,
    mainBusy: busy,
    output,
  });
  const hasProse = output.trim().length >= 2;

  return (
    <section
      className={cn(
        "order-1 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden px-0.5 sm:px-1 lg:order-2",
        focusMode && "lg:mx-auto lg:max-w-[min(100%,48rem)]",
      )}
    >
      {showStepHint ? <ShengHuiStepHint onDismiss={onDismissStepHint} /> : null}

      <div
        className={cn(
          "sheng-hui-desk sheng-hui-glass-panel flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-card/80 to-card/50 p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.22)]",
          focusMode && "min-h-0",
        )}
      >
        <div className="flex h-0.5 shrink-0 rounded-full bg-gradient-to-r from-primary/40 to-chart-2/35" aria-hidden />

        <ShengHuiManuscriptStatusBar
          generateError={generateError}
          onDismissGenerateError={onDismissGenerateError}
          busy={busy}
          genElapsedSec={genElapsedSec}
          wordCount={wordCount}
          targetWords={targetWords}
          lastRoughEstimate={lastRoughEstimate}
          todayTokensSnapshot={todayTokensSnapshot}
        />

        {generationComplete ? (
          <ShengHuiGenerationCompleteCard
            payload={generationComplete}
            onDismiss={onDismissGenerationComplete}
            onRerun={() => {
              onDismissGenerationComplete();
              onRerunGeneration();
            }}
          />
        ) : null}

        <ShengHuiToneDriftBar
          enabled={settings.toneDriftHintEnabled}
          mainBusy={busy}
          ruleHints={toneDriftHints}
          embedHint={toneEmbedHint}
          embedBusy={toneEmbedBusy}
          embedErr={toneEmbedErr}
          hasProse={hasProse}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="sheng-hui-t2 leading-none tracking-tight text-foreground">主稿</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {!busy && !isEditing ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={enterEdit}
                title="进入与生成相同的源文本编辑"
              >
                <PenLine className="size-3.5" aria-hidden />
                编辑主稿
              </Button>
            ) : null}
            {!busy && isEditing ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={exitEdit}
                title="衬线排印、38em 阅读宽"
              >
                <BookOpenIcon className="size-3.5" aria-hidden />
                阅读模式
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onCopy}
              disabled={!output.trim() || busy}
            >
              复制
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onWriteBack}
              disabled={!canWriteBack}
              title={!chapterId ? "需选择章节才能写回侧栏" : "写入写作侧栏草稿，在写作页合并到正文"}
            >
              写回侧栏草稿
            </Button>
          </div>
        </div>

        {writeBackStatus === "ok" ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              ✓ 已写入侧栏草稿。可在写作页 AI 侧栏草稿区合并到正文。
            </p>
            {workId && work ? (
              <Button variant="outline" size="sm" className="h-7 w-fit text-xs" asChild>
                <Link to={buildWorkEditorUrl(work, chapterId, true)}>去写作页并打开 AI 侧栏</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {writeBackStatus === "error" ? <p className="text-[11px] text-destructive">{writeBackError}</p> : null}

        <ShengHuiManuscriptDualModeBody
          output={output}
          onOutputChange={onOutputChange}
          busy={busy}
          modeDesc={modeDesc}
          paperTint={paperTint}
          focusMode={focusMode}
          emotionLabel={String(emotionTemperature)}
          isEditing={isEditing}
          onRequestEdit={enterEdit}
          onRequestRead={exitEdit}
          paragraphToolbar={paragraphToolbar}
        />
      </div>
    </section>
  );
}
