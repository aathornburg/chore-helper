import type { HomeType, HouseholdBaseline } from "@chore-helper/shared";

export type Navigate = (path: string) => void;

export type HouseholdSetupState = {
  householdId?: string;
  householdName: string;
  baseline?: HouseholdBaseline;
  setupComplete: boolean;
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
