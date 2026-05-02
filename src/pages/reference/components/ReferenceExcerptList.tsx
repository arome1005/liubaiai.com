import React from "react";
import { Button } from "../../../components/ui/button";
import { Wand2 } from "lucide-react";
import type { ReferenceExcerpt, ReferenceTag, Chapter, Work } from "../../../db/types";

// ── 子组件 1：过滤面板 ────────────────────────────────────────────────────────
interface ReferenceExcerptFiltersProps {
  allTags: ReferenceTag[];
  excerptTagFilterId: string;
  setExcerptTagFilterId: (id: string) => void;
  progressFilterEnabled: boolean;
  setProgressFilterEnabled: (enabled: boolean) => void;
  progressFilterWorkId: string;
  setProgressFilterWorkId: (id: string) => void;
  worksList: Work[];
  lsRefProgressFilterKey: string;
  lsRefProgressWorkKey: string;
}

export function ReferenceExcerptFilters({
  allTags,
  excerptTagFilterId,
  setExcerptTagFilterId,
  progressFilterEnabled,
  setProgressFilterEnabled,
  progressFilterWorkId,
  setProgressFilterWorkId,
  worksList,
  lsRefProgressFilterKey,
  lsRefProgressWorkKey,
}: ReferenceExcerptFiltersProps) {
  return (
    <section aria-labelledby="ref-panel-excerpt-filters">
      <h2 id="ref-panel-excerpt-filters" className="mb-3 text-sm font-medium text-foreground">摘录与进度</h2>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          摘录按标签筛选
          <select
            className="input reference-category-select ml-auto"
            value={excerptTagFilterId}
            onChange={(e) => setExcerptTagFilterId(e.target.value)}
          >
            <option value="">全部</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={progressFilterEnabled}
            className="mt-0.5"
            onChange={(e) => {
              const v = e.target.checked;
              setProgressFilterEnabled(v);
              try { localStorage.setItem(lsRefProgressFilterKey, v ? "1" : "0"); } catch { /* ignore */ }
            }}
          />
          <span>摘录仅保留关联章节在<strong>写作进度前</strong>（与全书「仅进度前」一致）</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          进度参照作品
          <select
            className="input reference-category-select ml-auto"
            value={progressFilterWorkId}
            disabled={!progressFilterEnabled}
            onChange={(e) => {
              const v = e.target.value;
              setProgressFilterWorkId(v);
              try { localStorage.setItem(lsRefProgressWorkKey, v); } catch { /* ignore */ }
            }}
          >
            <option value="">选择作品</option>
            {worksList.map((w) => (
              <option key={w.id} value={w.id}>{w.title}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

// ── 子组件 2：摘录列表与编辑表单 ────────────────────────────────────────────────
type ExtendedExcerpt = ReferenceExcerpt & { tagIds: string[] };

interface ReferenceExcerptListProps {
  excerpts: ExtendedExcerpt[];
  visibleExcerpts: ExtendedExcerpt[];
  allTags: ReferenceTag[];
  editingExcerptId: string | null;
  editNote: string;
  setEditNote: (note: string) => void;
  editTagIds: string[];
  setEditTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  editLinkedWorkId: string;
  setEditLinkedWorkId: (id: string) => void;
  editLinkedChapterId: string;
  setEditLinkedChapterId: (id: string) => void;
  worksList: Work[];
  editChapters: Chapter[];
  beginEditExcerpt: (ex: ExtendedExcerpt) => void;
  saveExcerptEdit: () => Promise<void>;
  cancelEditExcerpt: () => void;
  removeExcerpt: (id: string) => Promise<void>;
  jumpExcerptToReader: (ex: ReferenceExcerpt) => Promise<void>;
  sendExcerptToWritingAsRef: (ex: ReferenceExcerpt) => Promise<void>;
  openPromptExtractFromExcerpt: (ex: ReferenceExcerpt) => void;
}

export function ReferenceExcerptList({
  excerpts,
  visibleExcerpts,
  allTags,
  editingExcerptId,
  editNote,
  setEditNote,
  editTagIds,
  setEditTagIds,
  editLinkedWorkId,
  setEditLinkedWorkId,
  editLinkedChapterId,
  setEditLinkedChapterId,
  worksList,
  editChapters,
  beginEditExcerpt,
  saveExcerptEdit,
  cancelEditExcerpt,
  removeExcerpt,
  jumpExcerptToReader,
  sendExcerptToWritingAsRef,
  openPromptExtractFromExcerpt,
}: ReferenceExcerptListProps) {
  if (excerpts.length === 0) return null;

  return (
    <div className="reference-excerpts">
      <div className="reference-excerpts-title">本书摘录</div>
      {visibleExcerpts.length === 0 ? (
        <p className="muted small">当前筛选下无摘录，请调整标签或进度过滤。</p>
      ) : null}
      <ul>
        {visibleExcerpts.map((ex) => (
          <li key={ex.id} className="reference-excerpt-item">
            <blockquote className="reference-excerpt-quote">{ex.text}</blockquote>
            {ex.note ? <p className="small muted">{ex.note}</p> : null}
            <div className="reference-excerpt-chips">
              {ex.tagIds.map((tid: string) => {
                const tg = allTags.find((x) => x.id === tid);
                return tg ? (
                  <span key={tid} className="reference-excerpt-chip">
                    {tg.name}
                  </span>
                ) : null;
              })}
              {ex.linkedChapterId ? (
                <span className="reference-excerpt-chip reference-excerpt-chip--link">
                  已关联创作章
                </span>
              ) : null}
            </div>
            <div className="reference-excerpt-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void jumpExcerptToReader(ex)}
              >
                跳转到原文
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void sendExcerptToWritingAsRef(ex)}
              >
                去写作引用
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => beginEditExcerpt(ex)}
              >
                编辑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-primary hover:text-primary"
                onClick={() => openPromptExtractFromExcerpt(ex)}
              >
                <Wand2 className="h-3.5 w-3.5" />
                提炼为提示词
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void removeExcerpt(ex.id)}
              >
                删除
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editingExcerptId ? (
        <div className="reference-excerpt-edit-panel">
          <div className="small muted">编辑摘录</div>
          <label className="reference-excerpt-edit-label">
            备注
            <textarea
              className="input reference-excerpt-note"
              rows={2}
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
            />
          </label>
          <div className="reference-excerpt-edit-tags">
            <span className="small muted">标签</span>
            <div className="reference-excerpt-tag-checks">
              {allTags.map((t) => (
                <label key={t.id} className="reference-excerpt-tag-check">
                  <input
                    type="checkbox"
                    checked={editTagIds.includes(t.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditTagIds((prev) => [...prev, t.id]);
                      } else {
                        setEditTagIds((prev) => prev.filter((id) => id !== t.id));
                      }
                    }}
                  />{" "}
                  {t.name}
                </label>
              ))}
            </div>
          </div>
          <label className="reference-excerpt-edit-label">
            关联原创作品（3.6 弱关联）
            <select
              className="input"
              value={editLinkedWorkId}
              onChange={(e) => {
                setEditLinkedWorkId(e.target.value);
                setEditLinkedChapterId("");
              }}
            >
              <option value="">不关联</option>
              {worksList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </label>
          <label className="reference-excerpt-edit-label">
            关联章节
            <select
              className="input"
              value={editLinkedChapterId}
              disabled={!editLinkedWorkId}
              onChange={(e) => setEditLinkedChapterId(e.target.value)}
            >
              <option value="">选择章节</option>
              {editChapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <div className="reference-excerpt-edit-btns">
            <Button type="button" size="sm" onClick={() => void saveExcerptEdit()}>
              保存
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEditExcerpt}
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
