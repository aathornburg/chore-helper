import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HouseholdAppData, HouseholdStructure } from "@chore-helper/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const clerkState = vi.hoisted(() => ({
  signedIn: true,
  getToken: vi.fn<() => Promise<string | null>>(async () => "test-user-a")
}));

vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children ?? "Sign in"}</button>
  ),
  SignUpButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children ?? "Sign up"}</button>
  ),
  SignedIn: ({ children }: { children: React.ReactNode }) => (clerkState.signedIn ? <>{children}</> : null),
  SignedOut: ({ children }: { children: React.ReactNode }) => (!clerkState.signedIn ? <>{children}</> : null),
  UserButton: () => <button aria-label="User menu" type="button" />,
  useAuth: () => ({
    isLoaded: true,
    getToken: clerkState.getToken
  })
}));

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function mockClerkSignedIn() {
  clerkState.signedIn = true;
  clerkState.getToken.mockReset();
  clerkState.getToken.mockResolvedValue("test-user-a");
}

function mockClerkSignedOut() {
  clerkState.signedIn = false;
  clerkState.getToken.mockReset();
  clerkState.getToken.mockResolvedValue(null);
}

async function manageHomeHousehold() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Manage" }));
}

async function openHouseholdManageTab(name: "Overview" | "Floors" | "Rooms") {
  await waitFor(() => expect(screen.getByRole("tab", { name })).toBeTruthy());
  fireEvent.click(screen.getByRole("tab", { name }));
}

async function editFloorSurfaces() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit surfaces" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Edit surfaces" }));
}

function restoreHouseholdInStorage() {
  window.localStorage.setItem("chore-helper:household-id", "household-1");
}

const household = {
  id: "household-1",
  name: "Home",
  timeZone: "America/New_York",
  profile: {
    homeType: "house",
    hasPets: true,
    hasOutdoorSpace: false,
    notes: ""
  }
};

const cleanBathroomsChore = {
  id: "chore-1",
  householdId: "household-1",
  title: "Clean bathrooms",
  cadence: "weekly",
  estimatedMinutes: 10,
  source: "manual"
};

function createHouseholdAppData({
  chores = [cleanBathroomsChore],
  recommendations = [],
  structure = {
    householdId: "household-1",
    floors: [{
      id: "floor-main",
      householdId: "household-1",
      name: "Main floor",
      levelType: "main",
      flooring: ["tile"],
      petImpact: "medium",
      robotVacuumCoverage: "none",
      robotMopCoverage: "none",
      rooms: []
    }]
  }
}: {
  chores?: typeof cleanBathroomsChore[];
  recommendations?: unknown[];
  structure?: HouseholdStructure;
} = {}): HouseholdAppData {
  return {
    ...household,
    structure,
    chores: chores.map((chore) => ({ ...chore, recommendations: [] })),
    recommendations
  } as HouseholdAppData;
}

function mockRestoredHouseholdFetches({
  chores = [cleanBathroomsChore],
  recommendations = [],
  chatResponses = []
}: {
  chores?: typeof cleanBathroomsChore[];
  recommendations?: unknown[];
  chatResponses?: Array<{ ok: boolean; json: () => Promise<unknown> }>;
} = {}) {
  const nextChatResponses = [...chatResponses];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData({ chores, recommendations })] };
    }

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households/household-1/chores" && method === "GET") {
      return { ok: true, json: async () => chores };
    }

    if (url === "http://localhost:3001/api/households/household-1/recommendations" && method === "GET") {
      return { ok: true, json: async () => recommendations };
    }

    if (url === "http://localhost:3001/api/households/household-1/assistant/chat" && method === "POST") {
      const response = nextChatResponses.shift();
      return response ?? { ok: true, json: async () => ({ answer: "Mock assistant answer." }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function mockEmptyAppDataFetches() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [] };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    })
  );
}

