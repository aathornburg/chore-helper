import type { HouseholdAppData } from "@chore-helper/shared";

export function formatHouseholdSummary(household: HouseholdAppData) {
  if (!household.profile) return "Household profile details are not set yet.";

  const roomCount = household.structure.floors.reduce((total, floor) => total + floor.rooms.length, 0);
  return `${household.profile.homeType} / ${household.structure.floors.length} floor${household.structure.floors.length === 1 ? "" : "s"} / ${roomCount} room${roomCount === 1 ? "" : "s"} / ${
    household.profile.hasPets ? "pets" : "no pets"
  } / ${household.profile.hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
}
