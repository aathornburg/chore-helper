import type {
  CoverageLevel,
  FloorLevelType,
  FlooringSurface,
  HouseholdFloor,
  HouseholdProfile,
  HouseholdStructure,
  PetImpact
} from "@chore-helper/shared";

export const flooringOptions: FlooringSurface[] = [
  "hardwood",
  "tile",
  "carpet",
  "rugs",
  "vinyl",
  "laminate",
  "concrete",
  "mats",
  "mixed",
  "other"
];

export const coverageOptions: CoverageLevel[] = ["none", "partial", "most", "all"];
export const petImpactOptions: PetImpact[] = ["none", "low", "medium", "high"];
export const floorLevelOptions: FloorLevelType[] = ["upstairs", "main", "basement", "other"];

export function createDefaultHouseholdStructure(
  householdId: string,
  profile?: HouseholdProfile
): HouseholdStructure {
  const mainFloorId = "floor-main";

  return {
    householdId,
    floors: [
      {
        id: mainFloorId,
        householdId,
        name: "Main floor",
        levelType: "main",
        flooring: [],
        petImpact: profile?.hasPets ? "medium" : "none",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        notes: profile?.notes,
        rooms: []
      }
    ]
  };
}

export function sortFloors(floors: HouseholdFloor[]) {
  const rank = { upstairs: 0, main: 1, other: 2, basement: 3 } satisfies Record<FloorLevelType, number>;
  return [...floors].sort((first, second) => rank[first.levelType] - rank[second.levelType]);
}

export function createNewFloor(householdId: string, existingCount: number): HouseholdFloor {
  return {
    id: crypto.randomUUID(),
    householdId,
    name: existingCount === 0 ? "Main floor" : `Floor ${existingCount + 1}`,
    levelType: existingCount === 0 ? "main" : "upstairs",
    flooring: [],
    petImpact: "none",
    robotVacuumCoverage: "none",
    robotMopCoverage: "none",
    rooms: []
  };
}

export function createBasementFloor(householdId: string): HouseholdFloor {
  return {
    id: crypto.randomUUID(),
    householdId,
    name: "Basement",
    levelType: "basement",
    flooring: [],
    petImpact: "none",
    robotVacuumCoverage: "none",
    robotMopCoverage: "none",
    rooms: []
  };
}
