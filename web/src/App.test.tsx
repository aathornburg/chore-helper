import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function fillSetupBasics() {
  fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "Home" } });
  fireEvent.change(screen.getByLabelText("Rooms"), {
    target: { value: "kitchen, bathrooms, bedrooms" }
  });
  fireEvent.change(screen.getByLabelText("Flooring"), {
    target: { value: "hardwood, tile, carpet" }
  });
  const hasPets = screen.getByLabelText("Has pets") as HTMLInputElement;
  const hasOutdoorSpace = screen.getByLabelText("Has outdoor space") as HTMLInputElement;
  if (!hasPets.checked) fireEvent.click(hasPets);
  if (!hasOutdoorSpace.checked) fireEvent.click(hasOutdoorSpace);
  fireEvent.change(screen.getByLabelText("Notes"), {
    target: { value: "We already use Google Calendar for recurring chores." }
  });
}

function fillExistingChore() {
  fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Clean bathrooms" } });
  fireEvent.change(screen.getByLabelText("Cadence"), { target: { value: "weekly" } });
  fireEvent.change(screen.getByLabelText("Estimated minutes"), { target: { value: "5" } });
}

function getOptionLabels(select: HTMLElement) {
  return Array.from((select as HTMLSelectElement).options).map((option) => option.textContent);
}

function getFieldValue(label: string) {
  return (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).value;
}

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
  fillSetupBasics();
  fireEvent.click(screen.getByRole("button", { name: "Save basics" }));
  await waitFor(() => {
    expect(screen.getByText("Household context saved. Add one existing chore next.")).toBeTruthy();
  });
}

