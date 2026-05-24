import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { HouseholdAppData, HouseholdBaseline } from "@chore-helper/shared";
import { createChore, createHousehold, listHouseholds, saveBaseline } from "../api";
import type { ExistingChoreFormValues, HouseholdSetupState, SetupFormValues } from "../types";
import { parseFlooring, parseList } from "../utils/household";

type AppDataContextValue = {
  addExistingChore: (values: ExistingChoreFormValues) => Promise<void>;
  addHousehold: (name: string) => Promise<void>;
  householdSetup: HouseholdSetupState;
  households: HouseholdAppData[];
  isLoading: boolean;
  reloadHouseholds: () => Promise<void>;
  saveHouseholdContext: (values: SetupFormValues) => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

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

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [households, setHouseholds] = useState<HouseholdAppData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  async function reloadHouseholds() {
    setIsLoading(true);
    setLoadError(undefined);
    try {
      setHouseholds(await listHouseholds());
    } catch {
      setLoadError("We could not load your households.");
      setHouseholds([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setIsLoading(true);
      setLoadError(undefined);
      try {
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
  }, []);

  const activeHousehold = households[0];
  const householdSetup = useMemo(
    () => toHouseholdSetup(activeHousehold, isLoading, loadError),
    [activeHousehold, isLoading, loadError]
  );

  async function saveHouseholdContext(values: SetupFormValues) {
    const baseline: HouseholdBaseline = {
      homeType: values.homeType,
      rooms: parseList(values.rooms),
      flooring: parseFlooring(values.flooring),
      hasPets: values.hasPets,
      hasOutdoorSpace: values.hasOutdoorSpace,
      notes: values.notes
    };
    const household = activeHousehold ?? createEmptyHouseholdData(await createHousehold(values.householdName));
    const savedHousehold = await saveBaseline(household.id, baseline);
    const nextHousehold = {
      ...household,
      ...savedHousehold,
      baseline: savedHousehold.baseline ?? baseline
    };

    setHouseholds((currentHouseholds) => {
      const exists = currentHouseholds.some((candidate) => candidate.id === nextHousehold.id);
      if (!exists) return [nextHousehold, ...currentHouseholds];
      return currentHouseholds.map((candidate) =>
        candidate.id === nextHousehold.id ? nextHousehold : candidate
      );
    });
  }

  async function addExistingChore(values: ExistingChoreFormValues) {
    if (!activeHousehold) {
      throw new Error("Household context must be saved before adding chores.");
    }

    const chore = { ...(await createChore(activeHousehold.id, values)), recommendations: [] };
    setHouseholds((currentHouseholds) =>
      currentHouseholds.map((household) =>
        household.id === activeHousehold.id
          ? { ...household, chores: [...household.chores, chore] }
          : household
      )
    );
  }

  async function addHousehold(name: string) {
    const household = createEmptyHouseholdData(await createHousehold(name));
    setHouseholds((currentHouseholds) => [...currentHouseholds, household]);
  }

  const value = useMemo(
    () => ({
      addExistingChore,
      addHousehold,
      householdSetup,
      households,
      isLoading,
      reloadHouseholds,
      saveHouseholdContext
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
