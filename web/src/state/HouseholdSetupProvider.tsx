import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { HouseholdBaseline } from "@chore-helper/shared";
import { createChore, createHousehold, getHousehold, listChores, saveBaseline } from "../api";
import type { ExistingChoreFormValues, HouseholdSetupState, SetupFormValues } from "../types";
import { parseFlooring, parseList } from "../utils/household";

// Angular comparisons
// Every variable is private to the file, kind of like a module in Angular.
// The only way to share state is through React Context, which is kind of like an Angular Service.
// The provider component is like the service provider in Angular,
// and the useHouseholdSetup hook is like the service itself that components can inject to access the shared state and functions.
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

  // Angular comparisons
  // useEffect is like ngOnInit in Angular, it runs after the component mounts.
  // The empty dependency array means it only runs once, similar to how ngOnInit only runs once when the component is initialized.
  useEffect(() => {
    const savedHouseholdId = window.localStorage.getItem(householdStorageKey);
    if (!savedHouseholdId) return;
    const activeHouseholdId = savedHouseholdId;

    let cancelled = false;

    // Angular comparisons
    // This is like making an HTTP request in Angular and subscribing to the response.
    // If the component unmounts before the response comes back, we set a cancelled flag to avoid updating state on an unmounted component, which is similar to unsubscribing from an Observable in Angular to prevent memory leaks.
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

  // Angular comparisons
  // useMemo is like a computed property in Angular, it memoizes the value and only recomputes it
  // when the dependencies change. In this case, the context value will only be recreated
  // when the householdSetup state changes, which can help prevent unnecessary re-renders of components
  // that consume this context.
  const value = useMemo(
    () => ({
      addExistingChore,
      householdSetup,
      saveHouseholdContext
    }),
    [householdSetup]
  );

  // Angular comparisons
  // This is like providing a service in Angular and then injecting it into child components.
  // The HouseholdSetupContext.Provider is like the service provider, and any component
  // that calls useHouseholdSetup is like a component that injects the service to access the shared state and functions.
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
