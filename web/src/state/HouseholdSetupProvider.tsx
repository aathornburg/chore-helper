import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { HouseholdBaseline } from "@chore-helper/shared";
import { createChore, createHousehold, getHousehold, listChores, saveBaseline } from "../api";
import type { ExistingChoreFormValues, HouseholdSetupState, SetupFormValues } from "../types";
import { parseFlooring, parseList } from "../utils/household";

const householdStorageKey = "chore-helper:household-id";

type HouseholdSetupContextValue = {
  addExistingChore: (values: ExistingChoreFormValues) => Promise<void>;
  householdSetup: HouseholdSetupState;
  saveHouseholdContext: (values: SetupFormValues) => Promise<void>;
};

const HouseholdSetupContext = createContext<HouseholdSetupContextValue | undefined>(undefined);

const initialHouseholdSetup: HouseholdSetupState = {
  householdName: "Home",
  choreCount: 0,
  setupComplete: false
};

function isSetupComplete(baseline: HouseholdBaseline | undefined, choreCount: number) {
  return Boolean(baseline) && choreCount > 0;
}

export function HouseholdSetupProvider({ children }: { children: React.ReactNode }) {
  const [householdSetup, setHouseholdSetup] =
    useState<HouseholdSetupState>(initialHouseholdSetup);

  useEffect(() => {
    const savedHouseholdId = window.localStorage.getItem(householdStorageKey);
    if (!savedHouseholdId) return;
    const activeHouseholdId = savedHouseholdId;

    let cancelled = false;

    async function restoreHousehold() {
      try {
        const household = await getHousehold(activeHouseholdId);
        const chores = await listChores(activeHouseholdId);
        if (cancelled) return;

        setHouseholdSetup({
          householdId: household.id,
          householdName: household.name,
          baseline: household.baseline,
          choreCount: chores.length,
          setupComplete: isSetupComplete(household.baseline, chores.length)
        });
      } catch {
        window.localStorage.removeItem(householdStorageKey);
      }
    }

    void restoreHousehold();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveHouseholdContext(values: SetupFormValues) {
    const baseline: HouseholdBaseline = {
      homeType: values.homeType,
      rooms: parseList(values.rooms),
      flooring: parseFlooring(values.flooring),
      hasPets: values.hasPets,
      hasOutdoorSpace: values.hasOutdoorSpace,
      notes: values.notes
    };
    const existingHouseholdId = householdSetup.householdId;
    const household = existingHouseholdId
      ? { id: existingHouseholdId, name: values.householdName }
      : await createHousehold(values.householdName);
    const savedHousehold = await saveBaseline(household.id, baseline);

    setHouseholdSetup((currentSetup) => ({
      householdId: household.id,
      householdName: savedHousehold.name || household.name || values.householdName,
      baseline: savedHousehold.baseline ?? baseline,
      choreCount: currentSetup.choreCount,
      setupComplete: isSetupComplete(savedHousehold.baseline ?? baseline, currentSetup.choreCount)
    }));
    window.localStorage.setItem(householdStorageKey, household.id);
  }

  async function addExistingChore(values: ExistingChoreFormValues) {
    if (!householdSetup.householdId) {
      throw new Error("Household context must be saved before adding chores.");
    }

    await createChore(householdSetup.householdId, values);
    setHouseholdSetup((currentSetup) => {
      const choreCount = currentSetup.choreCount + 1;

      return {
        ...currentSetup,
        choreCount,
        setupComplete: isSetupComplete(currentSetup.baseline, choreCount)
      };
    });
  }

  const value = useMemo(
    () => ({
      addExistingChore,
      householdSetup,
      saveHouseholdContext
    }),
    [householdSetup]
  );

  return (
    <HouseholdSetupContext.Provider value={value}>
      {children}
    </HouseholdSetupContext.Provider>
  );
}

export function useHouseholdSetup() {
  const context = useContext(HouseholdSetupContext);

  if (!context) {
    throw new Error("useHouseholdSetup must be used within HouseholdSetupProvider.");
  }

  return context;
}