async function completeSetupWithChore() {
  await saveSetup();
  fillExistingChore();
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

  it("renders setup forms with blank user-entered defaults instead of demo values", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    expect(getFieldValue("Household name")).toBe("");
    expect(getFieldValue("Rooms")).toBe("");
    expect(getFieldValue("Flooring")).toBe("");
    expect(getFieldValue("Notes")).toBe("");

    await saveSetup();

    expect(getFieldValue("Chore title")).toBe("");
    expect(getFieldValue("Cadence")).toBe("");
    expect(getFieldValue("Estimated minutes")).toBe("");
  });

  it("prevents jumping to existing chores before household context is saved", () => {
    renderAt("/setup");

    fireEvent.click(screen.getByRole("button", { name: /Existing Chores/ }));

    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Save household context before adding chores.");
  });

  it("prevents review handoff until at least one existing chore is saved", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();
    fireEvent.click(screen.getByRole("button", { name: "Continue to import options" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to review handoff" }));

    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Add at least one existing chore before review.");
  });

  it("shows setup progress after household context is saved", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();

    expect(screen.getByText("Household context saved")).toBeTruthy();
    expect(screen.getByText("No existing chores saved yet")).toBeTruthy();
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

  it("shows the Plan handoff as the primary action after setup completes", async () => {
    mockSuccessfulSetupAndChoreFetches();
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("link", { name: "Today" }));

    expect(screen.getByRole("button", { name: "Review existing chores" })).toBeTruthy();
    expect(screen.getByText("Next best action")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Review the current chore plan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up household" })).toBeNull();
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

  it("keeps Google Calendar unavailable as an active setup chore source", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();

    const sourceSelect = screen.getByLabelText("Source");

    expect(getOptionLabels(sourceSelect)).toEqual(["Manual"]);
    expect((sourceSelect as HTMLSelectElement).value).toBe("manual");
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

  it("shows a Plan loading state while the review queue loads", async () => {
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

    expect(screen.getByText("Loading review queue...")).toBeTruthy();
    expect(screen.queryByText("Add one existing chore manually to start the review queue.")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Review Queue" })).toBeTruthy();
    });
  });

  it("shows a Plan load error when persisted chores cannot load", async () => {
    mockSuccessfulSetupAndChoreFetches()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    await waitFor(() => {
      expect(screen.getByText("Could not load the review queue.")).toBeTruthy();
    });
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

    fillSetupBasics();
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

  it("populates setup context fields after restoring saved household setup", async () => {
    window.localStorage.setItem("chore-helper:household-id", "household-1");
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "household-1",
            name: "Restored Home",
            baseline: {
              homeType: "townhouse",
              rooms: ["kitchen", "bathrooms"],
              flooring: ["hardwood", "tile"],
              hasPets: true,
              hasOutdoorSpace: false,
              notes: "Restored setup notes."
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        })
    );

    renderAt("/setup");

    await waitFor(() => {
      expect(screen.getByText("Household context saved")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Household Context/ }));

    expect(getFieldValue("Household name")).toBe("Restored Home");
    expect((screen.getByLabelText("Home type") as HTMLSelectElement).value).toBe("townhouse");
    expect(getFieldValue("Rooms")).toBe("kitchen, bathrooms");
    expect(getFieldValue("Flooring")).toBe("hardwood, tile");
    expect((screen.getByLabelText("Has pets") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Has outdoor space") as HTMLInputElement).checked).toBe(false);
    expect(getFieldValue("Notes")).toBe("Restored setup notes.");
  });

  it("keeps direct setup restore non-actionable until saved household data loads", async () => {
    window.localStorage.setItem("chore-helper:household-id", "household-1");
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "household-1",
            name: "Restored Home",
            baseline: {
              homeType: "townhouse",
              rooms: ["kitchen", "bathrooms"],
              flooring: ["hardwood", "tile"],
              hasPets: true,
              hasOutdoorSpace: false,
              notes: "Restored setup notes."
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        })
    );

    renderAt("/setup");

    expect(screen.getByText("Loading household setup...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save basics" })).toBeNull();
    await waitFor(() => {
      expect(screen.getByText("Household context saved")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Household Context/ }));

    expect(getFieldValue("Household name")).toBe("Restored Home");
    expect(getFieldValue("Rooms")).toBe("kitchen, bathrooms");
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

  it("keeps Google Calendar unavailable as an active Plan manual chore source", async () => {
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

    const sourceSelect = screen.getByLabelText("Source");

    expect(getOptionLabels(sourceSelect)).toEqual(["Manual"]);
    expect((sourceSelect as HTMLSelectElement).value).toBe("manual");
  });

  it("edits the selected Plan chore and shows stale recommendation status", async () => {
    const fetchMock = mockSuccessfulSetupAndChoreFetches()
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
        json: async () => [
          {
            id: "recommendation-1",
            householdId: "household-1",
            title: "Review duration for Clean bathrooms",
            rationale: "Too short.",
            confidence: "high",
            status: "pending"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chore-1",
          householdId: "household-1",
          title: "Clean main bathroom",
          cadence: "biweekly",
          estimatedMinutes: 30,
          source: "manual"
        })
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
    await waitFor(() => {
      expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("Selected chore title"), {
      target: { value: "Clean main bathroom" }
    });
    fireEvent.change(screen.getByLabelText("Selected chore cadence"), {
      target: { value: "biweekly" }
    });
    fireEvent.change(screen.getByLabelText("Selected chore estimated minutes"), {
      target: { value: "30" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save chore changes" }));

    await waitFor(() => {
      expect(screen.getAllByText("Clean main bathroom").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Chores changed. Run review again for updated recommendations.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores/chore-1",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("archives and restores chores in Plan", async () => {
    const fetchMock = mockSuccessfulSetupAndChoreFetches()
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual",
          archivedAt: "2026-05-20T00:00:00.000Z"
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
            source: "manual",
            archivedAt: "2026-05-20T00:00:00.000Z"
          }
        ]
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
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
    await waitFor(() => {
      expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Archive chore" }));
    await waitFor(() => {
      expect(screen.getByText("No active chores in the review queue.")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Show archived chores" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore Clean bathrooms" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore Clean bathrooms" }));

    await waitFor(() => {
      expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores/chore-1/archive",
      expect.objectContaining({ method: "POST" })
    );
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
