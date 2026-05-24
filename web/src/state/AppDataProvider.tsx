import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { HouseholdAppData, HouseholdBaseline } from "@chore-helper/shared";
import { createHousehold, getCurrentUser, listHouseholds } from "../api";
import type { HouseholdSetupState } from "../types";

type AppDataContextValue = {
  addHousehold: (name: string) => Promise<void>;
  householdSetup: HouseholdSetupState;
  households: HouseholdAppData[];
  isLoading: boolean;
  reloadHouseholds: () => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

type AppDataProviderProps = {
  authReady: boolean;
  children: React.ReactNode;
};

const initialHouseholdSetup: HouseholdSetupState = {
  householdName: "Home",
  choreCount: 0,
  setupComplete: false,
  isRestoring: true
};

function isSetupComplete(baseline: HouseholdBaseline | undefined, choreCount: number) {
  return Boolean(baseline) && choreCount > 0;
}

function toHouseholdSetup(
  household: HouseholdAppData | undefined,
  isLoading: boolean,
  loadError?: string
): HouseholdSetupState {
  if (!household) {
    return {
      ...initialHouseholdSetup,
      isRestoring: isLoading,
      restoreError: loadError
    };
  }

  return {
    householdId: household.id,
    householdName: household.name,
    baseline: household.baseline,
    choreCount: household.chores.length,
    setupComplete: isSetupComplete(household.baseline, household.chores.length),
    isRestoring: isLoading,
    restoreError: loadError
  };
}

function createEmptyHouseholdData(
  household: { id: string; name: string; baseline?: HouseholdBaseline }
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

    setIsLoading(true);
    setLoadError(undefined);
    try {
      await getCurrentUser();
      setHouseholds(await listHouseholds());
    } catch {
      setLoadError("We could not load your households.");
      setHouseholds([]);
    } finally {
      setIsLoading(false);
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

  // Compatibility bridge for pages not yet converted to all-household data.
  const householdSetup = useMemo(
    () => toHouseholdSetup(households[0], isLoading, loadError),
    [households, isLoading, loadError]
  );

  async function addHousehold(name: string) {
    const household = createEmptyHouseholdData(await createHousehold(name));
    setHouseholds((currentHouseholds) => [...currentHouseholds, household]);
  }

  const value = useMemo(
    () => ({
      addHousehold,
      householdSetup,
      households,
      isLoading,
      reloadHouseholds
    }),
    [householdSetup, households, isLoading]
  );

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider.");
  }

  return context;
}
