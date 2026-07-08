# Geographic Heat Map — Design Spec

**Date:** 2026-07-08 · **Branch:** `feat/frontend-prd-tail`
**PRD ref:** Domain 2 §2.3 (merchant analytics: "geographic heat map of orders (mock data OK)")
**Status:** approved design, direct TDD implementation (small self-contained frontend change)

## Goal

A "Orders by region" tile-grid heat map on `/merchant/analytics`, shading world regions by order volume from clearly-labeled sample data. Closes the last open Domain-2 PRD item and restores the analytics page's completeness after the old geo placeholder note was removed.

## Non-goals (YAGNI)

- No live geo capture (orders don't record buyer location; mock data is PRD-sanctioned).
- No drill-down, zoom/pan, or tooltips beyond the tile's own label.
- No real map path data — a tile-grid map, not an SVG choropleth.

## Architecture

Presentational component in the existing hand-rolled chart family + a fixed mock dataset + a card mount. Three units:

### 1. `GeoHeatMap` component — `src/components/ui/Charts.tsx`

Joins `DonutChart`/`BarChart`/`ForecastChart`. Conventions matched: hand-rolled SVG, explicit hex color, opacity via inline attr (never dynamic Tailwind classes), `role="img"` + `aria-label`, and an accessible summary `<ul>`.

```ts
export interface GeoDatum {
  label: string;   // region name, e.g. "Europe"
  value: number;   // order count
  col: number;     // 0-based grid column
  row: number;     // 0-based grid row
}

export function GeoHeatMap({
  regions,
  color = "#7c3aed",   // brand secondary; explicit hex per the JIT convention
}: {
  regions: GeoDatum[];
  color?: string;
}): JSX.Element
```

- **Layout:** derive `cols = max(col)+1`, `rows = max(row)+1`; a fixed tile size (e.g. 64px) + gap; `viewBox` sized to the grid. `width="100%"`, `preserveAspectRatio` so it scales in the card.
- **Shading:** `max = Math.max(1, ...values)`; per tile `opacity = value === 0 ? 0 : 0.15 + 0.85 * (value / max)`. Zero-volume tiles render with the muted track fill (via a `className="fill-muted"` rect) so they're visibly "empty," not invisible. Non-zero tiles use `fill={color}` + the computed `fillOpacity`.
- **Tile content:** short region label + count centered in each tile (small SVG `<text>`, `fill` chosen for contrast — white text on tiles, or label below). Keep legible; if text-in-tile is fiddly, label under the tile in the summary list is the a11y source of truth.
- **Legend:** a small horizontal gradient bar "fewer → more" (5 swatches of increasing opacity of `color`).
- **Empty guard:** `regions.length === 0` → the same "No data" paragraph pattern the other charts use.
- **A11y:** `role="img"`, `aria-label="Orders by region heat map"`, plus a `<ul>` summary listing each region and its value (sorted desc), styled like `DonutChart`'s legend list. Screen readers get the full ranking as text.

### 2. Mock dataset — `src/lib/mockGeo.ts`

A fixed, deterministic (no `Math.random`) 7-region dataset with grid coordinates on a coarse 4×2 world layout:

```ts
import type { GeoDatum } from "@/components/ui/Charts";

// Illustrative sample data — ShopFlow orders don't capture buyer geography.
export const SAMPLE_ORDERS_BY_REGION: GeoDatum[] = [
  { label: "N. America",  value: 291, col: 0, row: 0 },
  { label: "Europe",      value: 412, col: 1, row: 0 },
  { label: "Asia",        value: 388, col: 2, row: 0 },
  { label: "Oceania",     value: 96,  col: 3, row: 0 },
  { label: "S. America",  value: 178, col: 0, row: 1 },
  { label: "Africa",      value: 84,  col: 1, row: 1 },
  { label: "Middle East", value: 133, col: 2, row: 1 },
];
```

### 3. Card mount — `src/app/merchant/analytics/page.tsx`

A new `<section>` card (same shell class as the other analytics cards) at the bottom of the page, titled "Orders by region" with a small **"Sample data"** badge in the header. Renders `<GeoHeatMap regions={SAMPLE_ORDERS_BY_REGION} />`. The "Sample data" badge keeps fabricated figures clearly marked as illustrative.

## Data flow

Static: `SAMPLE_ORDERS_BY_REGION` → `<GeoHeatMap regions={...} />` → SVG tiles shaded by value + summary list. No fetch, no state.

## Error / edge handling

- Empty `regions` → "No data" paragraph (consistent with `BarChart`/`ForecastChart`).
- All-zero values → `max` guarded to 1; all tiles render at the muted fill.

## Testing (Vitest + RTL)

`src/components/ui/GeoHeatMap.test.tsx`:
1. Renders one labeled entry per region in the accessible summary list.
2. The summary lists each region's value (e.g. "Europe" and "412" present).
3. Highest-value region tile carries the greatest `fill-opacity`; a lower-value region carries less (assert relative ordering via the rendered `fill-opacity` attributes, or that the max region == full-intensity).
4. Empty `regions=[]` renders the "No data" message, no crash.

Frontend-only; no backend, no integration test. Also run `npm run build` (strict TS, no `any`) + full `vitest run` before commit.

## Files touched

- **New:** `src/lib/mockGeo.ts`, `src/components/ui/GeoHeatMap.test.tsx`.
- **Edited:** `src/components/ui/Charts.tsx` (add `GeoDatum` + `GeoHeatMap`), `src/app/merchant/analytics/page.tsx` (mount card).
