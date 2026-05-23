# Households 2D Floor Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persisted Households page where users manage floors, basement state, floor details, and editable room cards through a compact elevation-first selector.

**Architecture:** Add normalized floor and room models behind household-scoped structure endpoints, then build a React Households page that loads the current household structure and edits it locally through explicit API calls. The compact elevation selector is UI state only; the persisted source of truth is ordered `HouseholdFloor[]` with nested `HouseholdRoom[]`.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Express, Prisma/PostgreSQL, existing in-memory store test harness.

---

## File Structure

- Modify `shared/src/types.ts`: add shared household structure types and enum-like unions.
- Modify `server/prisma/schema.prisma`: add `HouseholdFloor` and `HouseholdRoom` models.
- Modify `server/src/repositories/inMemoryStore.ts`: add structure methods to `HouseholdStore` and in-memory implementation.
- Modify `server/src/repositories/prismaStore.ts`: add structure serialization/deserialization through Prisma models.
- Modify `server/src/routes/households.ts`: add household structure routes and validation schemas.
- Modify `server/test/households.test.ts`: add API contract tests for floor/room structure.
- Modify `web/src/api.ts`: add frontend API helpers for structure load/save operations.
- Modify `web/src/pages/HouseholdsPage.tsx`: replace placeholder with compact elevation-first editor.
- Modify `web/src/App.test.tsx`: add user-facing Households page behavior tests.
- Modify `web/src/App.css`: add layout, compact house, chips, room cards, and responsive styles.

## Implementation Notes

- Use normalized tables rather than a JSON blob. The feature includes child lifecycle operations and will later feed recommendation context.
- Keep old `HouseholdBaseline` intact in this slice. The new structure API is additive.
- Use full replacement for structure saves in the first slice: `PUT /api/households/:householdId/structure` accepts all floors with nested rooms and replaces persisted floors/rooms in one transaction. This avoids many small endpoints while still using normalized storage.
- Generate client-side IDs for new floors/rooms with `crypto.randomUUID()` before saving. Backend accepts IDs to preserve selected state across saves.
- Households page can use the current restored household from `HouseholdSetupProvider` for now. This is not a global active-household selector for Chores; it is the page editing the known household context until auth/list-households work lands.

---

### Task 1: Shared Household Structure Types

**Files:**
- Modify: `shared/src/types.ts`
- Test: `server/test/households.test.ts` and `web/src/App.test.tsx` will compile against these types in later tasks.

- [ ] **Step 1: Add shared type definitions**

Add the following after `HouseholdBaseline` in `shared/src/types.ts`:

```ts
export type CoverageLevel = "none" | "partial" | "most" | "all";
export type PetImpact = "none" | "low" | "medium" | "high";
export type RoomOverride<T> = T | "inherit";

export type FlooringSurface =
  | "hardwood"
  | "tile"
  | "carpet"
  | "rugs"
  | "vinyl"
  | "laminate"
  | "concrete"
  | "mats"
  | "mixed"
  | "other";

export type FloorLevelType = "upstairs" | "main" | "basement" | "other";

export type HouseholdRoom = {
  id: string;
  floorId: string;
  name: string;
  flooring: FlooringSurface[];
  petImpact: RoomOverride<PetImpact>;
  robotVacuumCoverage: RoomOverride<CoverageLevel>;
  robotMopCoverage: RoomOverride<CoverageLevel>;
  notes?: string;
};

export type HouseholdFloor = {
  id: string;
  householdId: string;
  name: string;
  levelType: FloorLevelType;
  flooring: FlooringSurface[];
  petImpact: PetImpact;
  robotVacuumCoverage: CoverageLevel;
  robotMopCoverage: CoverageLevel;
  notes?: string;
  rooms: HouseholdRoom[];
};

export type HouseholdStructure = {
  householdId: string;
  floors: HouseholdFloor[];
};
```

- [ ] **Step 2: Run shared typecheck**

Run: `npm.cmd run typecheck -w shared`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add shared/src/types.ts
git commit -m "Add household structure shared types"
```

---

### Task 2: In-Memory Store Structure Contract

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/test/households.test.ts`

- [ ] **Step 1: Write failing API-oriented store tests through route tests**

In `server/test/households.test.ts`, add this test inside `describe("household baseline flow", () => { ... })`:

