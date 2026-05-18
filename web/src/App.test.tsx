import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
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
    expect(screen.getByText("Plan health")).toBeTruthy();
  });

  it("renders the app shell navigation", () => {
    renderAt("/today");

    expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Family" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  it("renders the Today dashboard overview", () => {
    renderAt("/today");

    expect(screen.getByText("Plan health")).toBeTruthy();
    expect(screen.getByText("Coverage gaps")).toBeTruthy();
    expect(screen.getByText("Setup checklist")).toBeTruthy();
    expect(screen.getByText("People")).toBeTruthy();
    expect(screen.getByText("Current chores")).toBeTruthy();
    expect(screen.getByText("Week view")).toBeTruthy();
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
