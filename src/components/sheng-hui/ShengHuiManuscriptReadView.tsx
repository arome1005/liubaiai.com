import { cn } from "../../lib/utils";
import { splitShengHuiManuscriptIntoParagraphs } from "../../util/sheng-hui-manuscript-paragraphs";
import { ShengHuiManuscriptParagraphToolbar } from "./ShengHuiManuscriptParagraphToolbar";
import type { ShengHuiParagraphToolbarAction } from "../../ai/sheng-hui-paragraph-toolbar-messages";

type Props = {
  text: string;
  className?: string;
  paperTint: string;
  focusMode: boolean;
  /** 空主稿时提示 */
  emptyLabel: string;
  onRequestEdit: () => void;
  /** 段落工具栏；不传则不显示（N2）。 */
  paragraphToolbar?: {
    onAction: (action: ShengHuiParagraphToolbarAction, index: number) => void;
    /** 与主章生成等冲突时整栏禁用。 */
    disabled: boolean;
    /** 流式进行中的段落下标。 */
    busyIndex: number | null;
  };
};

/**
 * N1 阅读态：衬线、段距、38em 阅读宽；双击进入编辑。
 */
export function ShengHuiManuscriptReadView(props: Props) {
  const { text, className, paperTint, focusMode, emptyLabel, onRequestEdit, paragraphToolbar } = props;
  const paras = splitShengHuiManuscriptIntoParagraphs(text);
  const isEmpty = !text.trim();

  return (
    <div
      role="article"
      tabIndex={0}
      aria-label="生辉主稿，阅读模式；双击或按 Enter 进入编辑"
      className={cn(
        "sheng-hui-paper sheng-hui-manuscript-read sheng-hui-latin-mixed flex min-h-0 cursor-text select-text flex-col overflow-y-auto rounded-xl border border-border/40 p-4 outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/20",
        paperTint,
        focusMode && "text-[17px] sm:text-[18px]",
        !focusMode && "bg-background/80",
        className,
      )}
      onDoubleClick={onRequestEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onRequestEdit();
        }
      }}
    >
      {isEmpty ? (
        <p className="sheng-hui-manuscript-read__empty text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        paras.map((p, i) => (
          <div
            key={i}
            className={cn(
              "group/para relative",
              paragraphToolbar && "flex flex-col gap-1.5 sm:pl-9",
            )}
          >
            {paragraphToolbar ? (
              <ShengHuiManuscriptParagraphToolbar
                paragraphIndex={i}
                disabled={paragraphToolbar.disabled}
                isBusy={paragraphToolbar.busyIndex === i}
                onAction={(a) => paragraphToolbar.onAction(a, i)}
              />
            ) : null}
            <p className="sheng-hui-manuscript-read__p text-foreground">{p}</p>
          </div>
        ))
      )}
    </div>
  );
}
