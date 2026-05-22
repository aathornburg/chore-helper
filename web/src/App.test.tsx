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

const cleanBathroomsRowName = /Clean bathrooms.*weekly.*5 min.*manual/;
const vacuumBedroomsRowName = /Vacuum bedrooms.*weekly.*20 min.*manual/;

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

function restoreHouseholdInStorage() {
  window.localStorage.setItem("chore-helper:household-id", "household-1");
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
    expect(screen.getByRole("link", { name: "Chores" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Plan" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Family" })).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  it("keeps the dedicated chore review route out of primary navigation", async () => {
    restoreHouseholdInStorage();
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
              rooms: ["kitchen"],
              flooring: ["tile"],
              hasPets: false,
              hasOutdoorSpace: false,
              notes: ""
            }
          })
        })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
    );

    renderAt("/chores/review");

    expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Setup" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chores" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Review chores" })).toBeTruthy();
    });
  });

  it("shows Optimize chat prompts and renders an assistant answer", async () => {
    restoreHouseholdInStorage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
            estimatedMinutes: 10,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "chore-1",
            householdId: "household-1",
            title: "Clean bathrooms",
            cadence: "weekly",
            estimatedMinutes: 10,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: "Clean bathrooms may be under-scoped." })
      });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Optimize chores" })).toBeTruthy();
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "household-1", name: "Home" })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: "First answer." })
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Could not answer assistant question" })
      });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Optimize chores" })).toBeTruthy();
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

  it("routes from setup-complete Today to Chores", async () => {
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

    expect(screen.getByRole("heading", { name: "Household chores" })).toBeTruthy();
  });

  it("preloads saved household context in Chores after setup", async () => {
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
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent === "Home / house / 3 rooms / hardwood, tile, carpet / pets / outdoor space"
      ).length
    ).toBeGreaterThan(0);
  });

  it("shows a Chores loading state while the chore list loads", async () => {
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

    expect(screen.getByText("Loading chores...")).toBeTruthy();
    expect(screen.queryByText("Manual acceptance only")).toBeNull();
    expect(screen.queryByRole("tablist", { name: "Chore status filters" })).toBeNull();
    expect(screen.queryByText("Add one existing chore manually to start the review queue.")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
    });
  });

  it("shows a Chores load error when persisted chores cannot load", async () => {
    mockSuccessfulSetupAndChoreFetches()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    await waitFor(() => {
      expect(screen.getByText("Could not load chores.")).toBeTruthy();
    });
    expect(screen.queryByText("Manual acceptance only")).toBeNull();
  });

  it("uses the existing household id when submitting Chores review after setup", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/chores/review");
      expect(screen.getByRole("heading", { name: "Review chores" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));

    await waitFor(() => {
      expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3001/api/households/household-1/chores"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
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

  it("renders Chores as a chore workspace instead of a setup accordion", async () => {
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
      expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
    });
    expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    expect(screen.getByText("1 chore needs review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();
    expect(screen.queryByText("Manual acceptance only")).toBeNull();
    expect(screen.queryByLabelText("Review entry point")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start review flow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review selected chores" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply decisions" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Pending" })).toBeTruthy();
    const filters = screen.getByRole("tablist", { name: "Chore status filters" });
    const addChoreButton = screen.getByRole("button", { name: "Add chore" });
    expect(filters.contains(addChoreButton)).toBe(false);
    expect(screen.queryByRole("tab", { name: "Recommendation pending" })).toBeNull();
    expect(screen.queryByLabelText("Selected chore title")).toBeNull();
    expect(screen.queryByLabelText("Selected chore cadence")).toBeNull();
    expect(screen.queryByLabelText("Selected chore estimated minutes")).toBeNull();
    expect(screen.queryByLabelText("Selected chore source")).toBeNull();
    expect(screen.queryByText("Tracked chores")).toBeNull();
    expect(screen.queryByText("Duration concerns")).toBeNull();
    expect(screen.queryByText("Pending recommendations")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recommendations" })).toBeNull();
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

  it("routes from the Chores review CTA to the dedicated review page", async () => {
    restoreHouseholdInStorage();
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
              rooms: ["bathrooms"],
              flooring: ["tile"],
              hasPets: false,
              hasOutdoorSpace: false,
              notes: ""
            }
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
              estimatedMinutes: 30,
              source: "manual"
            },
            {
              id: "chore-2",
              householdId: "household-1",
              title: "Vacuum bedrooms",
              cadence: "weekly",
              estimatedMinutes: 20,
              source: "manual"
            }
          ]
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: "chore-1",
              householdId: "household-1",
              title: "Clean bathrooms",
              cadence: "weekly",
              estimatedMinutes: 30,
              source: "manual"
            },
            {
              id: "chore-2",
              householdId: "household-1",
              title: "Vacuum bedrooms",
              cadence: "weekly",
              estimatedMinutes: 20,
              source: "manual"
            }
          ]
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
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
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
    );

    renderAt("/chores");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "Choose chores to review" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review selected chores" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply decisions" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/chores/review");
      expect(screen.getByRole("heading", { name: "Review chores" })).toBeTruthy();
    });
  });

  it("shows filter-specific empty Chores states without the add-chore form", async () => {
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
      expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Pending" }));

    expect(screen.getByText("No chores have pending recommendations.")).toBeTruthy();
    expect(screen.queryByText("Add one existing chore manually to start the review queue.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add chore to queue" })).toBeNull();
    expect(screen.queryByLabelText("Chore title")).toBeNull();
  });

  it("keeps Google Calendar unavailable as an active Chores manual chore source", async () => {
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
      expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add chore" }));

    const sourceSelect = screen.getByLabelText("Source");

    expect(getOptionLabels(sourceSelect)).toEqual(["Manual"]);
    expect((sourceSelect as HTMLSelectElement).value).toBe("manual");
  });

  it("opens active chore editing inline only after clicking a chore row", async () => {
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
          },
          {
            id: "chore-2",
            householdId: "household-1",
            title: "Vacuum bedrooms",
            cadence: "weekly",
            estimatedMinutes: 20,
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
      expect(screen.getByRole("button", { name: cleanBathroomsRowName })).toBeTruthy();
    });

    expect(screen.queryByLabelText("Selected chore title")).toBeNull();
    expect(screen.queryByLabelText("Selected chore cadence")).toBeNull();
    expect(screen.queryByLabelText("Selected chore estimated minutes")).toBeNull();
    expect(screen.queryByLabelText("Selected chore source")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: cleanBathroomsRowName }));

    expect(screen.getByLabelText("Selected chore title")).toBeTruthy();
    expect(screen.getByLabelText("Selected chore cadence")).toBeTruthy();
    expect(screen.getByLabelText("Selected chore estimated minutes")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Selected chore title"), {
      target: { value: "Clean guest bathroom" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));

    expect(screen.queryByLabelText("Selected chore title")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: cleanBathroomsRowName }));
    expect(getFieldValue("Selected chore title")).toBe("Clean bathrooms");
  });

  it("keeps only one Chores row expanded at a time", async () => {
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
          },
          {
            id: "chore-2",
            householdId: "household-1",
            title: "Vacuum bedrooms",
            cadence: "weekly",
            estimatedMinutes: 20,
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
      expect(screen.getByRole("button", { name: cleanBathroomsRowName })).toBeTruthy();
    });

    const cleanBathroomsRow = screen.getByRole("button", { name: cleanBathroomsRowName });
    const vacuumBedroomsRow = screen.getByRole("button", { name: vacuumBedroomsRowName });

    fireEvent.click(cleanBathroomsRow);
    expect(getFieldValue("Selected chore title")).toBe("Clean bathrooms");
    expect(cleanBathroomsRow.getAttribute("aria-expanded")).toBe("true");
    expect(vacuumBedroomsRow.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(vacuumBedroomsRow);
    expect(getFieldValue("Selected chore title")).toBe("Vacuum bedrooms");
    expect(screen.getAllByLabelText("Selected chore title").length).toBe(1);
    expect(cleanBathroomsRow.getAttribute("aria-expanded")).toBe("false");
    expect(vacuumBedroomsRow.getAttribute("aria-expanded")).toBe("true");
  });

  it("edits the selected Chores chore and shows stale recommendation status", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: cleanBathroomsRowName }));
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
    expect(screen.queryByLabelText("Selected chore title")).toBeNull();
    expect(screen.getByText("Chores changed. Run review again for updated recommendations.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores/chore-1",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("archives and restores chores in Chores", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: cleanBathroomsRowName }));
    fireEvent.click(screen.getByRole("button", { name: "Archive chore" }));
    await waitFor(() => {
      expect(screen.getByText("No active chores yet. Add a chore to start building the household routine.")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore Clean bathrooms" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Show archived chores" })).toBeNull();
    expect(screen.queryByRole("button", { name: cleanBathroomsRowName })).toBeNull();
    expect(screen.queryByLabelText("Selected chore title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restore Clean bathrooms" }));

    await waitFor(() => {
      expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("tab", { name: "All active" }).getAttribute("aria-selected")).toBe("true");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores/chore-1/archive",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows chore recommendations in selected detail without a bottom recommendations panel", async () => {
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
        json: async () => [
          {
            id: "recommendation-1",
            householdId: "household-1",
            affectedChoreId: "chore-1",
            title: "Review duration for Clean bathrooms",
            rationale: "Too short.",
            confidence: "high",
            status: "pending",
            decision: "pending"
          }
        ]
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: cleanBathroomsRowName })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: cleanBathroomsRowName }));

    await waitFor(() => {
      expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Too short.")).toBeTruthy();
    expect(screen.getByText("Confidence: high")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Recommendations" })).toBeNull();
  });

  it("keeps the Chores recommendation submit flow working", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/chores/review");
    });
    fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));

    await waitFor(() => {
      expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/recommendations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reviewPrompt: "Review the selected chores and suggest practical improvements.",
          selectedChoreIds: ["chore-1"]
        })
      })
    );
  });

  it("defaults review selection to unreviewed chores while allowing reviewed chores to be re-selected", async () => {
    restoreHouseholdInStorage();
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
              rooms: ["bathrooms", "bedrooms"],
              flooring: ["tile", "carpet"],
              hasPets: false,
              hasOutdoorSpace: false,
              notes: ""
            }
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
              estimatedMinutes: 30,
              source: "manual"
            },
            {
              id: "chore-2",
              householdId: "household-1",
              title: "Vacuum bedrooms",
              cadence: "weekly",
              estimatedMinutes: 20,
              source: "manual"
            }
          ]
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: "chore-1",
              householdId: "household-1",
              title: "Clean bathrooms",
              cadence: "weekly",
              estimatedMinutes: 30,
              source: "manual"
            },
            {
              id: "chore-2",
              householdId: "household-1",
              title: "Vacuum bedrooms",
              cadence: "weekly",
              estimatedMinutes: 20,
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
              affectedChoreId: "chore-1",
              title: "Review duration for Clean bathrooms",
              rationale: "Updated duration already applied.",
              confidence: "high",
              status: "applied",
              decision: "applied"
            }
          ]
        })
    );

    renderAt("/chores/review");

    await waitFor(() => {
      expect(screen.getByLabelText("Clean bathrooms")).toBeTruthy();
    });

    const cleanBathrooms = screen.getByLabelText("Clean bathrooms") as HTMLInputElement;
    const vacuumBedrooms = screen.getByLabelText("Vacuum bedrooms") as HTMLInputElement;

    expect(cleanBathrooms.checked).toBe(false);
    expect(vacuumBedrooms.checked).toBe(true);

    fireEvent.click(cleanBathrooms);

    expect(cleanBathrooms.checked).toBe(true);
  });

  it("defaults review selection to all active chores when every chore has already been reviewed", async () => {
    restoreHouseholdInStorage();
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
              rooms: ["bathrooms", "bedrooms"],
              flooring: ["tile", "carpet"],
              hasPets: false,
              hasOutdoorSpace: false,
              notes: ""
            }
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
              estimatedMinutes: 30,
              source: "manual"
            },
            {
              id: "chore-2",
              householdId: "household-1",
              title: "Vacuum bedrooms",
              cadence: "weekly",
              estimatedMinutes: 20,
              source: "manual"
            }
          ]
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: "chore-1",
              householdId: "household-1",
              title: "Clean bathrooms",
              cadence: "weekly",
              estimatedMinutes: 30,
              source: "manual"
            },
            {
              id: "chore-2",
              householdId: "household-1",
              title: "Vacuum bedrooms",
              cadence: "weekly",
              estimatedMinutes: 20,
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
              affectedChoreId: "chore-1",
              title: "Review duration for Clean bathrooms",
              rationale: "Updated duration already applied.",
              confidence: "high",
              status: "applied",
              decision: "applied"
            },
            {
              id: "recommendation-2",
              householdId: "household-1",
              affectedChoreId: "chore-2",
              title: "Review duration for Vacuum bedrooms",
              rationale: "Updated duration already applied.",
              confidence: "medium",
              status: "applied",
              decision: "applied"
            }
          ]
        })
    );

    renderAt("/chores/review");

    await waitFor(() => {
      expect(screen.getByLabelText("Clean bathrooms")).toBeTruthy();
    });

    expect((screen.getByLabelText("Clean bathrooms") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Vacuum bedrooms") as HTMLInputElement).checked).toBe(true);
  });

  it("shows a review-page error when the review queue cannot load", async () => {
    restoreHouseholdInStorage();
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
              rooms: ["kitchen"],
              flooring: ["tile"],
              hasPets: false,
              hasOutdoorSpace: false,
              notes: ""
            }
          })
        })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
    );

    renderAt("/chores/review");

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Could not load the review queue.");
    });
    expect(screen.getAllByText("Could not load the review queue.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Review selected chores" })).toBeNull();
  });

  it("keeps the review page on selection when recommendation generation fails", async () => {
    restoreHouseholdInStorage();
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
              rooms: ["bathrooms"],
              flooring: ["tile"],
              hasPets: false,
              hasOutdoorSpace: false,
              notes: ""
            }
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
        .mockResolvedValueOnce({ ok: false })
    );

    renderAt("/chores/review");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Review selected chores" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Could not review selected chores. Adjust the selection and try again."
      );
    });
    expect(screen.getByRole("heading", { name: "Choose chores to review" })).toBeTruthy();
  });

  it("keeps the review page on recommendations when applying decisions fails", async () => {
    restoreHouseholdInStorage();
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
              rooms: ["bathrooms"],
              flooring: ["tile"],
              hasPets: false,
              hasOutdoorSpace: false,
              notes: ""
            }
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
          json: async () => [
            {
              id: "recommendation-1",
              householdId: "household-1",
              affectedChoreId: "chore-1",
              title: "Review duration for Clean bathrooms",
              rationale: "The current estimate may be too short.",
              confidence: "high",
              status: "pending",
              decision: "pending"
            }
          ]
        })
        .mockResolvedValueOnce({ ok: false })
    );

    renderAt("/chores/review");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Review selected chores" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Decide on recommendations" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply decisions" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Could not apply recommendation decisions.");
    });
    expect(screen.getByRole("heading", { name: "Decide on recommendations" })).toBeTruthy();
  });

  it("runs a staged review flow from Chores and applies decisions explicitly", async () => {
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
          },
          {
            id: "chore-2",
            householdId: "household-1",
            title: "Vacuum bedrooms",
            cadence: "weekly",
            estimatedMinutes: 20,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
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
          },
          {
            id: "chore-2",
            householdId: "household-1",
            title: "Vacuum bedrooms",
            cadence: "weekly",
            estimatedMinutes: 20,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "recommendation-1",
            householdId: "household-1",
            affectedChoreId: "chore-1",
            title: "Review duration for Clean bathrooms",
            rationale: "The current estimate may be too short.",
            confidence: "high",
            status: "pending",
            decision: "pending",
            proposedEstimatedMinutes: 30
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "recommendation-1",
          householdId: "household-1",
          affectedChoreId: "chore-1",
          title: "Review duration for Clean bathrooms",
          rationale: "The current estimate may be too short.",
          confidence: "high",
          status: "pending",
          decision: "accepted",
          proposedEstimatedMinutes: 30
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ applied: [{ id: "recommendation-1", decision: "applied" }], declined: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "chore-1",
            householdId: "household-1",
            title: "Clean bathrooms",
            cadence: "weekly",
            estimatedMinutes: 30,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Household chores" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Review chores" })).toBeTruthy());
    expect((screen.getByLabelText("Clean bathrooms") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Vacuum bedrooms") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));
    await waitFor(() => expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Accept Review duration for Clean bathrooms" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline Review duration for Clean bathrooms" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Accept" }).getAttribute("aria-pressed")).toBe("true");
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply decisions" }));

    await waitFor(() => expect(screen.getAllByText("Recommendation decisions applied.").length).toBeGreaterThan(0));
    expect(window.location.pathname).toBe("/chores/review");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/recommendations/apply",
      expect.objectContaining({ method: "POST" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to chores" }));
    expect(window.location.pathname).toBe("/chores");
  });
});
