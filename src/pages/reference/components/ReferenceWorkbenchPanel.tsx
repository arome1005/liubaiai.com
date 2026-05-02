import { Link } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import type { 
  ReferenceLibraryEntry, 
  ReferenceChapterHead, 
  ReferenceExcerpt, 
  ReferenceExtract, 
} from "../../../db/types";
import { getExtractTypeLabel } from "../../../ai/reference-extract";
import { parseReferenceKeyCardsFromExtractBody, type ReferenceKeyCard } from "../../../util/reference-key-cards";

interface ReferenceWorkbenchPanelProps {
  open: boolean;
  onClose: () => void;
  entry: ReferenceLibraryEntry | null;
  heads: ReferenceChapterHead[];
  excerpts: (ReferenceExcerpt & { tagIds: string[] })[];
  extracts: ReferenceExtract[];
  tab: string;
  setTab: (tab: "overview" | "excerpts" | "extracts") => void;
  importWorkId: string;
  refWorkPathSeg: (id: string) => string;
  openReader: (entry: ReferenceLibraryEntry, ordinal: number, highlight: any) => Promise<void>;
  openPromptExtractFromEntry: (entry: ReferenceLibraryEntry) => Promise<void>;
  openPromptExtractFromExcerpt: (ex: ReferenceExcerpt) => void;
  jumpExcerptToReader: (ex: ReferenceExcerpt) => Promise<void>;
  applyKeyCardToWenceRefs: (card: ReferenceKeyCard) => void;
  jumpKeyCardToWritingHit: (card: ReferenceKeyCard) => Promise<void>;
  applyKeyCardToAiDraft: (card: ReferenceKeyCard) => Promise<void>;
  applyKeyCardToWork: (card: ReferenceKeyCard) => Promise<void>;
}

