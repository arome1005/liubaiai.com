import { createContext, useContext } from "react";

export type RightRailTabId = "ai" | "summary" | "bible" | "ref";

export type RightRailTab = {
  id: RightRailTabId;
  label: string;
  icon?: string;
  content: React.ReactNode | null;
  enabled: boolean;
};

export type RightRailApi = {
  tabs: RightRailTab[];
  activeTab: RightRailTabId;
  setActiveTab: (id: RightRailTabId) => void;
  setTabEnabled: (id: RightRailTabId, enabled: boolean) => void;
  setTabContent: (id: RightRailTabId, node: React.ReactNode | null) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const RightRailContext = createContext<RightRailApi | null>(null);

export function useRightRail(): RightRailApi {
  const ctx = useContext(RightRailContext);
  if (!ctx) {
    return {
      tabs: [
        { id: "ai", label: "AI", icon: "✨", content: null, enabled: true },
        { id: "summary", label: "概要", icon: "🗂", content: null, enabled: true },
        { id: "bible", label: "锦囊", icon: "📖", content: null, enabled: true },
        { id: "ref", label: "参考", icon: "📎", content: null, enabled: true },
      ],
      activeTab: "ai",
      setActiveTab: () => {},
      setTabEnabled: () => {},
      setTabContent: () => {},
      open: false,
      setOpen: () => {},
    };
  }
  return ctx;
}

