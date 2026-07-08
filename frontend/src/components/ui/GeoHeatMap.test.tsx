import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeoHeatMap, type GeoDatum } from "./Charts";

const REGIONS: GeoDatum[] = [
  { label: "Europe", value: 412, col: 1, row: 0 },
  { label: "Asia", value: 388, col: 2, row: 0 },
  { label: "Africa", value: 84, col: 1, row: 1 },
  { label: "Antarctica", value: 0, col: 3, row: 1 },
];

describe("GeoHeatMap", () => {
  it("lists every region with its value in the accessible summary", () => {
    render(<GeoHeatMap regions={REGIONS} />);
    expect(screen.getByText("Europe")).toBeInTheDocument();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("Asia")).toBeInTheDocument();
    expect(screen.getByText("Africa")).toBeInTheDocument();
  });

  it("shades the highest-volume region more intensely than a lower one", () => {
    const { container } = render(<GeoHeatMap regions={REGIONS} />);
    const europe = container.querySelector('[data-region="Europe"]');
    const africa = container.querySelector('[data-region="Africa"]');
    const europeOpacity = Number(europe?.getAttribute("fill-opacity"));
    const africaOpacity = Number(africa?.getAttribute("fill-opacity"));
    expect(europeOpacity).toBeGreaterThan(africaOpacity);
    // Highest-volume region renders at full intensity.
    expect(europeOpacity).toBeCloseTo(1, 2);
  });

  it("renders a zero-volume region at zero fill intensity", () => {
    const { container } = render(<GeoHeatMap regions={REGIONS} />);
    const antarctica = container.querySelector('[data-region="Antarctica"]');
    expect(Number(antarctica?.getAttribute("fill-opacity"))).toBe(0);
  });

  it("exposes an accessible image role", () => {
    render(<GeoHeatMap regions={REGIONS} />);
    expect(screen.getByRole("img", { name: /orders by region/i })).toBeInTheDocument();
  });

  it("shows a no-data message when there are no regions", () => {
    render(<GeoHeatMap regions={[]} />);
    expect(screen.getByText(/no regional order data/i)).toBeInTheDocument();
  });
});
