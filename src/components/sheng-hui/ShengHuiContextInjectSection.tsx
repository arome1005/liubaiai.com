import { Link } from "react-router-dom";
import type { BodyTailParagraphCount } from "../../ai/sheng-hui-generate";
import { SHENG_HUI_BODY_TAIL_SELECT_OPTIONS } from "../../util/sheng-hui-body-tail";
import { cn } from "../../lib/utils";
import type { Work } from "../../db/types";
import { isLocalAiProvider } from "../../ai/local-provider";
import type { AiSettings } from "../../ai/types";

export interface ShengHuiContextInjectSectionProps {
  workId: string | null;
  work: Work | null;
  /** 与 `ShengHuiPage` 的 cloud/隐私逻辑一致，用于在区块下方显示云端·元数据提示。 */
  settings: AiSettings;
  includeSummary: boolean;
  onIncludeSummaryChange: (v: boolean) => void;
  includeBible: boolean;
  onIncludeBibleChange: (v: boolean) => void;
  bodyTailCount: BodyTailParagraphCount | false;
  onBodyTailCountChange: (v: BodyTailParagraphCount | false) => void;
  includeSettingIndex: boolean;
  onIncludeSettingIndexChange: (v: boolean) => void;
  settingIndexLoading: boolean;
  canInjectWorkMeta: boolean;
  chapterId: string | null;
}

export function ShengHuiContextInjectSection({
  workId,
  work,
  settings,
  includeSummary,
  onIncludeSummaryChange,
  includeBible,
  onIncludeBibleChange,
  bodyTailCount,
  onBodyTailCountChange,
  includeSettingIndex,
  onIncludeSettingIndexChange,
  settingIndexLoading,
  canInjectWorkMeta,
  chapterId,
}: ShengHuiContextInjectSectionProps) {
  const isCloud = !isLocalAiProvider(settings.provider);
  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="sheng-hui-eyebrow">上下文注入</p>
        <div className="flex flex-col gap-1.5">
          <label
            className={cn("flex cursor-pointer items-start gap-1.5 text-[12px]", !chapterId && "cursor-not-allowed opacity-45")}
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={includeSummary}
              disabled={!chapterId}
              onChange={(e) => onIncludeSummaryChange(e.target.checked)}
            />
            <span>本章概要</span>
          </label>
          <label
            className={cn("flex cursor-pointer items-start gap-1.5 text-[12px]", !chapterId && "cursor-not-allowed opacity-45")}
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={includeBible}
              disabled={!chapterId}
              onChange={(e) => onIncludeBibleChange(e.target.checked)}
            />
            <span>本章锦囊要点</span>
          </label>
          <div className={cn("flex items-center gap-1.5 text-[12px]", !chapterId && "cursor-not-allowed opacity-45")}>
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={bodyTailCount !== false}
              disabled={!chapterId}
              onChange={(e) => onBodyTailCountChange(e.target.checked ? 1 : false)}
            />
            <span className="shrink-0">续接正文末尾</span>
            {bodyTailCount !== false && (
              <select
                className="ml-auto max-w-[min(100%,9rem)] rounded border border-border/40 bg-background/60 px-1 py-0 text-[11px] text-foreground focus:outline-none"
                value={String(bodyTailCount)}
                disabled={!chapterId}
                onChange={(e) => {
                  const v = e.target.value;
                  onBodyTailCountChange(v === "all" ? "all" : (Number(v) as 1 | 3 | 5));
                }}
              >
                {SHENG_HUI_BODY_TAIL_SELECT_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <label
            className={cn(
              "flex cursor-pointer items-start gap-1.5 text-[12px]",
              (!workId || settingIndexLoading || !canInjectWorkMeta) && "cursor-not-allowed opacity-45",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={includeSettingIndex}
              disabled={!workId || settingIndexLoading || !canInjectWorkMeta}
              onChange={(e) => onIncludeSettingIndexChange(e.target.checked)}
            />
            <span>设定索引（人物/世界观/术语）</span>
          </label>
          {settingIndexLoading ? <p className="text-[11px] text-muted-foreground">索引加载中…</p> : null}
        </div>
      </section>

      {workId && work && !canInjectWorkMeta && isCloud ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          云端模型·未允许元数据：风格卡与书名无法注入。{" "}
          <Link to="/settings#ai-privacy" className="underline">
            设置 → 隐私
          </Link>
        </p>
      ) : null}
    </>
  );
}
