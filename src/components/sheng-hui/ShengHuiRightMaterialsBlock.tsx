import type { AiSettings } from "../../ai/types";
import { formatSceneStateForPrompt, isSceneStateCardEmpty, type BodyTailParagraphCount, type SceneStateCard } from "../../ai/sheng-hui-generate";
import type { Chapter, ReferenceSearchHit, Work } from "../../db/types";
import type { ShengHuiBibleCharRow } from "../../util/sheng-hui-voice-lock";
import { HubAiSettingsHint } from "../HubAiSettingsHint";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { ShengHuiContextInjectSection } from "./ShengHuiContextInjectSection";

type SnapshotItem = { createdAt: number; prose: string };

export function ShengHuiRightMaterialsBlock(props: {
  workId: string | null;
  work: Work | null;
  settings: AiSettings;
  canInjectWorkMeta: boolean;
  /** newest first */
  snapshotsNewestFirst: SnapshotItem[];
  selectedChapter: Chapter | undefined;
  ragQuery: string;
  onRagQueryChange: (v: string) => void;
  ragResults: ReferenceSearchHit[];
  ragSearching: boolean;
  onSearchRag: () => void;
  selectedExcerptIds: Set<string>;
  onToggleExcerpt: (chunkId: string) => void;
  styleFeatures: Map<string, string>;
  extractingFeatureIds: Set<string>;
  onExtractStyleFeature: (chunkId: string, text: string) => void;
  sceneState: SceneStateCard;
  onSceneStateChange: (s: SceneStateCard | ((prev: SceneStateCard) => SceneStateCard)) => void;
  sceneStateOpen: boolean;
  onSceneStateOpenChange: (v: boolean | ((b: boolean) => boolean)) => void;
  sceneStateExtracting: boolean;
  onExtractSceneStateFromSnapshot: () => void;
  bibleCharacters: ShengHuiBibleCharRow[];
  detectedCharNames: Set<string>;
  lockedCharNames: Set<string>;
  onToggleLockedCharName: (name: string, hasData: boolean) => void;
  includeSummary: boolean;
  onIncludeSummaryChange: (v: boolean) => void;
  includeBible: boolean;
  onIncludeBibleChange: (v: boolean) => void;
  bodyTailCount: BodyTailParagraphCount | false;
  onBodyTailCountChange: (v: BodyTailParagraphCount | false) => void;
  includeSettingIndex: boolean;
  onIncludeSettingIndexChange: (v: boolean) => void;
  settingIndexLoading: boolean;
  chapterId: string | null;
}) {
  const {
    workId,
    work,
    settings,
    canInjectWorkMeta,
    snapshotsNewestFirst,
    selectedChapter,
    ragQuery,
    onRagQueryChange,
    ragResults,
    ragSearching,
    onSearchRag,
    selectedExcerptIds,
    onToggleExcerpt,
    styleFeatures,
    extractingFeatureIds,
    onExtractStyleFeature,
    sceneState,
    onSceneStateChange,
    sceneStateOpen,
    onSceneStateOpenChange,
    sceneStateExtracting,
    onExtractSceneStateFromSnapshot,
    bibleCharacters,
    detectedCharNames,
    lockedCharNames,
    onToggleLockedCharName,
    includeSummary,
    onIncludeSummaryChange,
    includeBible,
    onIncludeBibleChange,
    bodyTailCount,
    onBodyTailCountChange,
    includeSettingIndex,
    onIncludeSettingIndexChange,
    settingIndexLoading,
    chapterId,
  } = props;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">藏经风格参考</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          从参考书库检索段落，学习其笔法融入创作——仅吸收风格，不引用原文，不洗稿。
        </p>
        <div className="flex gap-1.5">
          <input
            type="text"
            className="input min-w-0 flex-1 text-sm"
            placeholder="搜索场景关键词…"
            value={ragQuery}
            onChange={(e) => onRagQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSearchRag();
              }
            }}
            disabled={ragSearching}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onSearchRag()}
            disabled={ragSearching || !ragQuery.trim()}
            className="shrink-0 px-2.5"
          >
            {ragSearching ? "…" : "搜索"}
          </Button>
        </div>

        {ragResults.length === 0 && !ragSearching ? (
          <p className="text-[11px] text-muted-foreground/60">无结果。请先在「藏经」导入参考书，再搜索关键词。</p>
        ) : null}

        {ragResults.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {ragResults.map((hit) => {
              const feature = styleFeatures.get(hit.chunkId);
              const isExtracting = extractingFeatureIds.has(hit.chunkId);
              const isSelected = selectedExcerptIds.has(hit.chunkId);
              return (
                <div
                  key={hit.chunkId}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 bg-card/20 opacity-55 hover:opacity-80",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={isSelected}
                      onChange={() => onToggleExcerpt(hit.chunkId)}
                    />
                    <p className="min-w-0 flex-1 truncate font-medium text-foreground/80">{hit.refTitle || "参考书库"}</p>
                    <button
                      type="button"
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors",
                        feature
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-border/30 text-muted-foreground hover:bg-primary/10 hover:text-primary",
                      )}
                      disabled={isExtracting}
                      onClick={() => void onExtractStyleFeature(hit.chunkId, hit.preview ?? "")}
                      title={feature ? "重新提炼笔法" : "AI 提炼此段的笔法特征，代替原文注入（更安全、更精准）"}
                    >
                      {isExtracting ? "提炼中…" : feature ? "已提炼 ↺" : "提炼笔法"}
                    </button>
                  </div>
                  {feature ? (
                    <p className="rounded bg-emerald-500/8 px-1.5 py-1 text-[10px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                      {feature}
                    </p>
                  ) : (
                    <p className="line-clamp-2 text-muted-foreground">{hit.snippetMatch || hit.preview}</p>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground/60">
              已选 {selectedExcerptIds.size}/{ragResults.length} 条 ·{" "}
              {styleFeatures.size > 0
                ? `${styleFeatures.size} 条已提炼笔法（不含原文）`
                : "勾选后可点「提炼笔法」替代原文注入"}
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">场景状态卡</p>
          <button
            type="button"
            className="ml-auto text-[10px] text-muted-foreground/70 hover:text-foreground"
            onClick={() => onSceneStateOpenChange((v) => !v)}
          >
            {sceneStateOpen ? "收起" : isSceneStateCardEmpty(sceneState) ? "展开填写" : "已填 ✓"}
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          记录上一段落的场所/时间/人物状态/悬念，让 AI 精准续接，比贴末尾正文更省 token。
        </p>
        {!sceneStateOpen && !isSceneStateCardEmpty(sceneState) && (
          <p className="truncate rounded bg-primary/5 px-2 py-1 text-[11px] text-primary/80">
            {formatSceneStateForPrompt(sceneState).replace(/\n/g, " · ")}
          </p>
        )}
        {sceneStateOpen && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-background/40 p-2">
            {(
              [
                { key: "location" as const, label: "场所", placeholder: "如：苏州城外废庙" },
                { key: "timeOfDay" as const, label: "时间", placeholder: "如：傍晚、三更" },
                { key: "charState" as const, label: "人物状态", placeholder: "如：顾长安受伤，苏九月守旁" },
                { key: "tension" as const, label: "悬念/张力", placeholder: "如：追兵未退，信物下落不明" },
              ] as const
            ).map(({ key, label, placeholder }) => (
              <label key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder={placeholder}
                  value={sceneState[key]}
                  onChange={(e) => onSceneStateChange((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </label>
            ))}
            <div className="flex items-center gap-1.5 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={sceneStateExtracting || (!snapshotsNewestFirst.length && !selectedChapter?.content)}
                onClick={() => void onExtractSceneStateFromSnapshot()}
                title="从最新快照或当前正文末尾 AI 提取场景状态"
              >
                {sceneStateExtracting ? "提取中…" : "AI 提取"}
              </Button>
              {!isSceneStateCardEmpty(sceneState) && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground/60 hover:text-destructive"
                  onClick={() => onSceneStateChange({ location: "", timeOfDay: "", charState: "", tension: "" })}
                >
                  清空
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {detectedCharNames.size > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">人物声音锁</p>
            <span className="ml-auto text-[10px] text-muted-foreground/60">大纲中检测到</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">勾选的人物口吻与禁忌将注入提示词，让对话更有辨识度。</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(detectedCharNames).map((name) => {
              const char = bibleCharacters.find((c) => c.name === name);
              const hasData = Boolean(char && (char.voiceNotes.trim() || char.taboos.trim()));
              const locked = lockedCharNames.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  title={
                    hasData
                      ? `口吻：${char!.voiceNotes || "—"}  禁忌：${char!.taboos || "—"}`
                      : "该人物暂无口吻/禁忌设定，可在锦囊中补充"
                  }
                  onClick={() => onToggleLockedCharName(name, hasData)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                    locked
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : hasData
                        ? "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                        : "cursor-default border-border/30 text-muted-foreground/40",
                  )}
                >
                  {locked ? "🔒 " : ""}
                  {name}
                  {!hasData && <span className="ml-0.5 text-[9px]">无设定</span>}
                </button>
              );
            })}
          </div>
          {lockedCharNames.size > 0 && <p className="text-[10px] text-primary/70">{lockedCharNames.size} 个人物口吻已锁定注入</p>}
        </section>
      )}

      <ShengHuiContextInjectSection
        workId={workId}
        work={work}
        settings={settings}
        chapterId={chapterId}
        includeSummary={includeSummary}
        onIncludeSummaryChange={onIncludeSummaryChange}
        includeBible={includeBible}
        onIncludeBibleChange={onIncludeBibleChange}
        bodyTailCount={bodyTailCount}
        onBodyTailCountChange={onBodyTailCountChange}
        includeSettingIndex={includeSettingIndex}
        onIncludeSettingIndexChange={onIncludeSettingIndexChange}
        settingIndexLoading={settingIndexLoading}
        canInjectWorkMeta={canInjectWorkMeta}
      />

      <HubAiSettingsHint />
    </div>
  );
}
