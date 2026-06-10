import { describe, expect, it } from "vitest";
import { calculateCalendarMarkerGeometry } from "./LandingPage";

describe("calculateCalendarMarkerGeometry", () => {
  it("anchors the marker to the measured source and target cards", () => {
    const geometry = calculateCalendarMarkerGeometry({
      layer: { left: 20, top: 40, width: 320, height: 520 },
      source: { left: 60, top: 180, width: 220, height: 42 },
      target: { left: 70, top: 360, width: 230, height: 86 }
    });

    expect(geometry.viewBox).toBe("0 0 320 520");
    expect(geometry.pulse).toEqual({ cx: 132, cy: 167, r: 8 });
    expect(geometry.ring).toEqual({ cx: 165, cy: 363, rx: 96, ry: 51 });
    expect(geometry.arrowHead).toEqual({ path: "M 109 316 L 125 321 L 120 305", x: 125, y: 321 });
    expect(geometry.path).toBe("M 132 167 C 66 196, 78 275, 125 321");
  });

  it("arches above the calendar when source and target are on the same row", () => {
    const geometry = calculateCalendarMarkerGeometry({
      layer: { left: 100, top: 80, width: 620, height: 190 },
      source: { left: 250, top: 170, width: 60, height: 36 },
      target: { left: 450, top: 175, width: 70, height: 44 }
    });

    expect(geometry.arrowHead).toEqual({ path: "M 348 96 L 365 97 L 356 82", x: 365, y: 97 });
    expect(geometry.path).toBe("M 175 113 C 242 58, 299 58, 365 97");
  });
});
