import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("renders the household baseline entry point", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Household Baseline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate expert suggestions" })).toBeTruthy();
  });

  it("renders editable household context fields", () => {
    render(<App />);

    expect(screen.getByLabelText("Household name")).toBeTruthy();
    expect(screen.getByLabelText("Home type")).toBeTruthy();
    expect(screen.getByLabelText("Rooms")).toBeTruthy();
    expect(screen.getByLabelText("Flooring")).toBeTruthy();
    expect(screen.getByLabelText("Has pets")).toBeTruthy();
    expect(screen.getByLabelText("Has outdoor space")).toBeTruthy();
    expect(screen.getByLabelText("Notes")).toBeTruthy();
  });

  it("renders existing chore fields for optimization context", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Existing chore" })).toBeTruthy();
    expect(screen.getByLabelText("Chore title")).toBeTruthy();
    expect(screen.getByLabelText("Cadence")).toBeTruthy();
    expect(screen.getByLabelText("Estimated minutes")).toBeTruthy();
    expect(screen.getByLabelText("Source")).toBeTruthy();
  });
});
