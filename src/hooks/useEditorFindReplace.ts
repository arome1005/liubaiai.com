import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CodeMirrorEditorHandle } from "../components/CodeMirrorEditor";
import { replaceAllLiteral } from "../util/text-replace";

interface ImperativeDialog {
  confirm: (message: string) => Promise<boolean>;
}

export interface UseEditorFindReplaceParams {
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  editorRef: React.RefObject<CodeMirrorEditorHandle | null>;
  imperativeDialog: ImperativeDialog;
}

export function useEditorFindReplace({
  content,
  setContent,
  editorRef,
  imperativeDialog,
}: UseEditorFindReplaceParams) {
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const [replaceQ, setReplaceQ] = useState("");
  const [findStep, setFindStep] = useState(0);

  const findPositions = useMemo<number[]>(() => {
    if (!findQ) return [];
    const positions: number[] = [];
    let i = 0;
    while (i <= content.length - findQ.length) {
      const idx = content.indexOf(findQ, i);
      if (idx < 0) break;
      positions.push(idx);
      i = idx + findQ.length;
    }
    return positions;
  }, [content, findQ]);

  useEffect(() => {
    setFindStep(0);
  }, [findQ]);

  function handleFindNext() {
    if (findPositions.length === 0) return;
    const next = (findStep + 1) % findPositions.length;
    setFindStep(next);
    editorRef.current?.scrollToMatch(findQ, false, findPositions[next]);
  }

  function handleReplaceFirst() {
    if (!findQ) {
      toast.info("请先输入查找内容。");
      return;
    }
    if (findPositions.length === 0) {
      toast.info("未找到匹配内容。");
      return;
    }
    const pos = findPositions[findStep % findPositions.length];
    setContent((prev) => prev.slice(0, pos) + replaceQ + prev.slice(pos + findQ.length));
    setFindStep(0);
  }

  async function handleReplaceAll() {
    if (!findQ) {
      toast.info("请先输入查找内容。");
      return;
    }
    const count = findPositions.length;
    if (count === 0) {
      toast.info("未找到匹配内容。");
      return;
    }
    if (!(await imperativeDialog.confirm(`将本章中全部「${findQ}」替换为「${replaceQ}」？`))) return;
    setContent((prev) => replaceAllLiteral(prev, findQ, replaceQ));
    setFindStep(0);
    toast.success(`已替换 ${count} 处`);
  }

  return {
    findOpen,
    setFindOpen,
    findQ,
    setFindQ,
    replaceQ,
    setReplaceQ,
    findStep,
    findPositions,
    handleFindNext,
    handleReplaceFirst,
    handleReplaceAll,
  };
}
