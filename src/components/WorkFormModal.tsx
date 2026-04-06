import { useId, useState } from "react";
import { cn } from "../lib/utils";
import { normalizeWorkTagList, parseWorkTagsInputLine } from "../util/work-tags";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

type WorkFormModalProps = {
  open: boolean;
  variant: "create" | "edit";
  initialTitle: string;
  /** 已填标签用顿号或逗号拼成一行，便于编辑 */
  initialTagLine: string;
  onClose: () => void;
  onSubmit: (payload: { title: string; tags: string[] }) => void;
};

/** 打开时才挂载子组件，用 initial 初始化表单，避免在 effect 里 setState 同步 props。 */
export function WorkFormModal(props: WorkFormModalProps) {
  if (!props.open) return null;
  return (
    <WorkFormModalContent
      key={`${props.variant}\0${props.initialTitle}\0${props.initialTagLine}`}
      {...props}
    />
  );
}

function WorkFormModalContent(props: WorkFormModalProps) {
  const headingId = useId();
  const titleFieldId = useId();
  const tagsFieldId = useId();
  const [title, setTitle] = useState(props.initialTitle);
  const [tagLine, setTagLine] = useState(props.initialTagLine);

  function submit() {
    const t = title.trim() || "未命名作品";
    const tags = normalizeWorkTagList(parseWorkTagsInputLine(tagLine)) ?? [];
    props.onSubmit({ title: t, tags });
  }

  const heading = props.variant === "create" ? "新建作品" : "编辑作品";

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent
        showCloseButton
        overlayClassName="work-form-modal-overlay"
        className={cn(
          "work-form-modal z-[var(--z-modal-app-content)] max-w-[min(42rem,calc(100vw-2rem))] gap-0 border-border bg-[var(--surface)] p-0 shadow-lg sm:max-w-[42rem]",
        )}
      >
        <div className="border-b border-border/40 px-6 py-5">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle id={headingId} className="flex items-center gap-2 text-left text-xl font-semibold">
              <span className="text-primary" aria-hidden>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </span>
              {heading}
            </DialogTitle>
            <DialogDescription>
              {props.variant === "create"
                ? "创建一部新作品，设置名称与留白标签（标签将写入 AI 侧栏「作品侧写」）。"
                : "修改作品名称与留白标签。"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor={titleFieldId}>
              作品名称 <span className="text-destructive">*</span>
            </label>
            <Input
              id={titleFieldId}
              className="border-border bg-muted/30 shadow-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入作品名称…"
              autoFocus
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
            <h4 className="text-sm font-medium text-foreground">留白标签（可多选）</h4>
            <label className="sr-only" htmlFor={tagsFieldId}>
              留白标签
            </label>
            <Input
              id={tagsFieldId}
              className="border-border bg-muted/30 shadow-sm"
              value={tagLine}
              onChange={(e) => setTagLine(e.target.value)}
              placeholder="逗号或顿号分隔，如：科幻、群像、慢热"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3">
            <span className="mt-0.5 shrink-0 text-primary" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                <path d="M5 3v4" />
                <path d="M19 17v4" />
                <path d="M3 5h4" />
                <path d="M17 19h4" />
              </svg>
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              标签将影响 AI 侧栏中的风格与节奏提示；为短列表，不向模型全文展开。可在创建后随时修改。
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-border/40 px-6 py-4 sm:justify-end">
          <Button type="button" variant="outline" onClick={props.onClose}>
            取消
          </Button>
          <Button type="button" variant="default" onClick={submit}>
            {props.variant === "create" ? "创建并打开" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
