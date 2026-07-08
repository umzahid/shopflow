import type { GeoDatum } from "@/components/ui/Charts";

// Illustrative sample data — ShopFlow orders don't capture buyer geography,
// so the "Orders by region" heat map is fed from this fixed, deterministic set
// (PRD Domain 2 §2.3 explicitly allows mock data). Surfaced under a clearly
// visible "Sample data" badge so it's never mistaken for real figures.
// Grid: a coarse 4×2 world layout (col, row).
export const SAMPLE_ORDERS_BY_REGION: GeoDatum[] = [
  { label: "N. America", value: 291, col: 0, row: 0 },
  { label: "Europe", value: 412, col: 1, row: 0 },
  { label: "Asia", value: 388, col: 2, row: 0 },
  { label: "Oceania", value: 96, col: 3, row: 0 },
  { label: "S. America", value: 178, col: 0, row: 1 },
  { label: "Africa", value: 84, col: 1, row: 1 },
  { label: "Middle East", value: 133, col: 2, row: 1 },
];
