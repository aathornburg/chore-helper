import type { FlooringType, HouseholdBaseline } from "@chore-helper/shared";

const allowedFlooringTypes: FlooringType[] = ["carpet", "hardwood", "tile", "mixed", "unknown"];

export function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseFlooring(value: string): FlooringType[] {
  const requestedTypes = parseList(value).map((item) => item.toLowerCase());
  const validTypes = requestedTypes.filter((item): item is FlooringType =>
    allowedFlooringTypes.includes(item as FlooringType)
  );

  return validTypes.length > 0 ? validTypes : ["unknown"];
}

export function formatBaselineSummary(baseline: HouseholdBaseline) {
  return `${baseline.homeType} / ${baseline.rooms.length} rooms / ${baseline.flooring.join(", ")} / ${
    baseline.hasPets ? "pets" : "no pets"
  } / ${baseline.hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
}
