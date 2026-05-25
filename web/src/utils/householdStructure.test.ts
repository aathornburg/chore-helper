import { describe, expect, it, vi } from "vitest";
import {
  createBasementFloor,
  createDefaultHouseholdStructure,
  createNewFloor,
  sortFloors
} from "./householdStructure";

describe("household structure utilities", () => {
  it("creates a default main floor for a new household profile", () => {
    const structure = createDefaultHouseholdStructure("household-1", {
      homeType: "house",
      hasPets: true,
      hasOutdoorSpace: false,
      notes: "Pet hair gathers near rugs."
    });

    expect(structure).toEqual({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: [],
          petImpact: "medium",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          notes: "Pet hair gathers near rugs.",
          rooms: []
        }
      ]
    });
  });

  it("creates and sorts additional floors for the elevation selector", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("floor-upstairs" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("floor-basement" as `${string}-${string}-${string}-${string}-${string}`);

    const upstairs = createNewFloor("household-1", 1);
    const basement = createBasementFloor("household-1");

    expect(upstairs).toEqual(expect.objectContaining({
      id: "floor-upstairs",
      name: "Floor 2",
      levelType: "upstairs"
    }));
    expect(basement).toEqual(expect.objectContaining({
      id: "floor-basement",
      name: "Basement",
      levelType: "basement"
    }));
    expect(sortFloors([basement, upstairs, { ...upstairs, id: "floor-main", name: "Main", levelType: "main" }]))
      .toEqual([
        expect.objectContaining({ levelType: "upstairs" }),
        expect.objectContaining({ levelType: "main" }),
        expect.objectContaining({ levelType: "basement" })
      ]);
  });
});
