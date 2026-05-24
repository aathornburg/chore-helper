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

/*
  This context provider is similar to an Angular service provided in the
  root injector. It supplies shared state and actions to components within
  the provider tree.
*/
const initialHouseholdSetup: HouseholdSetupState = {
  householdName: "Home",
  choreCount: 0,
  setupComplete: false,
  isRestoring: false
};

function isSetupComplete(baseline: HouseholdBaseline | undefined, choreCount: number) {
  return Boolean(baseline) && choreCount > 0;
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [householdSetup, setHouseholdSetup] = useState<HouseholdSetupState>(() => ({
    ...initialHouseholdSetup,
    isRestoring: Boolean(window.localStorage.getItem(householdStorageKey))
  }));

  /*
    This effect behaves like Angular's `ngOnInit` in a root service or
    component. It restores persisted state from localStorage when the
    app starts.
  */
  useEffect(() => {

    // Will be replaced by a call to get ALL household data on page load
    // using he user's authenticated session

    // const savedHouseholdId = window.localStorage.getItem(householdStorageKey);
    // if (!savedHouseholdId) return;
    // const activeHouseholdId = savedHouseholdId;

    let cancelled = false;

    // async function restoreHousehold() {
    //   try {
    //     const household = await getHousehold(activeHouseholdId);
    //     const chores = await listChores(activeHouseholdId);
    //     if (cancelled) return;

    //     setHouseholdSetup({
    //       householdId: household.id,
    //       householdName: household.name,
    //       baseline: household.baseline,
    //       choreCount: chores.length,
    //       setupComplete: isSetupComplete(household.baseline, chores.length),
    //       isRestoring: false,
    //       restoreError: undefined
    //     });
    //   } catch {
    //     if (cancelled) return;

    //     if (window.localStorage.getItem(householdStorageKey) === activeHouseholdId) {
    //       window.localStorage.removeItem(householdStorageKey);
    //     }

    //     setHouseholdSetup({
    //       ...initialHouseholdSetup,
    //       isRestoring: false,
    //       restoreError: "We could not restore your saved household. Start setup again."
    //     });
    //   }
    // }

    // void restoreHousehold();

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
      setupComplete: isSetupComplete(savedHousehold.baseline ?? baseline, currentSetup.choreCount),
      isRestoring: false,
      restoreError: undefined
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

  /*
    `useMemo` is used to keep the provider value stable unless the
    contained household state changes. This is similar to Angular's
    `OnPush` strategy or memoized selector patterns that avoid unnecessary
    change detection / re-renders.
  */
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
