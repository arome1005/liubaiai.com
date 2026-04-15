/* eslint-disable react-refresh/only-export-components -- 同文件导出 Provider 与配套 hook 为常见模式 */
import { createContext, useContext, type ReactNode } from "react";

export type EditorZenContextValue = {
  /** 沉浸写作：请求浏览器全屏（Fullscreen API）；写作 UI（顶栏、章栏、右栏）保持可用，区别于阅读向「全隐藏」 */
  zenWrite: boolean;
  setZenWrite: (v: boolean) => void;
};

const EditorZenContext = createContext<EditorZenContextValue | null>(null);

export function EditorZenProvider(props: { value: EditorZenContextValue; children: ReactNode }) {
  return <EditorZenContext.Provider value={props.value}>{props.children}</EditorZenContext.Provider>;
}

export function useEditorZen(): EditorZenContextValue {
  const v = useContext(EditorZenContext);
  if (!v) throw new Error("useEditorZen: must be used under EditorZenProvider");
  return v;
}