```ts
it("saves and fetches household floor and room structure", async () => {
  const app = createTestApp();
  const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
  const householdId = created.body.id;

  await request(app)
    .put(`/api/households/${householdId}/structure`)
    .send({
      floors: [
        {
          id: "floor-main",
          householdId,
          name: "Main floor",
          levelType: "main",
          flooring: ["hardwood", "rugs"],
          petImpact: "medium",
          robotVacuumCoverage: "most",
          robotMopCoverage: "partial",
          notes: "Rugs in the living room.",
          rooms: [
            {
              id: "room-living",
              floorId: "floor-main",
              name: "Living room",
              flooring: ["hardwood", "rugs"],
              petImpact: "high",
              robotVacuumCoverage: "all",
              robotMopCoverage: "inherit",
              notes: "Dog spends most evenings here."
            }
          ]
        }
      ]
    })
    .expect(200);

  await request(app)
    .get(`/api/households/${householdId}/structure`)
    .expect(200)
    .expect((response) => {
      expect(response.body).toEqual({
        householdId,
        floors: [
          expect.objectContaining({
            id: "floor-main",
            householdId,
            name: "Main floor",
            levelType: "main",
            flooring: ["hardwood", "rugs"],
            rooms: [
              expect.objectContaining({
                id: "room-living",
                floorId: "floor-main",
                flooring: ["hardwood", "rugs"]
              })
            ]
          })
        ]
      });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test --workspace server -- households.test.ts --run`

Expected: FAIL with `404` for `/api/households/:householdId/structure`.

- [ ] **Step 3: Extend store interface**

In `server/src/repositories/inMemoryStore.ts`, import the new types:

```ts
import type {
  Chore,
  Household,
  HouseholdBaseline,
  HouseholdFloor,
  HouseholdStructure,
  Recommendation,
  RecommendationDecision
} from "@chore-helper/shared";
```

Add methods to `HouseholdStore`:

```ts
  getHouseholdStructure(householdId: string): StoreResult<HouseholdStructure | undefined>;
  saveHouseholdStructure(
    householdId: string,
    floors: HouseholdFloor[]
  ): StoreResult<HouseholdStructure | undefined>;
```

- [ ] **Step 4: Implement in-memory structure storage**

Inside `createInMemoryStore()`, add:

```ts
  const householdFloors = new Map<string, HouseholdFloor[]>();
```

Inside the returned store object, after `getHousehold(householdId)`, add:

```ts
    getHouseholdStructure(householdId) {
      if (!households.has(householdId)) return undefined;
      return {
        householdId,
        floors: householdFloors.get(householdId) ?? []
      };
    },

    saveHouseholdStructure(householdId, floors) {
      if (!households.has(householdId)) return undefined;

      const normalized = floors.map((floor) => ({
        ...floor,
        householdId,
        rooms: floor.rooms.map((room) => ({
          ...room,
          floorId: floor.id
        }))
      }));
      householdFloors.set(householdId, normalized);

      return {
        householdId,
        floors: normalized
      };
    },
```

- [ ] **Step 5: Run server typecheck**

Run: `npm.cmd run typecheck -w server`

Expected: FAIL because route methods do not exist yet, or PASS if only interface was added. Continue either way.

- [ ] **Step 6: Commit after route task, not here**

Do not commit yet. This task intentionally pairs with Task 3 because tests cannot pass until routes exist.

---

### Task 3: Household Structure Routes and Validation

**Files:**
- Modify: `server/src/routes/households.ts`
- Test: `server/test/households.test.ts`

- [ ] **Step 1: Add validation schemas**

In `server/src/routes/households.ts`, add after `baselineSchema`:

```ts
const coverageLevelSchema = z.enum(["none", "partial", "most", "all"]);
const petImpactSchema = z.enum(["none", "low", "medium", "high"]);
const flooringSurfaceSchema = z.enum([
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
]);

const roomOverrideCoverageSchema = z.union([coverageLevelSchema, z.literal("inherit")]);
const roomOverridePetImpactSchema = z.union([petImpactSchema, z.literal("inherit")]);

const householdRoomSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  name: z.string().min(1),
  flooring: z.array(flooringSurfaceSchema),
  petImpact: roomOverridePetImpactSchema,
  robotVacuumCoverage: roomOverrideCoverageSchema,
  robotMopCoverage: roomOverrideCoverageSchema,
  notes: z.string().optional()
});

const householdFloorSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  name: z.string().min(1),
  levelType: z.enum(["upstairs", "main", "basement", "other"]),
  flooring: z.array(flooringSurfaceSchema),
  petImpact: petImpactSchema,
  robotVacuumCoverage: coverageLevelSchema,
  robotMopCoverage: coverageLevelSchema,
  notes: z.string().optional(),
  rooms: z.array(householdRoomSchema)
});

const householdStructureSchema = z.object({
  floors: z.array(householdFloorSchema)
});
```

- [ ] **Step 2: Add GET and PUT routes**

In `createHouseholdRouter`, after `router.get("/:householdId", ...)`, add:

```ts
  router.get("/:householdId/structure", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(await store.getHouseholdStructure(household.id));
  });

  router.put("/:householdId/structure", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const parsed = householdStructureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household structure payload" });

    return res.status(200).json(
      await store.saveHouseholdStructure(household.id, parsed.data.floors)
    );
  });
```

- [ ] **Step 3: Run server route test**

