import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("renders the household baseline entry point", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Chore Helper" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review my chore plan" })).toBeTruthy();
  });

  it("renders the accordion journey sections", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Household Context" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Existing Chore" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Agent Review" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recommendations" })).toBeTruthy();
  });

  it("only shows household context inputs on initial load", () => {
    render(<App />);

    expect(screen.getByLabelText("Household name")).toBeTruthy();
    expect(screen.getByLabelText("Home type")).toBeTruthy();
    expect(screen.getByLabelText("Rooms")).toBeTruthy();
    expect(screen.getByLabelText("Flooring")).toBeTruthy();
    expect(screen.getByLabelText("Has pets")).toBeTruthy();
    expect(screen.getByLabelText("Has outdoor space")).toBeTruthy();
    expect(screen.getByLabelText("Notes")).toBeTruthy();
    expect(screen.queryByLabelText("Chore title")).toBeNull();
    expect(screen.queryByLabelText("Tell the assistant what kind of help would be useful")).toBeNull();
  });

  it("shows an existing chore summary before its inputs are expanded", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Existing Chore" })).toBeTruthy();
    expect(screen.getByText("Clean bathrooms / weekly / 5 min / manual")).toBeTruthy();
    expect(screen.queryByLabelText("Chore title")).toBeNull();
  });

  it("reveals existing chore inputs when the section is edited", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Existing Chore" }));

    expect(screen.getByLabelText("Chore title")).toBeTruthy();
    expect(screen.getByLabelText("Cadence")).toBeTruthy();
    expect(screen.getByLabelText("Estimated minutes")).toBeTruthy();
    expect(screen.getByLabelText("Source")).toBeTruthy();
  });

  it("reveals the agent review prompt when the section is edited", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Agent Review" }));

    expect(screen.getByLabelText("Tell the assistant what kind of help would be useful")).toBeTruthy();
  });
});