export function ReferenceWorkbenchPanel({
  open,
  onClose,
  entry,
  heads,
  excerpts,
  extracts,
  tab,
  setTab,
  importWorkId,
  refWorkPathSeg,
  openReader,
  openPromptExtractFromEntry,
  openPromptExtractFromExcerpt,
  jumpExcerptToReader,
  applyKeyCardToWenceRefs,
  jumpKeyCardToWritingHit,
  applyKeyCardToAiDraft,
  applyKeyCardToWork,
}: ReferenceWorkbenchPanelProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>书籍工作台{entry ? `：${entry.title}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={tab === "overview" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("overview")}
            >
              概览
            </Button>
            <Button
              type="button"
              variant={tab === "excerpts" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("excerpts")}
            >
              摘录（{excerpts.length}）
            </Button>
            <Button
              type="button"
              variant={tab === "extracts" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("extracts")}
            >
              提炼（{extracts.length}）
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!entry}
                onClick={() => {
                  if (!entry) return;
                  void openReader(entry, 0, null);
                  onClose();
                }}
              >
                打开阅读器
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!entry}
                onClick={() => {
                  if (!entry) return;
                  void openPromptExtractFromEntry(entry);
                }}
              >
                提炼提示词
              </Button>
            </div>
          </div>

          {tab === "overview" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                <div className="text-sm font-medium">书目信息</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  <div>分段：{entry?.chunkCount ?? "—"}</div>
                  <div>章节头：{entry?.chapterHeadCount ?? "—"}</div>
                  <div>字数（估算）：{entry?.totalChars ? `${Math.round(entry.totalChars / 10000)} 万` : "—"}</div>
                  <div>分类：{(entry?.category ?? "").trim() || "—"}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                <div className="text-sm font-medium">跨模块入口</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link to={importWorkId ? `/work/${refWorkPathSeg(importWorkId)}/bible` : "#"} onClick={(e) => !importWorkId && e.preventDefault()}>
                    <Button type="button" size="sm" variant="outline" disabled={!importWorkId}>
                      进入锦囊（需选作品）
                    </Button>
                  </Link>
                  <Link to="/logic">
                    <Button type="button" size="sm" variant="outline">
                      去推演
                    </Button>
                  </Link>
                  <Link to="/luobi">
                    <Button type="button" size="sm" variant="outline">
                      去落笔
                    </Button>
                  </Link>
                  <Link to="/inspiration">
                    <Button type="button" size="sm" variant="outline">
                      去流光
                    </Button>
                  </Link>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  提示：先在「提炼」里生成结构化卡片，再逐张"应用到作品"，可形成引用闭环。
                </div>
              </div>

              <div className="sm:col-span-2 rounded-xl border border-border/50 bg-card/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">章节导航</div>
                  <div className="text-xs text-muted-foreground">{heads.length} 条</div>
                </div>
                {heads.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">未检测到章节标题行（仍可按段阅读）。</div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {heads.slice(0, 16).map((h) => (
                      <Button
                        key={h.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="justify-start"
                        onClick={() => {
                          if (!entry) return;
                          void openReader(entry, h.ordinal, null);
                          onClose();
                        }}
                      >
                        {h.title}
                      </Button>
                    ))}
                    {heads.length > 16 ? (
                      <div className="text-xs text-muted-foreground">仅展示前 16 个章节标题（可在阅读器侧栏查看完整列表）。</div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === "excerpts" ? (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-border/50 bg-card/20 p-3">
              {excerpts.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无摘录。</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {excerpts.slice(0, 60).map((ex) => (
                    <div key={ex.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-muted-foreground">
                          {new Date(ex.createdAt).toLocaleString("zh-CN")}
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => void jumpExcerptToReader(ex)}>
                            定位
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => openPromptExtractFromExcerpt(ex)}>
                            提炼提示词
                          </Button>
                        </div>
                      </div>
                      <pre className="reference-extract-item-body" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                        {ex.text}
                      </pre>
                      {ex.note ? (
                        <div className="mt-2 text-xs text-muted-foreground">备注：{ex.note}</div>
                      ) : null}
                    </div>
                  ))}
                  {excerpts.length > 60 ? (
                    <div className="text-xs text-muted-foreground">仅展示前 60 条摘录。</div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {tab === "extracts" ? (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-border/50 bg-card/20 p-3">
              {extracts.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无提炼结果。</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {extracts.slice(0, 30).map((ex) => (
                    <div key={ex.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs rounded-md border border-border/60 bg-background/60 px-2 py-0.5">
                          {getExtractTypeLabel(ex.type)}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {new Date(ex.createdAt).toLocaleString("zh-CN")}
                        </div>
                      </div>
                      {ex.type === "key_cards" ? (
                        <div className="mt-2 flex flex-col gap-2">
                          {parseReferenceKeyCardsFromExtractBody(ex.body).slice(0, 12).map((c, idx) => (
                            <div key={`${c.kind}:${c.title}:${idx}`} className="rounded-md border border-border/50 bg-card/20 p-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5">
                                  {c.kind}
                                </span>
                                <div className="text-sm font-medium">{c.title}</div>
                                <div className="ml-auto">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button type="button" size="sm" variant="outline" onClick={() => applyKeyCardToWenceRefs(c)}>
                                      去问策引用
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" onClick={() => void jumpKeyCardToWritingHit(c)}>
                                      去写作定位
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" onClick={() => void applyKeyCardToAiDraft(c)}>
                                      写入草稿
                                    </Button>
                                    <Button type="button" size="sm" onClick={() => void applyKeyCardToWork(c)}>
                                      应用到作品
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="text-xs text-muted-foreground">仅预览前 12 张卡片。</div>
                        </div>
                      ) : (
                        <pre className="reference-extract-item-body" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                          {ex.body}
                        </pre>
                      )}
                    </div>
                  ))}
                  {extracts.length > 30 ? (
                    <div className="text-xs text-muted-foreground">仅展示前 30 条提炼结果。</div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