Run: `npm.cmd test --workspace server -- households.test.ts --run`

Expected: PASS for the new structure test and existing tests.

- [ ] **Step 4: Add invalid payload test**

Add this test to `server/test/households.test.ts`:

```ts
it("rejects invalid household structure payloads", async () => {
  const app = createTestApp();
  const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

  await request(app)
    .put(`/api/households/${created.body.id}/structure`)
    .send({
      floors: [
        {
          id: "floor-main",
          householdId: created.body.id,
          name: "Main floor",
          levelType: "main",
          flooring: ["marble"],
          petImpact: "medium",
          robotVacuumCoverage: "most",
          robotMopCoverage: "partial",
          rooms: []
        }
      ]
    })
    .expect(400)
    .expect((response) => {
      expect(response.body).toEqual({ error: "Invalid household structure payload" });
    });
});
```

- [ ] **Step 5: Run server tests**

Run: `npm.cmd test --workspace server -- households.test.ts --run`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/types.ts server/src/repositories/inMemoryStore.ts server/src/routes/households.ts server/test/households.test.ts
git commit -m "Add household structure API contract"
```

---

### Task 4: Prisma Persistence for Floors and Rooms

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `server/test/prismaStore.test.ts`

- [ ] **Step 1: Add Prisma models**

In `server/prisma/schema.prisma`, update `Household`:

```prisma
model Household {
  id              String             @id
  name            String
  baseline        HouseholdBaseline?
  floors          HouseholdFloor[]
  chores          Chore[]
  recommendations Recommendation[]
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
}
```

Add these models after `HouseholdBaseline`:

```prisma
model HouseholdFloor {
  id                  String          @id
  householdId          String
  household            Household       @relation(fields: [householdId], references: [id], onDelete: Cascade)
  name                String
  levelType           String
  flooring            String
  petImpact           String
  robotVacuumCoverage String
  robotMopCoverage    String
  notes               String?
  sortOrder           Int
  rooms               HouseholdRoom[]
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

model HouseholdRoom {
  id                  String         @id
  floorId             String
  floor               HouseholdFloor @relation(fields: [floorId], references: [id], onDelete: Cascade)
  name                String
  flooring            String
  petImpact           String
  robotVacuumCoverage String
  robotMopCoverage    String
  notes               String?
  sortOrder           Int
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
}
```

- [ ] **Step 2: Add mapper helpers**

In `server/src/repositories/prismaStore.ts`, import new shared types:

```ts
  HouseholdFloor,
  HouseholdRoom,
```

Add helpers near `deserializeList`:

```ts
function serializeOptionalList(values: string[]) {
  return JSON.stringify(values);
}

function deserializeOptionalList<T extends string>(value: string) {
  return JSON.parse(value) as T[];
}
```

Add mapper types and functions:

```ts
function toHouseholdRoom(room: {
  id: string;
  floorId: string;
  name: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
}): HouseholdRoom {
  return {
    id: room.id,
    floorId: room.floorId,
    name: room.name,
    flooring: deserializeOptionalList(room.flooring),
    petImpact: room.petImpact as HouseholdRoom["petImpact"],
    robotVacuumCoverage: room.robotVacuumCoverage as HouseholdRoom["robotVacuumCoverage"],
    robotMopCoverage: room.robotMopCoverage as HouseholdRoom["robotMopCoverage"],
    notes: room.notes ?? undefined
  };
}

function toHouseholdFloor(floor: {
  id: string;
  householdId: string;
  name: string;
  levelType: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
  rooms: Array<{
    id: string;
    floorId: string;
    name: string;
    flooring: string;
    petImpact: string;
    robotVacuumCoverage: string;
    robotMopCoverage: string;
    notes?: string | null;
  }>;
}): HouseholdFloor {
  return {
    id: floor.id,
    householdId: floor.householdId,
    name: floor.name,
    levelType: floor.levelType as HouseholdFloor["levelType"],
    flooring: deserializeOptionalList(floor.flooring),
    petImpact: floor.petImpact as HouseholdFloor["petImpact"],
    robotVacuumCoverage: floor.robotVacuumCoverage as HouseholdFloor["robotVacuumCoverage"],
    robotMopCoverage: floor.robotMopCoverage as HouseholdFloor["robotMopCoverage"],
    notes: floor.notes ?? undefined,
    rooms: floor.rooms.map(toHouseholdRoom)
  };
}
```

- [ ] **Step 3: Implement Prisma store methods**

Inside `createPrismaStore`, after `getHousehold`, add:

```ts
    async getHouseholdStructure(householdId) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const floors = await prisma.householdFloor.findMany({
        where: { householdId },
        include: { rooms: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" }
      });

      return {
        householdId,
        floors: floors.map(toHouseholdFloor)
      };
    },

    async saveHouseholdStructure(householdId, floors) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      await prisma.$transaction(async (tx) => {
        await tx.householdFloor.deleteMany({ where: { householdId } });

        for (const [floorIndex, floor] of floors.entries()) {
          await tx.householdFloor.create({
            data: {
              id: floor.id,
              householdId,
              name: floor.name,
              levelType: floor.levelType,
              flooring: serializeOptionalList(floor.flooring),
              petImpact: floor.petImpact,
              robotVacuumCoverage: floor.robotVacuumCoverage,
              robotMopCoverage: floor.robotMopCoverage,
              notes: floor.notes,
              sortOrder: floorIndex,
              rooms: {
                create: floor.rooms.map((room, roomIndex) => ({
                  id: room.id,
                  name: room.name,
                  flooring: serializeOptionalList(room.flooring),
                  petImpact: room.petImpact,
                  robotVacuumCoverage: room.robotVacuumCoverage,
                  robotMopCoverage: room.robotMopCoverage,
                  notes: room.notes,
                  sortOrder: roomIndex
                }))
              }
            }
          });
        }
      });

      return this.getHouseholdStructure(householdId);
    },
