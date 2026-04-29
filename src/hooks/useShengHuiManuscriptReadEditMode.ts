import { useCallback, useEffect, useState } from "react";

/**
 * 生辉 N1：主稿「阅读渲染 / 源文本编辑」双态。生成中流式必须可写 textarea，故 busy 时强制进入编辑态。
 */
export function useShengHuiManuscriptReadEditMode(output: string, busy: boolean) {
  const [isEditing, setIsEditing] = useState(() => {
    if (busy) return true;
    return !output.trim();
  });

  useEffect(() => {
    if (busy) {
      setIsEditing(true);
    }
  }, [busy]);

  const enterEdit = useCallback(() => setIsEditing(true), []);
  const exitEdit = useCallback(() => {
    if (!busy) setIsEditing(false);
  }, [busy]);

  return { isEditing, setIsEditing, enterEdit, exitEdit };
}