function mockHouseholdsPageFetches(
  structure: HouseholdStructure,
  options: {
    saveResponse?: { ok: boolean; json: () => Promise<unknown> };
    savePromise?: Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  } = {}
) {
  let storedStructure = structure;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return {
        ok: true,
        json: async () => [createHouseholdAppData({ structure: storedStructure })]
      };
    }

    if (url === "http://localhost:3001/api/households/household-1/structure" && method === "GET") {
      return { ok: true, json: async () => storedStructure };
    }

    if (url === "http://localhost:3001/api/households/household-1/structure" && method === "PUT") {
      if (options.savePromise) return options.savePromise;
      if (options.saveResponse) return options.saveResponse;
      const body = JSON.parse(String(init?.body)) as Pick<HouseholdStructure, "floors">;
      storedStructure = { householdId: "household-1", floors: body.floors };
      return { ok: true, json: async () => storedStructure };
    }

    if (url === "http://localhost:3001/api/households/household-1/profile" && method === "PUT") {
      const body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ ...household, name: body.name, profile: body }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockClerkSignedIn();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("routes signed-in root visits to Today", async () => {
    mockRestoredHouseholdFetches();
    renderAt("/");

    await waitFor(() => expect(screen.getByText("Ready to optimize")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.queryByText("Make household work visible, fair, and easier to adjust.")).toBeNull();
  });

  it("renders the current primary navigation without setup", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    await waitFor(() => expect(screen.getByRole("link", { name: "Today" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Households" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chores" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Optimize/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Setup" })).toBeNull();
  });

  it("loads app household data from the user-scoped households endpoint without localStorage restore", async () => {
    window.localStorage.setItem("chore-helper:household-id", "stale-household");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return {
          ok: true,
          json: async () => [
            {
              ...household,
              structure: { householdId: household.id, floors: [] },
              chores: [cleanBathroomsChore],
              recommendations: []
            }
          ]
        };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/today");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" })
      })
    );
    expect(fetchMock).not.toHaveBeenCalledWith("http://localhost:3001/api/households/stale-household");
  });

  it("shows auth entry points when signed out", async () => {
    mockClerkSignedOut();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/today");

    expect(screen.getByRole("heading", { name: "Cleanly" })).toBeTruthy();
    expect(screen.getByText("Make household work visible, fair, and easier to adjust.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders all households without an active household selector", async () => {
    const secondHousehold = {
      ...createHouseholdAppData(),
      id: "household-2",
      name: "Cabin",
      structure: { householdId: "household-2", floors: [] },
      chores: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [createHouseholdAppData(), secondHousehold] };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/households");

    await waitFor(() => {
      expect(screen.getByLabelText("Home floor editor")).toBeTruthy();
      expect(screen.getByLabelText("Cabin floor editor")).toBeTruthy();
    });
    expect(screen.queryByText(/active household/i)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === "http://localhost:3001/api/me/active-household")).toBe(false);
  });

  it("routes the first-time household action to Households", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    await waitFor(() => expect(screen.getByRole("button", { name: "Set up household" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Set up household" }));

    expect(screen.getByRole("heading", { name: "Households", level: 1 })).toBeTruthy();
  });

  it("renders the Households page", async () => {
    mockEmptyAppDataFetches();
    renderAt("/households");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Households", level: 1 })).toBeTruthy());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add household" })).toBeTruthy();
    });
  });

  it("adds the first household from the no-households state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [] };
      }

      if (url === "http://localhost:3001/api/households" && method === "POST") {
        return { ok: true, json: async () => ({ id: "household-new", name: "New household" }) };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/households");

    await waitFor(() => expect(screen.getByRole("button", { name: "Add household" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add household" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "New household" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" }),
        body: JSON.stringify({ name: "New household" })
      })
    );
  });

  it("renders a compact floor selector and selects the main floor by default", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockHouseholdsPageFetches({
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
    });

    renderAt("/households");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
      expect(screen.getByLabelText("Home floor editor").classList.contains("panel")).toBe(true);
      expect(screen.queryByLabelText("Select Main floor")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByText("1 floor / 1 chore")).toBeTruthy();
      expect(screen.queryByLabelText("Select Main floor")).toBeNull();
      expect(screen.queryByRole("button", { name: "Add room" })).toBeNull();
    });
    await openHouseholdManageTab("Floors");

    expect(screen.getByLabelText("Select Main floor")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Main floor" })).toBeTruthy();
    expect(screen.getByText("hardwood, rugs")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "hardwood" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit surfaces" }));
    expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "rugs" }).getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalledWith("http://localhost:3001/api/households/household-1/structure");
  });

  it("saves household profile details from Manage overview", async () => {
    const fetchMock = mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [{
        id: "floor-main",
        householdId: "household-1",
        name: "Main floor",
        levelType: "main",
        flooring: [],
        petImpact: "medium",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        rooms: []
      }]
    });

    renderAt("/households");
    await manageHomeHousehold();
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "Lake House" } });
    fireEvent.click(screen.getByRole("button", { name: "Save household profile" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/api/households/household-1/profile",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            name: "Lake House",
            homeType: "house",
            hasPets: true,
            hasOutdoorSpace: false,
            notes: ""
          })
        })
      );
    });
  });

  it("adds and removes a basement floor with confirmation", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({ householdId: "household-1", floors: [] });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add basement" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add basement" }));

    expect(screen.getByLabelText("Select Basement")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Basement" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove basement" }).hasAttribute("disabled")).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "Remove basement" }));
    expect(screen.getByText("Remove Basement and 0 rooms?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove floor" }));

    expect(screen.queryByLabelText("Select Basement")).toBeNull();
  });

  it("allows multiple flooring chips on a floor", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockHouseholdsPageFetches({
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
    });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await editFloorSurfaces();
    await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "hardwood" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "rugs" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "rugs" }));

    expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "rugs" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/api/households/household-1/structure",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("\"hardwood\"")
        })
      );
    });
  });

  it("rolls back floor edits when saving structure fails", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches(
      {
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
      },
      {
        saveResponse: { ok: false, json: async () => ({ error: "Save failed" }) }
      }
    );

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await editFloorSurfaces();
    await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "hardwood" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Could not save household structure.");
      expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("false");
    });
  });

  it("blocks additional floor edits while a structure save is pending", async () => {
    restoreHouseholdInStorage();
    const deferred = createDeferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = mockHouseholdsPageFetches(
      {
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
      },
      { savePromise: deferred.promise }
    );

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await editFloorSurfaces();
    await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "hardwood" }));
    fireEvent.click(screen.getByRole("button", { name: "rugs" }));

    expect(screen.getByRole("button", { name: "rugs" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url, init]) =>
        url === "http://localhost:3001/api/households/household-1/structure" && init?.method === "PUT"
      )).toHaveLength(1);
    });

    deferred.resolve({ ok: true, json: async () => ({ householdId: "household-1", floors: [] }) });
  });

  it("adds and edits room cards on the selected floor", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({
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
    });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Rooms");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add room" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add room" }));
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit Kitchen" }));
    fireEvent.click(within(screen.getByLabelText("Room flooring")).getByRole("button", { name: "rugs" }));
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => expect(screen.getByText("hardwood, rugs")).toBeTruthy());
  });

  it("saves a room to the floor where editing started after switching floors", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-upstairs",
          householdId: "household-1",
          name: "Upstairs",
          levelType: "upstairs",
          flooring: ["carpet"],
          petImpact: "low",
          robotVacuumCoverage: "partial",
          robotMopCoverage: "none",
          rooms: []
        },
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
    });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Rooms");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add room" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add room" }));
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByLabelText("Select Upstairs"));
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => {
        if (url !== "http://localhost:3001/api/households/household-1/structure" || init?.method !== "PUT") return false;
        const body = JSON.parse(String(init.body)) as Pick<HouseholdStructure, "floors">;
        return body.floors.some((floor) =>
          floor.id === "floor-main" && floor.rooms.some((room) => room.name === "Kitchen" && room.floorId === "floor-main")
        );
      })).toBe(true);
    });
  });

  it("loads the Chores page with existing chores", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [] };
      }

      if (url === "http://localhost:3001/api/chores" && method === "GET") {
        return { ok: true, json: async () => [cleanBathroomsChore] };
      }

      if (url === "http://localhost:3001/api/recommendations" && method === "GET") {
        return { ok: true, json: async () => [] };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal(
      "fetch",
      fetchMock
    );

    renderAt("/chores");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Chores" })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Clean bathrooms/ })).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/chores",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/recommendations",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" })
      })
    );
  });

  it("loads all chores without a restored household and shows each chore household", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? "GET";

        if (url === "http://localhost:3001/api/me" && method === "GET") {
          return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
        }

        if (url === "http://localhost:3001/api/households" && method === "GET") {
          return { ok: true, json: async () => [] };
        }

        if (url === "http://localhost:3001/api/chores" && method === "GET") {
          return {
          ok: true,
          json: async () => [
            {
              ...cleanBathroomsChore,
              householdName: "Home"
            }
          ]
          };
        }

        if (url === "http://localhost:3001/api/recommendations" && method === "GET") {
          return { ok: true, json: async () => [] };
        }

        throw new Error(`Unhandled fetch ${method} ${url}`);
      })
    );

    renderAt("/chores");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Chores" })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Clean bathrooms/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Clean bathrooms/ }));

    expect(screen.getByText("Household: Home")).toBeTruthy();
  });

  it("creates a chore for the explicitly selected household", async () => {
    const cabin = {
      ...createHouseholdAppData({ chores: [] }),
      id: "household-2",
      name: "Cabin",
      structure: { householdId: "household-2", floors: [] }
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }
      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [createHouseholdAppData({ chores: [] }), cabin] };
      }
      if (url === "http://localhost:3001/api/chores" && method === "GET") {
        return { ok: true, json: async () => [] };
      }
      if (url === "http://localhost:3001/api/recommendations" && method === "GET") {
        return { ok: true, json: async () => [] };
      }
      if (url === "http://localhost:3001/api/households/household-2/chores" && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            id: "chore-2",
            householdId: "household-2",
            title: "Sweep porch",
            cadence: "weekly",
            estimatedMinutes: 15,
            source: "manual"
          })
        };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/chores");

    await waitFor(() => expect(screen.getByRole("button", { name: "Add chore" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add chore" }));
    fireEvent.change(screen.getByLabelText("Household"), { target: { value: "household-2" } });
    fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Sweep porch" } });
    fireEvent.change(screen.getByLabelText("Cadence"), { target: { value: "weekly" } });
    fireEvent.change(screen.getByLabelText("Estimated minutes"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save chore" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Sweep porch/ })).toBeTruthy());
    expect(screen.getByText(/Cabin \/ weekly \/ 15 min \/ manual/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-2/chores",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Sweep porch",
          cadence: "weekly",
          estimatedMinutes: 15,
          source: "manual"
        })
      })
    );
  });

  it("requires a household before a chore can be added", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? "GET";

        if (url === "http://localhost:3001/api/me" && method === "GET") {
          return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
        }
        if (url === "http://localhost:3001/api/households" && method === "GET") {
          return { ok: true, json: async () => [] };
        }
        if (url === "http://localhost:3001/api/chores" && method === "GET") {
          return { ok: true, json: async () => [] };
        }
        if (url === "http://localhost:3001/api/recommendations" && method === "GET") {
          return { ok: true, json: async () => [] };
        }

        throw new Error(`Unhandled fetch ${method} ${url}`);
      })
    );

    renderAt("/chores");

    await waitFor(() => expect(screen.getByText("Add a household before creating chores.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Add chore" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByLabelText("Chore title")).toBeNull();
  });

  it("shows the Google Calendar connection shell in Settings", async () => {
    mockEmptyAppDataFetches();
    renderAt("/settings#calendar");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Google Calendar" })).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(screen.getByText(/connection flow is coming next/i)).toBeTruthy();
  });

  it("routes calendar import from Chores to the Settings connection shell", async () => {
    mockEmptyAppDataFetches();
    renderAt("/chores");

    await waitFor(() => expect(screen.getByRole("button", { name: "Import calendar events" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Import calendar events" }));

    expect(screen.getByRole("heading", { name: "Google Calendar" })).toBeTruthy();
    expect(window.location.hash).toBe("#calendar");
  });

  it("shows the Optimize recommendation selection flow", async () => {
    restoreHouseholdInStorage();
    mockRestoredHouseholdFetches();

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Optimize" })).toBeTruthy();
      expect(screen.getByLabelText("Clean bathrooms")).toBeTruthy();
    });

    expect(screen.getByRole("tab", { name: "Recommendations" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review selected chores" })).toBeTruthy();
  });

  it("shows Optimize chat prompts and renders an assistant answer", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockRestoredHouseholdFetches({
      chatResponses: [
        {
        ok: true,
        json: async () => ({ answer: "Clean bathrooms may be under-scoped." })
        }
      ]
    });

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));

    expect(screen.getByText("Which chores look under-scoped?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "Which chores look under-scoped?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Clean bathrooms may be under-scoped.")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3001/api/households/household-1/assistant/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Which chores look under-scoped?" })
      })
    );
  });

  it("keeps Optimize chat messages visible when assistant chat fails", async () => {
    restoreHouseholdInStorage();
    mockRestoredHouseholdFetches({
      chores: [],
      recommendations: [],
      chatResponses: [
        {
        ok: true,
        json: async () => ({ answer: "First answer." })
        },
        {
        ok: false,
        json: async () => ({ error: "Could not answer assistant question" })
        }
      ]
    });

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "First question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("First answer.")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "Second question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("First answer.")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("Could not answer assistant question.");
    });
  });
});
