import type { Chore, HomeType, HouseholdBaseline } from "@chore-helper/shared";

export type Navigate = (path: string) => void;

export type HouseholdSetupState = {
  householdId?: string;
  householdName: string;
  baseline?: HouseholdBaseline;
  choreCount: number;
  setupComplete: boolean;
  isRestoring: boolean;
  restoreError?: string;
};

export type SetupFormValues = {
  householdName: string;
  homeType: HomeType;
  rooms: string;
  flooring: string;
  hasPets: boolean;
  hasOutdoorSpace: boolean;
  notes: string;
};

export type ExistingChoreFormValues = Omit<Chore, "id" | "householdId">;
