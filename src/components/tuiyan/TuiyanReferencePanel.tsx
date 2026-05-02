import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { BookOpen, Link2, Search, Sparkles, X, Loader2 } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { ScrollArea } from "../ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import type { ReferenceLibraryEntry, TuiyanReferenceBinding, TuiyanReferencePolicy, TuiyanReferenceAspect } from "../../db/types"
import { useTuiyanReferenceRagSearch } from "../../hooks/useTuiyanReferenceRagSearch"
import { TuiyanReferenceGlobalPolicySection } from "./TuiyanReferenceGlobalPolicySection"
import { TuiyanRefBookConfigBlock } from "./TuiyanRefBookConfigBlock"
import { TuiyanReferenceRagHitCard } from "./TuiyanReferenceRagHitCard"
import { TuiyanReferenceRagSearchErrorBanner } from "./TuiyanReferenceRagSearchErrorBanner"

export interface TuiyanReferencePanelProps {
  /** 当前作品已关联的书目 id 列表 */
  linkedRefWorkIds: string[]
  /** 全部藏经书目（已加载） */
  refLibrary: ReferenceLibraryEntry[]
  /** 当前选中节点的关键词（自动预填搜索框） */
  currentNodeKeywords: string
  onLinkRef: (id: string) => void
  onUnlinkRef: (id: string) => void
  onApplyToOutline: (ref: ReferenceLibraryEntry) => void
  /** 将段落文本注入 AI 对话输入框并切换到对话 Tab */
  onInjectToChat: (text: string) => void
  /**
   * 以下可选：推演「参考仿写」策略配置；未传时与历史行为一致，不展示配置区。
   */
  referenceBindings?: TuiyanReferenceBinding[]
  referencePolicy?: TuiyanReferencePolicy
  onUpdateReferencePolicy?: (patch: Partial<TuiyanReferencePolicy>) => void
  onSetPrimaryRef?: (refWorkId: string) => void
  onUpdateReferenceBinding?: (
    refWorkId: string,
    patch: Partial<Pick<TuiyanReferenceBinding, "role" | "aspects" | "rangeMode" | "note" | "sectionIds">>,
  ) => void
  onToggleReferenceAspect?: (refWorkId: string, aspect: TuiyanReferenceAspect) => void
}

