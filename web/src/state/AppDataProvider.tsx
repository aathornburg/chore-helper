import { useEffect, useState } from "react";
import type { HouseholdAppData } from "@chore-helper/shared";
import { createHousehold, getCurrentUser, listHouseholds } from "../api";
import { AppDataContext } from "./useAppData";

export type AppDataContextValue = {
  addHousehold: (name: string) => Promise<void>;
  households: HouseholdAppData[];
  isLoading: boolean;
  loadError?: string;
  reloadHouseholds: () => Promise<void>;
};

type AppDataProviderProps = {
  authReady: boolean;
  children: React.ReactNode;
};

function createEmptyHouseholdData(
  household: { id: string; name: string; timeZone: string }
): HouseholdAppData {
  return {
    ...household,
    structure: { householdId: household.id, floors: [] },
    chores: [],
    recommendations: []
  };
}

export function AppDataProvider({ authReady, children }: AppDataProviderProps) {
  const [households, setHouseholds] = useState<HouseholdAppData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  async function reloadHouseholds() {
    if (!authReady) return;

    setLoadError(undefined);
    try {
      await getCurrentUser();
      setHouseholds(await listHouseholds());
    } catch {
      setLoadError("We could not load your households.");
      setHouseholds([]);
    }
  }

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function loadInitialData() {
      setIsLoading(true);
      setLoadError(undefined);
      try {
        await getCurrentUser();
        const loadedHouseholds = await listHouseholds();
        if (!cancelled) setHouseholds(loadedHouseholds);
      } catch {
        if (!cancelled) {
          setLoadError("We could not load your households.");
          setHouseholds([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [authReady]);

  async function addHousehold(name: string) {
    const household = createEmptyHouseholdData(await createHousehold(name));
    setHouseholds((currentHouseholds) => [...currentHouseholds, household]);
  }

  return (
    <AppDataContext.Provider value={{ addHousehold, households, isLoading, loadError, reloadHouseholds }}>
      {children}
    </AppDataContext.Provider>
  );
}
