import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function mockSuccessfulSetupFetches() {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "household-1", name: "Home" })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "household-1",
        name: "Home",
        baseline: {
          homeType: "house",
          rooms: ["kitchen", "bathrooms", "bedrooms"],
          flooring: ["hardwood", "tile", "carpet"],
          hasPets: true,
          hasOutdoorSpace: true,
          notes: "We already use Google Calendar for recurring chores."
        }
      })
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockSuccessfulSetupAndChoreFetches() {
  const fetchMock = mockSuccessfulSetupFetches()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "chore-1",
        householdId: "household-1",
        title: "Clean bathrooms",
        cadence: "weekly",
        estimatedMinutes: 5,
        source: "manual"
      })
    });
  return fetchMock;
}

async function saveSetup() {
  fireEvent.click(screen.getByRole("button", { name: "Save basics" }));
  await waitFor(() => {
    expect(screen.getByText("Household context saved. Add one existing chore next.")).toBeTruthy();
  });
}

async function completeSetupWithChore() {
  await saveSetup();
  fireEvent.click(screen.getByRole("button", { name: "Add chore and continue" }));
  await waitFor(() => {
    expect(screen.getByText("Step 4 of 4")).toBeTruthy();
  });
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

    expect(screen.getByRole("heading", { name: "Chore Helper" })).toBeTruthy();
    expect(screen.getByText("Make household work visible, fair, and easier to adjust.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get Started" })).toBeTruthy();
  });

  it("routes get started to the Today command center", () => {
    renderAt("/");

    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up household" })).toBeTruthy();
  });

  it("renders compact top app navigation", () => {
    renderAt("/today");

    expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Setup" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plan" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Family" })).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  it("renders a first-time Today page without the full dense dashboard", () => {
    renderAt("/today");

    expect(screen.getByText("Let's get your household context set up.")).toBeTruthy();
    expect(screen.getByText("What comes next")).toBeTruthy();
    expect(screen.getByText("Plan health preview")).toBeTruthy();
    expect(screen.queryByText("Current chores")).toBeNull();
    expect(screen.queryByText("Week view")).toBeNull();
  });

  it("routes the first-time setup action to household setup", () => {
    renderAt("/today");

    fireEvent.click(screen.getByRole("button", { name: "Set up household" }));

    expect(screen.getByRole("heading", { name: "Household setup" })).toBeTruthy();
    expect(screen.getByLabelText("Home type")).toBeTruthy();
  });

  it("renders household basics on the setup page", () => {
    renderAt("/setup");

    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.getAllByText("Household Context").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Household name")).toBeTruthy();
    expect(screen.getByLabelText("Home type")).toBeTruthy();
    expect(screen.getByLabelText("Rooms")).toBeTruthy();
    expect(screen.getByLabelText("Flooring")).toBeTruthy();
    expect(screen.getByLabelText("Has pets")).toBeTruthy();
    expect(screen.getByLabelText("Has outdoor space")).toBeTruthy();
    expect(screen.getByLabelText("Notes")).toBeTruthy();
  });

  it("saves household context through the household APIs and moves to chore setup", async () => {
    const fetchMock = mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();

    expect(window.localStorage.getItem("chore-helper:household-id")).toBe("household-1");
    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    expect(screen.getAllByText("Existing Chores").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/households",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Home" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/households/household-1/baseline",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          homeType: "house",
          rooms: ["kitchen", "bathrooms", "bedrooms"],
          flooring: ["hardwood", "tile", "carpet"],
          hasPets: true,
          hasOutdoorSpace: true,
          notes: "We already use Google Calendar for recurring chores."
        })
      })
    );
  });

  it("does not mark setup complete after saving household context only", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();

    fireEvent.click(screen.getByRole("link", { name: "Today" }));

    expect(screen.getByText("Finish setup by adding an existing chore.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue setup" })).toBeTruthy();
  });

  it("shows review handoff after adding an existing chore", async () => {
    mockSuccessfulSetupAndChoreFetches();
    renderAt("/setup");

    await completeSetupWithChore();

    expect(screen.getByRole("heading", { name: "Review Handoff" })).toBeTruthy();
    expect(screen.getByText("1 existing chore ready for review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review existing chores" })).toBeTruthy();
  });

  it("shows setup-complete context on Today after adding an existing chore", async () => {
    mockSuccessfulSetupAndChoreFetches();
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("link", { name: "Today" }));

    expect(screen.getByText("Setup complete")).toBeTruthy();
    expect(screen.getByText("house / 3 rooms / hardwood, tile, carpet / pets / outdoor space")).toBeTruthy();
    expect(screen.getByText("1 existing chore ready for review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review existing chores" })).toBeTruthy();
  });

  it("shows Google Calendar as an upcoming setup import option", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();

    fireEvent.click(screen.getByRole("button", { name: "Continue to import options" }));

    expect(screen.getByText("Step 3 of 4")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Google Calendar import coming soon" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("routes from setup-complete Today to Plan", async () => {
    mockSuccessfulSetupAndChoreFetches()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "chore-1",
            householdId: "household-1",
            title: "Clean bathrooms",
            cadence: "weekly",
            estimatedMinutes: 5,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
  });

  it("preloads saved household context in Plan after setup", async () => {
    mockSuccessfulSetupAndChoreFetches()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "chore-1",
            householdId: "household-1",
            title: "Clean bathrooms",
            cadence: "weekly",
            estimatedMinutes: 5,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("house / 3 rooms / hardwood, tile, carpet / pets / outdoor space")).toBeTruthy();
  });

  it("uses the existing household id when submitting Plan after setup", async () => {
    const fetchMock = mockSuccessfulSetupFetches()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "chore-1",
            householdId: "household-1",
            title: "Clean bathrooms",
            cadence: "weekly",
            estimatedMinutes: 5,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "recommendation-1",
            householdId: "household-1",
            title: "Review duration for Clean bathrooms",
            rationale: "The current estimate may be too short for the scope.",
            confidence: "high",
            status: "pending"
          }
        ]
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
    await waitFor(() => {
      expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Review my chore plan" }));

    await waitFor(() => {
      expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3001/api/households/household-1/chores"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "http://localhost:3001/api/households/household-1/recommendations",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows a setup save error when the household cannot be created", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));
    renderAt("/setup");

    fireEvent.click(screen.getByRole("button", { name: "Save basics" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Could not save household setup.");
    });
  });

  it("restores saved household setup from local storage on startup", async () => {
    window.localStorage.setItem("chore-helper:household-id", "household-1");
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "household-1",
            name: "Home",
            baseline: {
              homeType: "house",
              rooms: ["kitchen", "bathrooms", "bedrooms"],
              flooring: ["hardwood", "tile", "carpet"],
              hasPets: true,
              hasOutdoorSpace: true,
              notes: "Restored setup."
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        })
    );

    renderAt("/today");

    await waitFor(() => {
      expect(screen.getByText("Finish setup by adding an existing chore.")).toBeTruthy();
    });
    expect(screen.getByText("house / 3 rooms / hardwood, tile, carpet / pets / outdoor space")).toBeTruthy();
  });

  it("shows a setup restore loading state before saved household data loads", async () => {
    window.localStorage.setItem("chore-helper:household-id", "household-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "household-1",
          name: "Home",
          baseline: {
            homeType: "house",
            rooms: ["kitchen"],
            flooring: ["tile"],
            hasPets: false,
            hasOutdoorSpace: false,
            notes: "Restoring."
          }
        })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
    );

    renderAt("/today");

    expect(screen.getByText("Loading household setup...")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Finish setup by adding an existing chore.")).toBeTruthy();
    });
  });

  it("shows a recoverable setup restore error when saved household data cannot load", async () => {
    window.localStorage.setItem("chore-helper:household-id", "missing-household");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));

    renderAt("/today");

    await waitFor(() => {
      expect(screen.getByText("We could not restore your saved household. Start setup again.")).toBeTruthy();
    });
    expect(window.localStorage.getItem("chore-helper:household-id")).toBeNull();
  });

  it("clears saved household id when startup restore cannot find it", async () => {
    window.localStorage.setItem("chore-helper:household-id", "missing-household");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));

    renderAt("/today");

    await waitFor(() => {
      expect(window.localStorage.getItem("chore-helper:household-id")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Set up household" })).toBeTruthy();
  });

  it("renders Plan as a review queue instead of a setup accordion", async () => {
    const fetchMock = mockSuccessfulSetupFetches()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "chore-1",
            householdId: "household-1",
            title: "Clean bathrooms",
            cadence: "weekly",
            estimatedMinutes: 5,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Review Queue" })).toBeTruthy();
    });
    expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Duration concern").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manual acceptance only").length).toBeGreaterThan(0);
    expect(screen.queryByText("Household Context")).toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3001/api/households/household-1/chores"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://localhost:3001/api/households/household-1/recommendations"
    );
  });

  it("shows an empty Plan queue with manual chore entry", async () => {
    mockSuccessfulSetupFetches()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    await waitFor(() => {
      expect(screen.getByText("Add one existing chore manually to start the review queue.")).toBeTruthy();
    });
    expect(screen.getByLabelText("Chore title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add chore to queue" })).toBeTruthy();
  });

  it("keeps the Plan recommendation submit flow working", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "household-1", name: "Home" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "household-1", name: "Home" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "chore-1",
            householdId: "household-1",
            title: "Clean bathrooms",
            cadence: "weekly",
            estimatedMinutes: 5,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "recommendation-1",
            title: "Review duration for Clean bathrooms",
            rationale: "The current estimate may be too short for the scope.",
            confidence: "high"
          }
        ]
      });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
    await waitFor(() => {
      expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Review my chore plan" }));

    await waitFor(() => {
      expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