```

- [ ] **Step 4: Run typecheck**

Run: `npm.cmd run typecheck -w server`

Expected: PASS after Prisma client is generated. If it fails because generated Prisma types are stale, run `npm.cmd run db:generate -w server`, then rerun typecheck.

- [ ] **Step 5: Run server tests**

Run: `npm.cmd test --workspace server -- --run`

Expected: PASS for non-DB tests. `prismaStore.test.ts` remains skipped unless database env is configured.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/src/repositories/prismaStore.ts
git commit -m "Persist household floors and rooms"
```

---

### Task 5: Frontend API Helpers and Structure Defaults

**Files:**
- Modify: `web/src/api.ts`
- Create: `web/src/utils/householdStructure.ts`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add frontend API helpers**

In `web/src/api.ts`, import `HouseholdStructure`:

```ts
import type { Chore, Household, HouseholdBaseline, HouseholdStructure, Recommendation } from "@chore-helper/shared";
```

Add after `getHousehold`:

```ts
export async function getHouseholdStructure(householdId: string): Promise<HouseholdStructure> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/structure`);

  if (!response.ok) throw new Error("Failed to fetch household structure");
  return response.json();
}

export async function saveHouseholdStructure(
  householdId: string,
  structure: HouseholdStructure
): Promise<HouseholdStructure> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/structure`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floors: structure.floors })
  });

  if (!response.ok) throw new Error("Failed to save household structure");
  return response.json();
}
```

- [ ] **Step 2: Create structure utility**

Create `web/src/utils/householdStructure.ts`:

```ts
import type {
  CoverageLevel,
  FloorLevelType,
  FlooringSurface,
  HouseholdBaseline,
  HouseholdFloor,
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

function normalizeFlooring(value: string): FlooringSurface {
  if (flooringOptions.includes(value as FlooringSurface)) return value as FlooringSurface;
  if (value === "unknown") return "other";
  return "mixed";
}

export function createDefaultHouseholdStructure(
  householdId: string,
  baseline?: HouseholdBaseline
): HouseholdStructure {
  const mainFloorId = "floor-main";
  const flooring = baseline?.flooring.map(normalizeFlooring) ?? [];

  return {
    householdId,
    floors: [
      {
        id: mainFloorId,
        householdId,
        name: "Main floor",
        levelType: "main",
        flooring,
        petImpact: baseline?.hasPets ? "medium" : "none",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        notes: baseline?.notes,
        rooms: (baseline?.rooms ?? []).map((roomName, index) => ({
          id: `room-${index + 1}`,
          floorId: mainFloorId,
          name: roomName,
          flooring: [],
          petImpact: "inherit",
          robotVacuumCoverage: "inherit",
          robotMopCoverage: "inherit"
        }))
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
```

- [ ] **Step 3: Run web typecheck**

