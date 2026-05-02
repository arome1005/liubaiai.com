import { useState, useCallback, useEffect } from "react";
import {
  listChapters,
  listReferenceTags,
  updateReferenceExcerpt,
  createReferenceTag,
} from "../../../db/repo";
import type {
  Chapter,
  ReferenceExcerpt,
  ReferenceTag,
} from "../../../db/types";

interface UseExcerptEditFormProps {
  activeRefId: string | null;
  loadExcerpts: (refId: string) => Promise<void>;
}

export function useExcerptEditForm({
  activeRefId,
  loadExcerpts,
}: UseExcerptEditFormProps) {
  // ── 编辑表单状态 ──────────────────────────────────────────────────────────
  const [editingExcerptId, setEditingExcerptId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [editLinkedWorkId, setEditLinkedWorkId] = useState<string>("");
  const [editLinkedChapterId, setEditLinkedChapterId] = useState<string>("");
  const [editChapters, setEditChapters] = useState<Chapter[]>([]);

  // ── 标签管理 ──────────────────────────────────────────────────────────────
  const [allTags, setAllTags] = useState<ReferenceTag[]>([]);
  const [newTagName, setNewTagName] = useState("");

  // ── 初始加载标签 ──────────────────────────────────────────────────────────
  useEffect(() => {
    void listReferenceTags().then(setAllTags);
  }, []);

  // ── 关联作品变化时加载章节列表 ──────────────────────────────────────────
  useEffect(() => {
    if (!editLinkedWorkId) {
      setEditChapters([]);
      return;
    }
    void listChapters(editLinkedWorkId).then((c) => {
      setEditChapters([...c].sort((a, b) => a.order - b.order));
    });
  }, [editLinkedWorkId]);

  // ── 开始编辑摘录 ──────────────────────────────────────────────────────────
  const beginEditExcerpt = useCallback((ex: ReferenceExcerpt & { tagIds: string[] }) => {
    setEditingExcerptId(ex.id);
    setEditNote(ex.note);
    setEditTagIds([...ex.tagIds]);
    setEditLinkedWorkId(ex.linkedWorkId ?? "");
    setEditLinkedChapterId(ex.linkedChapterId ?? "");
  }, []);

  // ── 保存编辑 ──────────────────────────────────────────────────────────────
  const saveExcerptEdit = useCallback(async () => {
    if (!editingExcerptId) return;
    await updateReferenceExcerpt(editingExcerptId, {
      note: editNote.trim(),
      tagIds: editTagIds,
      linkedWorkId: editLinkedWorkId || null,
      linkedChapterId: editLinkedWorkId && editLinkedChapterId ? editLinkedChapterId : null,
    });
    if (activeRefId) await loadExcerpts(activeRefId);
    setEditingExcerptId(null);
    setAllTags(await listReferenceTags());
  }, [editingExcerptId, editNote, editTagIds, editLinkedWorkId, editLinkedChapterId, activeRefId, loadExcerpts]);

  // ── 取消编辑 ──────────────────────────────────────────────────────────────
  const cancelEditExcerpt = useCallback(() => {
    setEditingExcerptId(null);
  }, []);

  // ── 创建新标签 ──────────────────────────────────────────────────────────
  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim()) return;
    await createReferenceTag(newTagName);
    setNewTagName("");
    setAllTags(await listReferenceTags());
  }, [newTagName]);

  // ── 刷新标签（外部删除标签后调用） ─────────────────────────────────────
  const refreshTags = useCallback(async () => {
    setAllTags(await listReferenceTags());
  }, []);

  return {
    // 编辑状态
    editingExcerptId,
    setEditingExcerptId,
    editNote,
    setEditNote,
    editTagIds,
    setEditTagIds,
    editLinkedWorkId,
    setEditLinkedWorkId,
    editLinkedChapterId,
    setEditLinkedChapterId,
    editChapters,
    // 标签
    allTags,
    newTagName,
    setNewTagName,
    // 方法
    beginEditExcerpt,
    saveExcerptEdit,
    cancelEditExcerpt,
    handleCreateTag,
    refreshTags,
  };
}
