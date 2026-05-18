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

async function saveSetup() {
  fireEvent.click(screen.getByRole("button", { name: "Save basics" }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    expect(screen.getByRole("link", { name: "Family" })).toBeTruthy();
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

    expect(screen.getByLabelText("Household name")).toBeTruthy();
    expect(screen.getByLabelText("Home type")).toBeTruthy();
    expect(screen.getByLabelText("Rooms")).toBeTruthy();
    expect(screen.getByLabelText("Flooring")).toBeTruthy();
    expect(screen.getByLabelText("Has pets")).toBeTruthy();
    expect(screen.getByLabelText("Has outdoor space")).toBeTruthy();
    expect(screen.getByLabelText("Notes")).toBeTruthy();
  });

  it("saves setup through the household APIs and returns to Today", async () => {
    const fetchMock = mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();

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

  it("shows setup-complete context on Today after saving household basics", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();

    expect(screen.getByText("Setup complete")).toBeTruthy();
    expect(screen.getByText("house / 3 rooms / hardwood, tile, carpet / pets / outdoor space")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review existing chores" })).toBeTruthy();
  });

  it("routes from setup-complete Today to Plan", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
  });

  it("preloads saved household context in Plan after setup", async () => {
    mockSuccessfulSetupFetches();
    renderAt("/setup");

    await saveSetup();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    expect(screen.getByDisplayValue("Home")).toBeTruthy();
    expect(screen.getByText("house / 3 rooms / hardwood, tile, carpet / pets / outdoor space")).toBeTruthy();
  });

  it("uses the existing household id when submitting Plan after setup", async () => {
    const fetchMock = mockSuccessfulSetupFetches()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "chore-1", title: "Clean bathrooms" })
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

    await saveSetup();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
    fireEvent.click(screen.getByRole("button", { name: "Review my chore plan" }));

    await waitFor(() => {
      expect(screen.getByText("Review duration for Clean bathrooms")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
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
        json: async () => ({ id: "chore-1", title: "Clean bathrooms" })
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
    renderAt("/plan");

    fireEvent.click(screen.getByRole("button", { name: "Review my chore plan" }));

    await waitFor(() => {
      expect(screen.getByText("Review duration for Clean bathrooms")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