Run: `npm.cmd run typecheck -w web`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/api.ts web/src/utils/householdStructure.ts
git commit -m "Add household structure frontend helpers"
```

---

### Task 6: Households Page Load and Compact Floor Selector

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing UI test for floor selector**

Update `web/src/App.test.tsx` by adding:

```ts
it("renders a compact floor selector and selects the main floor by default", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => household })
      .mockResolvedValueOnce({ ok: true, json: async () => [cleanBathroomsChore] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          householdId: "household-1",
          floors: [
            {
              id: "floor-main",
              householdId: "household-1",
              name: "Main floor",
              levelType: "main",
              flooring: ["hardwood", "rugs"],
              petImpact: "medium",
              robotVacuumCoverage: "most",
              robotMopCoverage: "partial",
              rooms: []
            }
          ]
        })
      })
  );

  renderAt("/households");

  await waitFor(() => {
    expect(screen.getByLabelText("Select Main floor")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Main floor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "rugs" }).getAttribute("aria-pressed")).toBe("true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test --workspace web -- App.test.tsx --run`

Expected: FAIL because floor selector and structure load do not exist.

- [ ] **Step 3: Pass household setup into page**

In `web/src/App.tsx`, change:

```tsx
<HouseholdsPage />
```

to:

```tsx
<HouseholdsPage householdSetup={householdSetup} />
```

- [ ] **Step 4: Replace placeholder page with loading selector**

In `web/src/pages/HouseholdsPage.tsx`, implement:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { HouseholdFloor, HouseholdStructure } from "@chore-helper/shared";
import { getHouseholdStructure } from "../api";
import type { HouseholdSetupState } from "../types";
import {
  createDefaultHouseholdStructure,
  flooringOptions,
  sortFloors
} from "../utils/householdStructure";

type HouseholdsPageProps = {
  householdSetup: HouseholdSetupState;
};

function getMainFloorId(floors: HouseholdFloor[]) {
  return floors.find((floor) => floor.levelType === "main")?.id ?? floors[0]?.id;
}

export function HouseholdsPage({ householdSetup }: HouseholdsPageProps) {
  const [structure, setStructure] = useState<HouseholdStructure>();
  const [selectedFloorId, setSelectedFloorId] = useState<string>();
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!householdSetup.householdId) {
      setStructure(undefined);
      setLoadState("ready");
      return;
    }

    let cancelled = false;

    async function loadStructure() {
      setLoadState("loading");
      try {
        const loaded = await getHouseholdStructure(householdSetup.householdId as string);
        const nextStructure = loaded.floors.length > 0
          ? loaded
          : createDefaultHouseholdStructure(householdSetup.householdId as string, householdSetup.baseline);
        if (cancelled) return;
        setStructure(nextStructure);
        setSelectedFloorId(getMainFloorId(nextStructure.floors));
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadStructure();

    return () => {
      cancelled = true;
    };
  }, [householdSetup.baseline, householdSetup.householdId]);

  const floors = useMemo(() => sortFloors(structure?.floors ?? []), [structure]);
  const selectedFloor = floors.find((floor) => floor.id === selectedFloorId);

  if (!householdSetup.householdId) {
    return (
      <section className="placeholder-page">
        <h1>Households</h1>
        <p className="lede">Create a household before editing floors and rooms.</p>
      </section>
    );
  }

  return (
    <div className="households-page">
      <header className="workspace-hero compact-hero">
        <div>
          <h1>Households</h1>
          <p className="lede">Manage floors, rooms, flooring, pet impact, and cleaning-device coverage.</p>
        </div>
      </header>

      {loadState === "loading" ? <div className="empty-state">Loading household structure...</div> : null}
      {loadState === "error" ? <div className="empty-state">Could not load household structure.</div> : null}

      {loadState === "ready" && selectedFloor ? (
        <section className="household-editor" aria-label="Household floor editor">
          <aside className="floor-selector-panel">
            <p className="eyebrow">Floor selector</p>
            <div className="compact-house" aria-label="House floor selector">
              <div className="compact-house-roof" />
              {floors.map((floor) => (
                <button
                  aria-pressed={selectedFloor.id === floor.id}
                  aria-label={`Select ${floor.name}`}
                  className={`compact-house-floor ${selectedFloor.id === floor.id ? "active" : ""} compact-house-floor-${floor.levelType}`}
                  key={floor.id}
                  onClick={() => setSelectedFloorId(floor.id)}
                  type="button"
                >
                  {floor.name}
                </button>
              ))}
            </div>
            <div className="floor-summary-list">
              {floors.map((floor) => (
                <button
                  aria-pressed={selectedFloor.id === floor.id}
                  key={floor.id}
                  onClick={() => setSelectedFloorId(floor.id)}
                  type="button"
                >
                  <strong>{floor.name}</strong>
                  <span>{floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="floor-detail-panel">
            <h2>{selectedFloor.name}</h2>
            <p className="lede">Floor details</p>
            <div className="chip-list" aria-label="Flooring">
              {flooringOptions.map((flooring) => (
                <button
                  aria-pressed={selectedFloor.flooring.includes(flooring)}
                  key={flooring}
                  type="button"
                >
                  {flooring}
                </button>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run web test**

Run: `npm.cmd test --workspace web -- App.test.tsx --run`

Expected: PASS for the new floor selector test.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/pages/HouseholdsPage.tsx web/src/App.test.tsx
git commit -m "Render compact household floor selector"
```

---

### Task 7: Floor Management and Floor Detail Editing

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Add failing tests for floor lifecycle and chip editing**

Add these tests to `web/src/App.test.tsx`:

```ts
it("adds and removes a basement floor with confirmation", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => household })
      .mockResolvedValueOnce({ ok: true, json: async () => [cleanBathroomsChore] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdId: "household-1", floors: [] })
      })
      .mockResolvedValue({ ok: true, json: async () => ({ householdId: "household-1", floors: [] }) })
  );

  renderAt("/households");

  await waitFor(() => expect(screen.getByRole("button", { name: "Add basement" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Add basement" }));

  expect(screen.getByLabelText("Select Basement")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Basement" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Remove basement" }));
  expect(screen.getByText("Remove Basement and 0 rooms?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirm remove floor" }));

  expect(screen.queryByLabelText("Select Basement")).toBeNull();
});

it("allows multiple flooring chips on a floor", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => household })
      .mockResolvedValueOnce({ ok: true, json: async () => [cleanBathroomsChore] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          householdId: "household-1",
          floors: [
            {
              id: "floor-main",
              householdId: "household-1",
              name: "Main floor",
              levelType: "main",
              flooring: [],
              petImpact: "none",
              robotVacuumCoverage: "none",
              robotMopCoverage: "none",
              rooms: []
            }
          ]
        })
      })
      .mockResolvedValue({ ok: true, json: async () => ({ householdId: "household-1", floors: [] }) })
  );

  renderAt("/households");

  await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "hardwood" }));
  fireEvent.click(screen.getByRole("button", { name: "rugs" }));

  expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "rugs" }).getAttribute("aria-pressed")).toBe("true");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd test --workspace web -- App.test.tsx --run`

Expected: FAIL because controls do not exist.

- [ ] **Step 3: Add local update and save helpers**

In `HouseholdsPage.tsx`, import `saveHouseholdStructure`, `createBasementFloor`, and `createNewFloor`.

Add helper functions inside the component:

```tsx
  async function persist(nextStructure: HouseholdStructure) {
    setStructure(nextStructure);
    await saveHouseholdStructure(nextStructure.householdId, nextStructure);
  }

  async function handleToggleFlooring(flooring: FlooringSurface) {
    if (!structure || !selectedFloor) return;

    const nextFloors = structure.floors.map((floor) => {
      if (floor.id !== selectedFloor.id) return floor;
      const nextFlooring = floor.flooring.includes(flooring)
        ? floor.flooring.filter((candidate) => candidate !== flooring)
        : [...floor.flooring, flooring];
      return { ...floor, flooring: nextFlooring };
    });
    await persist({ ...structure, floors: nextFloors });
  }

  async function handleAddFloor() {
    if (!structure) return;
    const floor = createNewFloor(structure.householdId, structure.floors.length);
    const nextStructure = { ...structure, floors: sortFloors([...structure.floors, floor]) };
    setSelectedFloorId(floor.id);
    await persist(nextStructure);
  }

  async function handleAddBasement() {
    if (!structure || structure.floors.some((floor) => floor.levelType === "basement")) return;
    const basement = createBasementFloor(structure.householdId);
    const nextStructure = { ...structure, floors: sortFloors([...structure.floors, basement]) };
    setSelectedFloorId(basement.id);
    await persist(nextStructure);
  }
