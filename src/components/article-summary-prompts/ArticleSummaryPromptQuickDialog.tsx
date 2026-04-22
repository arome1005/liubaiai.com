import type { GlobalPromptTemplate } from "../../db/types";
import {
  GlobalPromptQuickDialog,
  type GlobalPromptQuickDialogProps,
} from "../prompt-quick/GlobalPromptQuickDialog";

export type ArticleSummaryPromptQuickDialogProps = Omit<
  GlobalPromptQuickDialogProps,
  "filterTypes" | "labels"
> & {
  /** 关闭快捷窗并打开「文章概要 · 浏览」（人气/精选/最新） */
  onOpenBrowse: () => void;
};

/**
 * 批量概要 —「选择提示词」快捷窗（已收藏 / 我的 / 人气 + 最新，更多 → 浏览弹窗）
 */
export function ArticleSummaryPromptQuickDialog(props: ArticleSummaryPromptQuickDialogProps) {
  const { onOpenBrowse, ...rest } = props;
  return (
    <GlobalPromptQuickDialog
      {...rest}
      filterTypes={["article_summary"]}
      labels={{
        mineEmpty: "暂无自建「文章概要」提示词。",
        popularEmpty: "暂无可用概要提示词。",
      }}
      onOpenBrowse={onOpenBrowse}
    />
  );
}
