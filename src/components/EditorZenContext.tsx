import { createContext, useContext, type ReactNode } from "react";

export type EditorZenContextValue = {
  /** 沉浸写作：隐藏顶栏、收起章列表与右栏，扩大正文区 */
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
