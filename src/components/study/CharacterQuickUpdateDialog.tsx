import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { BibleCharacter } from "../../db/types";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

export type CharacterQuickUpdateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 本书人物（与书斋左侧列表同序） */
  characters: BibleCharacter[];
  /** 书斋当前选中人物，用于「仅当前」与打开时默认勾选 */
  anchorCharacterId: string | null;
  isRunning: boolean;
  progress: { current: number; total: number; name?: string } | null;
  onStart: (ids: string[]) => void;
};

/**
 * 一键更新：从左侧人物列表中勾选要按正文重填的人物卡
 */
export function CharacterQuickUpdateDialog(props: CharacterQuickUpdateDialogProps) {
  const { open, onOpenChange, characters, anchorCharacterId, isRunning, progress, onStart } = props;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(anchorCharacterId && characters.some((c) => c.id === anchorCharacterId) ? new Set([anchorCharacterId]) : new Set());
  }, [open, anchorCharacterId, characters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        `${c.motivation}\n${c.voiceNotes}`.toLowerCase().includes(q),
    );
  }, [characters, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllAll() {
    setSelected(new Set(characters.map((c) => c.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function selectVisible() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }

  function selectAnchorOnly() {
    if (anchorCharacterId) setSelected(new Set([anchorCharacterId]));
  }

  const nSelected = selected.size;
  const canStart = nSelected > 0 && !isRunning;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && isRunning) return;
        onOpenChange(v);
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[224]"
        className="z-[225] flex max-h-[min(88dvh,640px)] w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3 pr-10 text-left">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">一键更新人物</DialogTitle>
            <button
              type="button"
              className="hover:bg-accent rounded-md p-1.5"
              disabled={isRunning}
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-xs font-normal text-muted-foreground">
            勾选要按「本书正文节选」重填的人物；使用「设置 → AI」中的当前模型。若同时更新多人，对当前在编辑的人使用左侧表单里尚未保存的内容。
          </p>
        </DialogHeader>

        {isRunning && progress ? (
          <div className="bg-primary/5 border-b border-border/50 px-4 py-2 text-sm text-foreground">
            正在更新（{progress.current}/{progress.total}）
            {progress.name ? ` · ${progress.name}` : ""}…
          </div>
        ) : null}

        <div className="shrink-0 space-y-2 border-b border-border/50 p-3">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={isRunning} onClick={selectAllAll}>
              全选
            </Button>
            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={isRunning} onClick={selectVisible}>
              全选可见
            </Button>
            {anchorCharacterId ? (
              <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={isRunning} onClick={selectAnchorOnly}>
                仅当前
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={isRunning} onClick={clearAll}>
              全不选
            </Button>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              className="h-9 pl-8 text-sm"
              placeholder="筛选姓名或简介…"
              value={query}
              disabled={isRunning}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">{query.trim() ? "无匹配人物" : "本书暂无人物卡"}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((c) => {
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                        checked ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-muted/40",
                        isRunning && "pointer-events-none opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="shrink-0"
                        checked={checked}
                        disabled={isRunning}
                        onChange={() => toggle(c.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{c.name || "（未命名）"}</span>
                        {c.id === anchorCharacterId ? (
                          <span className="text-muted-foreground ml-1.5 text-xs">书斋中</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border/50 flex shrink-0 flex-col gap-2 px-4 py-3">
          <p className="text-muted-foreground m-0 text-[0.65rem]">已选 {nSelected} 人 · 将顺序调用模型，与章节概要式节选一致</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={isRunning} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canStart}
              onClick={() => {
                // 按左侧人物顺序提交，避免 Set 迭代顺序造成批量更新顺序不稳定
                const ordered = characters.map((c) => c.id).filter((id) => selected.has(id));
                onStart(ordered);
              }}
            >
              开始更新
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