export function TuiyanReferencePanel({
  linkedRefWorkIds,
  refLibrary,
  currentNodeKeywords,
  onLinkRef,
  onUnlinkRef,
  onApplyToOutline,
  onInjectToChat,
  referenceBindings = [],
  referencePolicy,
  onUpdateReferencePolicy,
  onSetPrimaryRef,
  onUpdateReferenceBinding,
  onToggleReferenceAspect,
}: TuiyanReferencePanelProps) {
  const hasRefConfigUi =
    referencePolicy && onUpdateReferencePolicy && onSetPrimaryRef && onUpdateReferenceBinding && onToggleReferenceAspect
  const [linkRefOpen, setLinkRefOpen] = useState(false)
  const [linkRefQ, setLinkRefQ] = useState("")
  const [ragQuery, setRagQuery] = useState("")
  const { ragResults, ragLoading, ragError, runRagSearch, dismissRagError } = useTuiyanReferenceRagSearch({
    linkedRefWorkIds,
    referenceBindings,
    resetKey: currentNodeKeywords,
  })

  // 当节点切换时，用节点标题自动预填搜索词（但不自动触发搜索）
  useEffect(() => {
    setRagQuery(currentNodeKeywords)
  }, [currentNodeKeywords])

  const linkedRefs = useMemo(() => {
    const set = new Set(linkedRefWorkIds)
    return refLibrary.filter((r) => set.has(r.id))
  }, [refLibrary, linkedRefWorkIds])

  const filteredRefChoices = useMemo(() => {
    const q = linkRefQ.trim().toLowerCase()
    const linked = new Set(linkedRefWorkIds)
    const base = refLibrary.filter((r) => !linked.has(r.id))
    if (!q) return base
    return base.filter((r) => {
      const hay = `${r.title ?? ""}\n${r.category ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [refLibrary, linkedRefWorkIds, linkRefQ])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void runRagSearch(ragQuery)
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* 标题行 + 关联按钮 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">关联藏经</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setLinkRefOpen(true)}
            type="button"
          >
            <Link2 className="h-3.5 w-3.5" />
            关联书籍
          </Button>
        </div>

        {/* 关联书籍弹窗 */}
        <Dialog open={linkRefOpen} onOpenChange={setLinkRefOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>从藏经关联书籍</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={linkRefQ}
                onChange={(e) => setLinkRefQ(e.target.value)}
                placeholder="搜索书名 / 分类…"
                className="h-9"
              />
              <div className="max-h-[50vh] overflow-auto rounded-lg border border-border/40">
                {filteredRefChoices.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">暂无可关联书目。</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {filteredRefChoices.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{r.title}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {(r.category ?? "未分类") + ` · ${r.chunkCount} 段 · ${r.chapterHeadCount} 章`}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => onLinkRef(r.id)}>
                          关联
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>提示：更丰富的"提炼/标签/摘录"请在藏经页完成。</span>
                <Link to="/reference" className="text-primary hover:underline">
                  打开藏经
                </Link>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 已关联书目为空时的引导 */}
        {linkedRefs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/40 p-4 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">还没有关联藏经书目。</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setLinkRefOpen(true)}>
                <Link2 className="h-4 w-4" />
                关联书籍
              </Button>
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to="/reference">
                  <BookOpen className="h-4 w-4" />
                  浏览藏经
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* 节点感知搜索框（有已关联书目时才显示） */}
        {linkedRefs.length > 0 && hasRefConfigUi && referencePolicy && onUpdateReferencePolicy && (
          <TuiyanReferenceGlobalPolicySection policy={referencePolicy} onUpdatePolicy={onUpdateReferencePolicy} />
        )}

        {linkedRefs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">从关联书目中检索与当前节点相关的段落</p>
            <div className="flex gap-2">
              <Input
                value={ragQuery}
                onChange={(e) => {
                  setRagQuery(e.target.value)
                  if (ragError) dismissRagError()
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="输入关键词 / 节点标题…"
                className="h-8 text-sm flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 shrink-0"
                onClick={() => void runRagSearch(ragQuery)}
                disabled={ragLoading || !ragQuery.trim()}
                type="button"
              >
                {ragLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {ragError ? (
              <TuiyanReferenceRagSearchErrorBanner message={ragError} onDismiss={dismissRagError} />
            ) : null}

            {/* RAG 检索结果 */}
            {ragResults.length > 0 && (
              <div className="space-y-2">
                {ragResults.map((hit) => (
                  <TuiyanReferenceRagHitCard
                    key={hit.chunkId}
                    hit={hit}
                    onInjectToChat={onInjectToChat}
                    referenceBindings={referenceBindings}
                  />
                ))}
              </div>
            )}

            {/* 搜索完成但无结果（无错误时） */}
            {!ragLoading && !ragError && ragResults.length === 0 && ragQuery.trim() && (
              <p className="text-xs text-muted-foreground text-center py-2">
                未检索到相关段落。换个关键词试试，或先去<Link to="/reference" className="text-primary hover:underline mx-0.5">藏经</Link>导入原著。
              </p>
            )}
          </div>
        )}

        {/* 已关联书目列表 */}
        {linkedRefs.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">已关联 {linkedRefs.length} 部</h4>
            {linkedRefs.map((r) => {
              const binding = referenceBindings.find((b) => b.refWorkId === r.id)
              return (
              <div key={r.id} className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-medium text-foreground text-sm">{r.title}</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {(r.category ?? "未分类") + ` · ${r.chunkCount} 段 · ${r.chapterHeadCount} 章`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      asChild
                    >
                      <Link to={`/reference?ref=${encodeURIComponent(r.id)}&ord=0`}>
                        <BookOpen className="mr-1 h-3.5 w-3.5" />
                        打开
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => onUnlinkRef(r.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {hasRefConfigUi && binding && onSetPrimaryRef && onUpdateReferenceBinding && onToggleReferenceAspect && (
                  <TuiyanRefBookConfigBlock
                    binding={binding}
                    onSetPrimary={() => onSetPrimaryRef(r.id)}
                    onToggleAspect={(a) => onToggleReferenceAspect(r.id, a)}
                    onRangeChange={(rangeMode) =>
                      onUpdateReferenceBinding(r.id, {
                        rangeMode,
                        ...(rangeMode !== "selected_sections" ? { sectionIds: [] } : {}),
                      })
                    }
                    onNoteChange={(note) => onUpdateReferenceBinding(r.id, { note })}
                    onSectionIdsChange={(sectionIds) => onUpdateReferenceBinding(r.id, { sectionIds })}
                  />
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-2 text-xs"
                  onClick={() => onApplyToOutline(r)}
                  type="button"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  应用到当前大纲（写入文策）
                </Button>
              </div>
            )
          })}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
