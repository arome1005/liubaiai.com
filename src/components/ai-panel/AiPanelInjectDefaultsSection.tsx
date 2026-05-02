import type { Dispatch, SetStateAction } from "react";
import { useId } from "react";
import { CHAPTER_BIBLE_FIELD_LABELS, type ChapterBibleFieldKey } from "../../ai/assemble-context";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** 不含「注入本书锦囊」（该项仍在全局 `AiSettings` / 设定折叠标题上方） */
export function AiPanelInjectDefaultsSection(props: {
  /** `plain`：仅表单区，由外层 `<details>` / 折叠卡片提供标题 */
  wrap?: "details" | "plain";
  includeLinkedExcerpts: boolean;
  onIncludeLinkedExcerptsChange: (v: boolean) => void;
  chapterBibleInjectMask: Record<ChapterBibleFieldKey, boolean>;
  setChapterBibleInjectMask: Dispatch<SetStateAction<Record<ChapterBibleFieldKey, boolean>>>;
}) {
  const p = props;
  const wrap = p.wrap ?? "details";
  const uid = useId();

  const body = (
    <div className="ai-inject-layout">
      <section className="ai-inject-block" aria-labelledby={`${uid}-snippet`}>
        <span className="flex items-center gap-1">
          <h4 id={`${uid}-snippet`} className="ai-inject-block__title">摘录</h4>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex cursor-help items-center text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors outline-none [&:focus-visible]:ring-2 [&:focus-visible]:ring-ring" aria-label="摘录说明">
                <Info className="size-3" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={6} className="max-w-[min(92vw,18rem)] text-xs leading-relaxed">
              控制「本章关联摘录」是否进入上下文。前文相关章节请用「知识库 · 关联章节」面板手动选取。
            </TooltipContent>
          </Tooltip>
        </span>

        <label className="ai-panel-check row row--check ai-inject-row">
          <input
            name="includeLinkedExcerpts"
            type="checkbox"
            checked={p.includeLinkedExcerpts}
            onChange={(e) => p.onIncludeLinkedExcerptsChange(e.target.checked)}
          />
          <span>注入本章关联摘录</span>
        </label>
      </section>

      <section className="ai-inject-block" aria-labelledby={`${uid}-chapter`}>
        <span className="flex items-center gap-1">
          <h4 id={`${uid}-chapter`} className="ai-inject-block__title">本章锦囊字段</h4>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex cursor-help items-center text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors outline-none [&:focus-visible]:ring-2 [&:focus-visible]:ring-ring" aria-label="本章锦囊字段说明">
                <Info className="size-3" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={6} className="max-w-[min(92vw,18rem)] text-xs leading-relaxed">
              对应本章 user 上下文字段；未勾选则不注入。
            </TooltipContent>
          </Tooltip>
        </span>
        <div className="ai-inject-grid ai-inject-grid--2">
          {(Object.keys(CHAPTER_BIBLE_FIELD_LABELS) as ChapterBibleFieldKey[]).map((k) => (
            <label key={k} className="ai-panel-check row row--check ai-inject-check-compact" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={p.chapterBibleInjectMask[k] !== false}
                onChange={(e) => p.setChapterBibleInjectMask((prev) => ({ ...prev, [k]: e.target.checked }))}
              />
              <span className="small">{CHAPTER_BIBLE_FIELD_LABELS[k]}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );

  if (wrap === "plain") {
    return <div className="ai-panel-box ai-panel-box--plain-fields ai-inject-sectioned">{body}</div>;
  }

  return (
    <details className="ai-panel-box" aria-labelledby="ai-panel-inject-defaults-summary">
      <summary id="ai-panel-inject-defaults-summary">上下文注入 · 本书默认</summary>
      {body}
    </details>
  );
}
