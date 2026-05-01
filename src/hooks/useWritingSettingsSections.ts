import { useCallback, useState } from "react";

/** 设定侧栏可统一收起/展开的折叠块（不含运行模式）。 */
export const WRITING_SETTINGS_SECTION_KEYS = ["style", "vars", "rag", "inject"] as const;

export type WritingSettingsSectionKey = (typeof WRITING_SETTINGS_SECTION_KEYS)[number];

function allClosed(): Record<WritingSettingsSectionKey, boolean> {
  return {
    style: false,
    vars: false,
    rag: false,
    inject: false,
  };
}

function allOpen(): Record<WritingSettingsSectionKey, boolean> {
  return {
    style: true,
    vars: true,
    rag: true,
    inject: true,
  };
}

export function useWritingSettingsSections() {
  const [open, setOpen] = useState<Record<WritingSettingsSectionKey, boolean>>(allClosed);

  const setSection = useCallback((key: WritingSettingsSectionKey, next: boolean) => {
    setOpen((prev) => ({ ...prev, [key]: next }));
  }, []);

  const collapseAll = useCallback(() => {
    setOpen(allClosed());
  }, []);

  const expandAll = useCallback(() => {
    setOpen(allOpen());
  }, []);

  return { sectionOpen: open, setSection, collapseAll, expandAll };
}