```

Add confirmation state:

```tsx
  const [pendingRemoveFloorId, setPendingRemoveFloorId] = useState<string>();
```

Add remove handler:

```tsx
  async function handleConfirmRemoveFloor() {
    if (!structure || !pendingRemoveFloorId) return;
    const nextFloors = structure.floors.filter((floor) => floor.id !== pendingRemoveFloorId);
    const nextStructure = { ...structure, floors: nextFloors };
    setPendingRemoveFloorId(undefined);
    setSelectedFloorId(getMainFloorId(nextFloors));
    await persist(nextStructure);
  }
```

- [ ] **Step 4: Render actions and confirmation**

In the selector panel, render:

```tsx
<div className="floor-actions">
  <button onClick={handleAddFloor} type="button">Add floor</button>
  {!floors.some((floor) => floor.levelType === "basement") ? (
    <button onClick={handleAddBasement} type="button">Add basement</button>
  ) : null}
</div>
```

In the detail panel under the heading, render:

```tsx
{selectedFloor.levelType !== "main" ? (
  <button onClick={() => setPendingRemoveFloorId(selectedFloor.id)} type="button">
    {selectedFloor.levelType === "basement" ? "Remove basement" : "Remove floor"}
  </button>
) : null}
{pendingRemoveFloorId === selectedFloor.id ? (
  <div className="inline-confirmation">
    <p>Remove {selectedFloor.name} and {selectedFloor.rooms.length} rooms?</p>
    <button onClick={handleConfirmRemoveFloor} type="button">Confirm remove floor</button>
    <button onClick={() => setPendingRemoveFloorId(undefined)} type="button">Cancel</button>
  </div>
) : null}
```

Update chip buttons:

```tsx
onClick={() => handleToggleFlooring(flooring)}
```

- [ ] **Step 5: Add CSS**

In `web/src/App.css`, add:

```css
.household-editor {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.floor-selector-panel,
.floor-detail-panel {
  background: #fff;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  padding: 16px;
}

.compact-house {
  width: 120px;
  margin: 0 auto 16px;
}

.compact-house-roof {
  width: 0;
  height: 0;
  border-left: 60px solid transparent;
  border-right: 60px solid transparent;
  border-bottom: 38px solid #667085;
}

.compact-house-floor {
  width: 120px;
  min-height: 38px;
  border: 2px solid #344054;
  border-top: 0;
  background: #fff;
  color: #1d2939;
  font-weight: 750;
}

.compact-house-floor.active,
.floor-summary-list button[aria-pressed="true"],
.chip-list button[aria-pressed="true"] {
  background: #dbeafe;
  box-shadow: inset 0 0 0 3px #60a5fa;
}

.floor-summary-list,
.floor-actions,
.chip-list {
  display: grid;
  gap: 8px;
}

.floor-summary-list button {
  display: flex;
  justify-content: space-between;
  border: 1px solid #d7dee8;
  border-radius: 6px;
  padding: 9px 10px;
  background: #fff;
}

.chip-list {
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
}

.chip-list button {
  border: 1px solid #d7dee8;
  border-radius: 999px;
  padding: 8px 10px;
  background: #fff;
}

.inline-confirmation {
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 12px;
  background: #fffbeb;
}

@media (max-width: 820px) {
  .household-editor {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm.cmd test --workspace web -- App.test.tsx --run`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/HouseholdsPage.tsx web/src/App.test.tsx web/src/App.css
git commit -m "Add household floor management UI"
```

---

### Task 8: Room Cards Add/Edit/Remove

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Add failing room tests**

Add to `web/src/App.test.tsx`:

```ts
it("adds and edits room cards on the selected floor", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => household })
      .mockResolvedValueOnce({ ok: true, json: async () => [cleanBathroomsChore] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          householdId: "household-1",
          floors: [
            {
              id: "floor-main",
              householdId: "household-1",
              name: "Main floor",
              levelType: "main",
              flooring: ["hardwood"],
              petImpact: "medium",
              robotVacuumCoverage: "most",
              robotMopCoverage: "partial",
              rooms: []
            }
          ]
        })
      })
      .mockResolvedValue({ ok: true, json: async () => ({ householdId: "household-1", floors: [] }) })
  );

  renderAt("/households");

  await waitFor(() => expect(screen.getByRole("button", { name: "Add room" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Add room" }));
  fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Kitchen" } });
  fireEvent.click(screen.getByRole("button", { name: "Save room" }));

  expect(screen.getByText("Kitchen")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Edit Kitchen" }));
  fireEvent.click(screen.getByRole("button", { name: "rugs" }));
  fireEvent.click(screen.getByRole("button", { name: "Save room" }));

  expect(screen.getByText("hardwood")).toBeTruthy();
  expect(screen.getByText("rugs")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm.cmd test --workspace web -- App.test.tsx --run`

Expected: FAIL because room UI does not exist.

- [ ] **Step 3: Add room editor state**

In `HouseholdsPage.tsx`, import `HouseholdRoom` and add state:

```tsx
  const [editingRoom, setEditingRoom] = useState<HouseholdRoom>();
```

Add helper:

```tsx
  function createRoom(floorId: string): HouseholdRoom {
    return {
      id: crypto.randomUUID(),
      floorId,
      name: "",
      flooring: [...(selectedFloor?.flooring ?? [])],
      petImpact: "inherit",
      robotVacuumCoverage: "inherit",
      robotMopCoverage: "inherit"
    };
  }
```

Add save/remove:

```tsx
  async function handleSaveRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!structure || !selectedFloor || !editingRoom || !editingRoom.name.trim()) return;

    const nextFloors = structure.floors.map((floor) => {
      if (floor.id !== selectedFloor.id) return floor;
      const exists = floor.rooms.some((room) => room.id === editingRoom.id);
      return {
        ...floor,
        rooms: exists
          ? floor.rooms.map((room) => (room.id === editingRoom.id ? editingRoom : room))
          : [...floor.rooms, editingRoom]
      };
    });
    setEditingRoom(undefined);
    await persist({ ...structure, floors: nextFloors });
  }

  async function handleRemoveRoom(roomId: string) {
    if (!structure || !selectedFloor) return;

    const nextFloors = structure.floors.map((floor) =>
      floor.id === selectedFloor.id
        ? { ...floor, rooms: floor.rooms.filter((room) => room.id !== roomId) }
        : floor
    );
    await persist({ ...structure, floors: nextFloors });
  }
```

- [ ] **Step 4: Render room cards and editor**

Below floor details, render:

```tsx
<section className="room-card-section" aria-labelledby="room-card-heading">
  <div className="section-heading">
    <div className="section-title">
      <h3 id="room-card-heading">Rooms</h3>
    </div>
    <button onClick={() => setEditingRoom(createRoom(selectedFloor.id))} type="button">
      Add room
    </button>
  </div>

  <div className="room-card-grid">
    {selectedFloor.rooms.map((room) => (
      <article className="room-card" key={room.id}>
        <strong>{room.name}</strong>
        <span>{room.flooring.length > 0 ? room.flooring.join(", ") : "Inherits floor surfaces"}</span>
        <span>Pet impact: {room.petImpact}</span>
        <span>Vacuum: {room.robotVacuumCoverage}</span>
        <span>Mop: {room.robotMopCoverage}</span>
        <div className="form-actions">
          <button onClick={() => setEditingRoom(room)} type="button">Edit {room.name}</button>
          <button onClick={() => handleRemoveRoom(room.id)} type="button">Remove {room.name}</button>
        </div>
      </article>
    ))}
  </div>
</section>

{editingRoom ? (
  <form className="room-editor" onSubmit={handleSaveRoom}>
    <label>
      Room name
      <input
        required
        value={editingRoom.name}
        onChange={(event) => setEditingRoom({ ...editingRoom, name: event.target.value })}
      />
    </label>
    <div className="chip-list" aria-label="Room flooring">
      {flooringOptions.map((flooring) => (
        <button
          aria-pressed={editingRoom.flooring.includes(flooring)}
          key={flooring}
          onClick={() => {
            setEditingRoom({
              ...editingRoom,
              flooring: editingRoom.flooring.includes(flooring)
                ? editingRoom.flooring.filter((candidate) => candidate !== flooring)
                : [...editingRoom.flooring, flooring]
            });
          }}
          type="button"
        >
          {flooring}
        </button>
      ))}
    </div>
    <div className="form-actions">
      <button type="submit">Save room</button>
      <button onClick={() => setEditingRoom(undefined)} type="button">Cancel</button>
    </div>
  </form>
) : null}
```

- [ ] **Step 5: Add room CSS**

In `web/src/App.css`, add:

```css
.room-card-section {
  margin-top: 24px;
}

.room-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

.room-card,
.room-editor {
  border: 1px solid #d7dee8;
  border-radius: 8px;
  padding: 13px;
  background: #fff;
}

.room-card span {
  display: block;
  color: #536173;
  font-size: 13px;
  line-height: 1.45;
}

.room-editor {
  margin-top: 16px;
}
```

- [ ] **Step 6: Run tests**

Run: `npm.cmd test --workspace web -- App.test.tsx --run`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/HouseholdsPage.tsx web/src/App.test.tsx web/src/App.css
git commit -m "Add household room card editing"
```

---

### Task 9: Final Polish, Verification, and Browser Review

**Files:**
- Modify as needed: `web/src/pages/HouseholdsPage.tsx`, `web/src/App.css`, tests if behavior is clarified.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm.cmd test --workspace web -- --run
npm.cmd test --workspace server -- --run
```

Expected:

- Web: 1 test file passed, all tests passed.
- Server: existing non-DB suites passed, DB suite skipped unless configured.

- [ ] **Step 2: Run typecheck and build**

Run:

```bash
npm.cmd run typecheck
npm.cmd run web:build
```

Expected: PASS.

- [ ] **Step 3: Start dev server for browser review**

Run:

```bash
npm.cmd run web:dev
```

Expected: Vite serves the app, usually at `http://localhost:5173`.

- [ ] **Step 4: Browser review checklist**

Open `/households` and verify:

- Compact 2D elevation selector is visible and not oversized.
- Floor bands are clickable.
- Text floor list mirrors selector behavior.
- Main floor is selected by default.
- `Add floor` creates a new upper/other floor.
- `Add basement` creates a basement band.
- Removing basement requires confirmation.
- Flooring chips support multiple selected values.
- Room cards can be added and edited.
- Mobile width stacks selector above editor without overlapping text.

- [ ] **Step 5: Commit final polish**

If changes were made:

```bash
git add web/src/pages/HouseholdsPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Polish household floor editor"
```

If no changes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage:
  - Compact elevation-first selector: Task 6 and Task 7 CSS.
  - Add/remove floors and basement: Task 7.
  - Floor-level details and multi-select flooring chips: Task 7.
  - Editable room cards: Task 8.
  - Persistence: Tasks 2-4.
  - Accessibility basics: Task 6 uses buttons with accessible names and `aria-pressed`; Task 9 browser review includes visual/interaction checks.
- Placeholder scan:
  - No `TBD` or `TODO` steps.
  - The only open decisions from the spec are resolved for this plan: normalized persistence and inline room editing.
- Type consistency:
  - Shared type names match route/store/page plan: `HouseholdStructure`, `HouseholdFloor`, `HouseholdRoom`, `FlooringSurface`, `PetImpact`, `CoverageLevel`.
