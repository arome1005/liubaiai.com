import { Button } from "../ui/button";

type Props = {
  busy: boolean;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
  text: string | null;
  error: string | null;
  onDismissError: () => void;
};

/**
 * 成稿后「AI 复盘」：短 Markdown 分节（见 `buildShengHuiSelfReviewMessages`）。
 */
export function ShengHuiSelfReviewSection(props: Props) {
  const { busy, canRun, onRun, onStop, text, error, onDismissError } = props;
  return (
    <div className="space-y-1.5 border-t border-border/40 pt-2">
      <p className="sheng-hui-eyebrow">成稿复盘</p>
      <p className="text-[10px] leading-relaxed text-muted-foreground/75">
        对主稿做语气/设定/人名/套话/节奏等清单式检查，参照笔感与锦囊摘要（不上传长文到提示外说明）。
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-[10px]"
          onClick={onRun}
          disabled={!canRun || busy}
        >
          {busy ? "复盘…" : "生成复盘"}
        </Button>
        {busy ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onStop}>
            停止
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-[10px] text-destructive">
          {error}{" "}
          <button type="button" className="underline" onClick={onDismissError}>
            关
          </button>
        </p>
      ) : null}
      {text ? (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border/35 bg-card/30 p-2">
          <pre className="m-0 whitespace-pre-wrap break-words font-sans text-[10px] leading-relaxed text-foreground/90">
            {text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
