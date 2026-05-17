import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the household baseline entry point", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Household Baseline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate expert suggestions" })).toBeTruthy();
  });
});
