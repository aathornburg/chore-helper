import type { Chore } from "@chore-helper/shared";

/*
  These types shape component props and form values, similar to Angular
  component inputs/outputs and typed service payloads.
*/
export type Navigate = (path: string) => void;

export type WeekStartDay = "sunday" | "monday";

export type ExistingChoreFormValues = Omit<Chore, "id" | "householdId">;
