import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  running: boolean;
  textA: string;
  textB: string;
  sublabelA: string;
  sublabelB: string;
  error: string | null;
  onStop: () => void;
  onAdoptA: () => void;
  onAdoptB: () => void;
};

/**
 * N3：同 prompt、两路不同温度成稿并排对比，择一写回主稿。
 */
export function ShengHuiAbCompareDialog(props: Props) {
  const {
    open,
    onOpenChange,
    running,
    textA,
    textB,
    sublabelA,
    sublabelB,
    error,
    onStop,
    onAdoptA,
    onAdoptB,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!running}
        className="max-h-[min(90dvh,900px)] w-full max-w-4xl gap-3 p-4 sm:p-5"
        onPointerDownOutside={(e) => {
          if (running) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (running) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>A/B 双生成</DialogTitle>
          <DialogDescription>
            同一大纲与装配上下文，两路仅「写作温度」不同；流式结束后可择一作为当前主稿（并写入版本快照）。
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          <div className="flex min-h-0 flex-col gap-1">
            <p className="text-xs font-medium text-foreground">A</p>
            <p className="text-[10px] leading-snug text-muted-foreground">{sublabelA}</p>
            <div
              className={cn(
                "sheng-hui-paper-typography min-h-[200px] max-h-[48vh] overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2.5 text-sm whitespace-pre-wrap",
                running && !textA && "text-muted-foreground",
              )}
            >
              {textA || (running ? "…" : "（空）")}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <p className="text-xs font-medium text-foreground">B</p>
            <p className="text-[10px] leading-snug text-muted-foreground">{sublabelB}</p>
            <div
              className={cn(
                "sheng-hui-paper-typography min-h-[200px] max-h-[48vh] overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2.5 text-sm whitespace-pre-wrap",
                running && !textB && "text-muted-foreground",
              )}
            >
              {textB || (running ? "…" : "（空）")}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button type="button" variant="secondary" size="sm" onClick={onStop}>
                停止
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onAdoptA} disabled={running || !textA.trim()}>
              采用 A
            </Button>
            <Button type="button" variant="default" size="sm" onClick={onAdoptB} disabled={running || !textB.trim()}>
              采用 B
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
