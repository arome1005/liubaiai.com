import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { BibleCharacter, BibleGlossaryTerm } from "../../db/types";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export type StudyLibraryTab = "characters" | "terms";

export function StudyLibraryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  tab: StudyLibraryTab;
  onTabChange: (tab: StudyLibraryTab) => void;
  characters: BibleCharacter[];
  glossaryTerms: BibleGlossaryTerm[];
  onRefresh: () => void | Promise<void>;
  addCharacter: (workId: string, input: Partial<Omit<BibleCharacter, "id" | "workId" | "createdAt" | "updatedAt">>) => Promise<BibleCharacter>;
  updateCharacter: (id: string, patch: Partial<Omit<BibleCharacter, "id" | "workId">>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  reorderCharacters: (workId: string, orderedIds: string[]) => Promise<void>;
  addGlossaryTerm: (
    workId: string,
    input: Partial<Omit<BibleGlossaryTerm, "id" | "workId" | "createdAt" | "updatedAt">>,
  ) => Promise<BibleGlossaryTerm>;
  updateGlossaryTerm: (id: string, patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>) => Promise<void>;
  deleteGlossaryTerm: (id: string) => Promise<void>;
}) {
  const [filterQuery, setFilterQuery] = useState("");

  const filteredCharacters = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return props.characters;
    return props.characters.filter((c) => {
      const blob = `${c.name}\n${c.motivation}\n${c.relationships}\n${c.voiceNotes}\n${c.taboos}`.toLowerCase();
      return blob.includes(q);
    });
  }, [filterQuery, props.characters]);

  const filteredGlossary = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return props.glossaryTerms;
    return props.glossaryTerms.filter((g) => `${g.term}\n${g.note}`.toLowerCase().includes(q));
  }, [filterQuery, props.glossaryTerms]);

  function swapOrderIds(list: BibleCharacter[], id: string, dir: -1 | 1): string[] | null {
    const idx = list.findIndex((x) => x.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= list.length) return null;
    const next = list.map((x) => x.id);
    const t = next[idx]!;
    next[idx] = next[j]!;
    next[j] = t;
    return next;
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        overlayClassName="work-form-modal-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "z-[var(--z-modal-app-content)] max-h-[min(92vh,920px)] w-full max-w-[min(920px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg",
        )}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
          <DialogTitle className="text-left text-lg font-semibold">书斋</DialogTitle>
          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="outline" size="sm">
              <Link to={`/work/${props.workId}/bible`} onClick={() => props.onOpenChange(false)}>
                打开锦囊页
              </Link>
            </Button>
            <button type="button" className="icon-btn" title="关闭" onClick={() => props.onOpenChange(false)}>
              ×
            </button>
          </div>
        </DialogHeader>

        <div className="px-4 pb-4 pt-3 sm:px-5">
          <Tabs value={props.tab} onValueChange={(v) => props.onTabChange(v as StudyLibraryTab)}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="characters">人物</TabsTrigger>
              <TabsTrigger value="terms">词条</TabsTrigger>
            </TabsList>

            <div className="mt-3">
              <input
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder={props.tab === "characters" ? "搜索（姓名/动机/关系/口吻/禁忌）…" : "搜索（词条/备注）…"}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>

            <TabsContent value="characters" className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void (async () => {
                      try {
                        await props.addCharacter(props.workId, { name: "新人物" });
                        await props.onRefresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "添加失败");
                      }
                    })()
                  }
                >
                  + 添加人物
                </Button>
              </div>
              <ul className="bible-card-list mt-3 max-h-[min(62vh,640px)] overflow-auto pr-1">
                {filteredCharacters.map((c) => (
                  <li key={c.id} className="bible-card relative">
                    <div className="bible-card-head">
                      <input
                        className="bible-input-title"
                        defaultValue={c.name}
                        key={`name-${c.id}-${c.updatedAt}`}
                        onBlur={(e) =>
                          void (async () => {
                            try {
                              await props.updateCharacter(c.id, { name: e.target.value });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                      />
                      <div className="bible-card-actions">
                        <Button
                          type="button"
                          title="上移"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void (async () => {
                              try {
                                const ids = swapOrderIds(props.characters, c.id, -1);
                                if (!ids) return;
                                await props.reorderCharacters(props.workId, ids);
                                await props.onRefresh();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "排序失败");
                              }
                            })()
                          }
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          title="下移"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void (async () => {
                              try {
                                const ids = swapOrderIds(props.characters, c.id, 1);
                                if (!ids) return;
                                await props.reorderCharacters(props.workId, ids);
                                await props.onRefresh();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "排序失败");
                              }
                            })()
                          }
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (!window.confirm("删除该人物卡？")) return;
                            void (async () => {
                              try {
                                await props.deleteCharacter(c.id);
                                await props.onRefresh();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "删除失败");
                              }
                            })();
                          }}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                    <label className="bible-field">
                      <span>动机</span>
                      <textarea
                        defaultValue={c.motivation}
                        key={`mot-${c.id}-${c.updatedAt}`}
                        onBlur={(e) =>
                          void (async () => {
                            try {
                              await props.updateCharacter(c.id, { motivation: e.target.value });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                        rows={2}
                      />
                    </label>
                    <label className="bible-field">
                      <span>关系</span>
                      <textarea
                        defaultValue={c.relationships}
                        key={`rel-${c.id}-${c.updatedAt}`}
                        onBlur={(e) =>
                          void (async () => {
                            try {
                              await props.updateCharacter(c.id, { relationships: e.target.value });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                        rows={2}
                      />
                    </label>
                    <label className="bible-field">
                      <span>口吻</span>
                      <textarea
                        defaultValue={c.voiceNotes}
                        key={`voice-${c.id}-${c.updatedAt}`}
                        onBlur={(e) =>
                          void (async () => {
                            try {
                              await props.updateCharacter(c.id, { voiceNotes: e.target.value });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                        rows={2}
                      />
                    </label>
                    <label className="bible-field">
                      <span>禁忌</span>
                      <textarea
                        defaultValue={c.taboos}
                        key={`tab-${c.id}-${c.updatedAt}`}
                        onBlur={(e) =>
                          void (async () => {
                            try {
                              await props.updateCharacter(c.id, { taboos: e.target.value });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                        rows={2}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              {props.characters.length === 0 ? <p className="muted small">暂无</p> : null}
            </TabsContent>

            <TabsContent value="terms" className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void (async () => {
                      try {
                        await props.addGlossaryTerm(props.workId, { term: "新术语", category: "term", note: "" });
                        await props.onRefresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "添加失败");
                      }
                    })()
                  }
                >
                  + 添加词条
                </Button>
              </div>
              <ul className="bible-card-list mt-3 max-h-[min(62vh,640px)] overflow-auto pr-1">
                {filteredGlossary.map((g) => (
                  <li key={g.id} className="bible-card relative">
                    <div className="bible-card-head">
                      <input
                        className="bible-input-title"
                        defaultValue={g.term}
                        key={`gt-${g.id}-${g.updatedAt}`}
                        onBlur={(e) =>
                          void (async () => {
                            try {
                              await props.updateGlossaryTerm(g.id, { term: e.target.value });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                      />
                      <select
                        value={g.category}
                        onChange={(e) =>
                          void (async () => {
                            try {
                              await props.updateGlossaryTerm(g.id, {
                                category: e.target.value as BibleGlossaryTerm["category"],
                              });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                      >
                        <option value="name">人名</option>
                        <option value="term">术语</option>
                        <option value="dead">已死</option>
                      </select>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (!window.confirm("删除该词条？")) return;
                          void (async () => {
                            try {
                              await props.deleteGlossaryTerm(g.id);
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "删除失败");
                            }
                          })();
                        }}
                      >
                        删除
                      </Button>
                    </div>
                    <label className="bible-field">
                      <span>备注</span>
                      <textarea
                        defaultValue={g.note}
                        key={`gn-${g.id}-${g.updatedAt}`}
                        onBlur={(e) =>
                          void (async () => {
                            try {
                              await props.updateGlossaryTerm(g.id, { note: e.target.value });
                              await props.onRefresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "保存失败");
                            }
                          })()
                        }
                        rows={2}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              {props.glossaryTerms.length === 0 ? <p className="muted small">暂无</p> : null}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
