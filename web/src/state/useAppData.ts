import { createContext, useContext } from "react";
import type { AppDataContextValue } from "./AppDataProvider";

export const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider.");
  }

  return context;
}
