import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HouseholdAppData, HouseholdStructure } from "@chore-helper/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

async function manageHomeHousehold() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Manage" }));
}

function restoreHouseholdInStorage() {
  window.localStorage.setItem("chore-helper:household-id", "household-1");
}

const household = {
  id: "household-1",
  name: "Home",
  baseline: {
    homeType: "house",
    rooms: ["bathroom"],
    flooring: ["tile"],
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
  structure = { householdId: "household-1", floors: [] }
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
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return {
        ok: true,
        json: async () => [createHouseholdAppData({ structure })]
      };
    }

    if (url === "http://localhost:3001/api/households/household-1/structure" && method === "GET") {
      return { ok: true, json: async () => structure };
    }

    if (url === "http://localhost:3001/api/households/household-1/structure" && method === "PUT") {
      if (options.savePromise) return options.savePromise;
      if (options.saveResponse) return options.saveResponse;
      const body = JSON.parse(String(init?.body)) as Pick<HouseholdStructure, "floors">;
      return { ok: true, json: async () => ({ householdId: "household-1", floors: body.floors }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("renders the landing hero with a get started action", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: "Cleainly" })).toBeTruthy();
    expect(screen.getByText("Make household work visible, fair, and easier to adjust.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get Started" })).toBeTruthy();
  });

  it("renders the current primary navigation without setup", () => {
    renderAt("/today");

    expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
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
      expect(screen.getByText("Home is ready for a first expert chore review.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/households");
    expect(fetchMock).not.toHaveBeenCalledWith("http://localhost:3001/api/households/stale-household");
  });

  it("routes the first-time household action to Households", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    await waitFor(() => expect(screen.getByRole("button", { name: "Set up household" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Set up household" }));

    expect(screen.getByRole("heading", { name: "Households" })).toBeTruthy();
  });

  it("renders the Households page", async () => {
    mockEmptyAppDataFetches();
    renderAt("/households");

    expect(screen.getByRole("heading", { name: "Households" })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add household" })).toBeTruthy();
    });
  });

  it("adds the first household from the no-households state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

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
      expect(screen.getByLabelText("Select Main floor")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Main floor" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "rugs" }).getAttribute("aria-pressed")).toBe("true");
    });
    expect(fetchMock).not.toHaveBeenCalledWith("http://localhost:3001/api/households/household-1/structure");
  });

  it("adds and removes a basement floor with confirmation", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({ householdId: "household-1", floors: [] });

    renderAt("/households");

    await manageHomeHousehold();
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
    await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "hardwood" }));
    fireEvent.click(screen.getByRole("button", { name: "rugs" }));

    expect(screen.getByRole("button", { name: "rugs" }).hasAttribute("disabled")).toBe(true);
    expect(fetchMock.mock.calls.filter(([url, init]) =>
      url === "http://localhost:3001/api/households/household-1/structure" && init?.method === "PUT"
    )).toHaveLength(1);

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? "GET";

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
      })
    );

    renderAt("/chores");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Chores" })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Clean bathrooms/ })).toBeTruthy();
    });
  });

  it("loads all chores without a restored household and shows each chore household", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? "GET";

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
      expect(screen.getByRole("heading", { name: "Optimize" })).toBeTruthy();
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
      expect(screen.getByRole("heading", { name: "Optimize" })).toBeTruthy();
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
