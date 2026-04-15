import { useId, useMemo, useState } from "react";
import { cn } from "../lib/utils";
import { normalizeWorkTagList, parseWorkTagsInputLine } from "../util/work-tags";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

type WorkFormModalProps = {
  open: boolean;
  variant: "create" | "edit";
  initialTitle: string;
  initialDescription?: string;
  initialStatus?: import("../db/types").WorkStatus;
  /** 已填标签用顿号或逗号拼成一行，便于编辑 */
  initialTagLine: string;
  onClose: () => void;
  onSubmit: (payload: { title: string; description: string; status: import("../db/types").WorkStatus; tags: string[] }) => void;
};

/** 打开时才挂载子组件，用 initial 初始化表单，避免在 effect 里 setState 同步 props。 */
export function WorkFormModal(props: WorkFormModalProps) {
  if (!props.open) return null;
  return (
    <WorkFormModalContent
      key={`${props.variant}\0${props.initialTitle}\0${props.initialTagLine}\0${props.initialDescription ?? ""}\0${props.initialStatus ?? ""}`}
      {...props}
    />
  );
}

const WORK_TAG_GROUPS: Array<{ group: string; tags: string[] }> = [
  { group: "平台定位", tags: ["起点风", "番茄风", "七猫风", "晋江风", "独立向"] },
  { group: "题材类型", tags: ["玄幻", "仙侠", "都市", "历史", "科幻", "悬疑", "言情", "同人", "无限流", "系统流", "重生", "穿越"] },
  { group: "创作类型", tags: ["原创", "同人衍生"] },
];

const WORK_STATUS: Array<{ id: import("../db/types").WorkStatus; label: string }> = [
  { id: "serializing", label: "连载中" },
  { id: "completed", label: "已完结" },
  { id: "archived", label: "归档" },
];

function WorkFormModalContent(props: WorkFormModalProps) {
  const headingId = useId();
  const titleFieldId = useId();
  const descFieldId = useId();
  const tagsFieldId = useId();
  const [title, setTitle] = useState(props.initialTitle);
  const [description, setDescription] = useState(props.initialDescription ?? "");
  const [status, setStatus] = useState<import("../db/types").WorkStatus>(props.initialStatus ?? "serializing");
  const [tagLine, setTagLine] = useState(props.initialTagLine);

  function submit() {
    const t = title.trim() || "未命名作品";
    const d = description.trim();
    const tags = normalizeWorkTagList(parseWorkTagsInputLine(tagLine)) ?? [];
    props.onSubmit({ title: t, description: d, status, tags });
  }

  const heading = props.variant === "create" ? "新建作品" : "编辑作品";
  const selectedTags = useMemo(() => new Set(normalizeWorkTagList(parseWorkTagsInputLine(tagLine)) ?? []), [tagLine]);
  const isFandom = selectedTags.has("同人") || selectedTags.has("同人衍生");

  function toggleTag(tag: string) {
    const next = new Set(selectedTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setTagLine([...next].join("、"));
  }

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent
        data-work-form="v2"
        showCloseButton
        overlayClassName="work-form-modal-overlay"
        className={cn(
          "work-form-modal z-[var(--z-modal-app-content)] flex max-h-[min(68dvh,720px)] w-full max-w-[min(36rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-[var(--surface)] p-0 shadow-lg ring-1 ring-border/40 sm:max-w-[36rem]",
        )}
      >
        <div className="shrink-0 border-b border-border/40 px-5 py-4 sm:px-6">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle id={headingId} className="flex items-center gap-2 text-left text-xl font-semibold">
              <span className="text-primary" aria-hidden>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M8 7h8" />
                  <path d="M8 11h8" />
                </svg>
              </span>
              {heading}
            </DialogTitle>
            <DialogDescription>
              {props.variant === "create"
                ? "创建一个新作品，设置基本信息和标签。"
                : "修改作品名称、简介、状态与标签。"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
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

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor={descFieldId}>
              作品简介
            </label>
            <textarea
              id={descFieldId}
              className="min-h-[3.75rem] w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-border/80"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述你的故事…"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-foreground">作品状态</h4>
              <div className="flex flex-wrap gap-2">
                {WORK_STATUS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      status === s.id
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                    onClick={() => setStatus(s.id)}
                    aria-pressed={status === s.id}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-3 sm:p-4">
            <h4 className="text-sm font-medium text-foreground">作品标签（可多选）</h4>
            <div className="max-h-[13rem] space-y-3 overflow-y-auto overscroll-y-contain pr-0.5 sm:max-h-[14rem]">
              {WORK_TAG_GROUPS.map((g) => (
                <div key={g.group} className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">{g.group}</div>
                  <div className="flex flex-wrap gap-2">
                    {g.tags.map((tag) => {
                      const on = selectedTags.has(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            on
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                          )}
                          onClick={() => toggleTag(tag)}
                          aria-pressed={on}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border/30 pt-3">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={tagsFieldId}>
                自定义补充（可选）
              </label>
              <Input
                id={tagsFieldId}
                className="border-border bg-muted/30 shadow-sm"
                value={tagLine}
                onChange={(e) => setTagLine(e.target.value)}
                placeholder="逗号或顿号分隔，如：群像、慢热"
              />
            </div>
          </div>

          {isFandom ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground sm:p-4">
              <div className="font-medium text-amber-600 dark:text-amber-400">同人/二创创作提示</div>
              <p className="mt-1 leading-relaxed">
                若涉及同人或二次创作，请确保遵守原作品版权规定与发布平台规则。版权与平台规则合规由创作者自行负责。
              </p>
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-2.5 sm:p-3">
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

        <DialogFooter className="shrink-0 border-t border-border/40 px-5 py-3 sm:justify-end sm:px-6 sm:py-4">
          <Button type="button" variant="outline" onClick={props.onClose}>
            取消
          </Button>
          <Button type="button" variant="default" onClick={submit}>
            {props.variant === "create" ? "创建作品" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
