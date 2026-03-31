import { createContext, useContext } from "react";

export type TopbarApi = {
  setTitleNode: (node: React.ReactNode | null) => void;
  setActionsNode: (node: React.ReactNode | null) => void;
};

export const TopbarContext = createContext<TopbarApi | null>(null);

export function useTopbar(): TopbarApi {
  const ctx = useContext(TopbarContext);
  if (!ctx) {
    return { setTitleNode: () => {}, setActionsNode: () => {} };
  }
  return ctx;
}

