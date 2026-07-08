"use client";

/**
 * Lightweight hand-rolled SVG charts — no charting dependency, matching the
 * codebase convention (see RatingHistogramBar, and the hand-rolled metrics on
 * the backend). Colors are passed explicitly as hex so Tailwind's JIT never
 * has to see dynamically-built class names.
 */

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Donut chart from labelled segments. Renders an accessible summary list. */
export function DonutChart({
  segments,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const fraction = total > 0 ? seg.value / total : 0;
      const dash = fraction * circumference;
      const arc = {
        ...seg,
        dash,
        gap: circumference - dash,
        rotation: (offset / circumference) * 360,
      };
      offset += dash;
      return arc;
    });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Donut chart, total ${total}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className="stroke-muted"
          />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-(a.rotation / 360) * circumference}
            />
          ))}
        </svg>
        {(centerValue !== undefined || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue !== undefined && (
              <span className="font-heading text-2xl font-bold text-foreground">
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="text-xs text-muted-foreground">{centerLabel}</span>
            )}
          </div>
        )}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span className="capitalize text-foreground">{seg.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-muted-foreground">
              {seg.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface GeoDatum {
  label: string;
  value: number;
  col: number;
  row: number;
}

/**
 * Tile-grid geographic heat map: one tile per region on a coarse grid, shaded
 * by order volume. Like DonutChart, the tiles carry no text — the labelled
 * summary list below is the accessible key. Each tile also has a native SVG
 * <title> for hover. Opacity is set via attr (not a Tailwind class) so the JIT
 * never sees a dynamic value.
 */
export function GeoHeatMap({
  regions,
  color = "#7c3aed", // brand secondary
}: {
  regions: GeoDatum[];
  color?: string;
}) {
  if (regions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No regional order data yet.
      </p>
    );
  }

  const TILE = 64;
  const GAP = 8;
  const cols = Math.max(...regions.map((r) => r.col)) + 1;
  const rows = Math.max(...regions.map((r) => r.row)) + 1;
  const max = Math.max(1, ...regions.map((r) => r.value));
  const W = cols * TILE + (cols - 1) * GAP;
  const H = rows * TILE + (rows - 1) * GAP;

  const opacityFor = (v: number) => (v === 0 ? 0 : 0.15 + 0.85 * (v / max));
  const ranked = [...regions].sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Orders by region heat map"
        style={{ maxWidth: W }}
      >
        {regions.map((r) => {
          const x = r.col * (TILE + GAP);
          const y = r.row * (TILE + GAP);
          return (
            <g key={r.label}>
              <title>{`${r.label}: ${r.value}`}</title>
              {/* muted base keeps zero/low-volume tiles visible */}
              <rect x={x} y={y} width={TILE} height={TILE} rx={8} className="fill-muted" />
              <rect
                x={x}
                y={y}
                width={TILE}
                height={TILE}
                rx={8}
                data-region={r.label}
                fill={color}
                fillOpacity={opacityFor(r.value)}
              />
            </g>
          );
        })}
      </svg>

      {/* intensity legend */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>fewer</span>
        {[0.15, 0.36, 0.57, 0.78, 1].map((o) => (
          <span
            key={o}
            aria-hidden="true"
            className="inline-block h-3 w-5 rounded-sm"
            style={{ backgroundColor: color, opacity: o }}
          />
        ))}
        <span>more</span>
      </div>

      {/* labelled summary — the accessible key, ranked by volume */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {ranked.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: color, opacity: opacityFor(r.value) || 0.15 }}
            />
            <span className="text-foreground">{r.label}</span>
            <span className="font-semibold tabular-nums text-muted-foreground">
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ForecastDatum {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

/** Line chart with a shaded confidence band — for demand forecasts. */
export function ForecastChart({
  points,
  height = 200,
  color = "#1d4ed8",
}: {
  points: ForecastDatum[];
  height?: number;
  color?: string;
}) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Not enough sales history to forecast yet (needs ~14 days).
      </p>
    );
  }

  const W = 600;
  const H = height;
  const pad = 8;
  const lo = Math.min(...points.map((p) => p.yhat_lower));
  const hi = Math.max(...points.map((p) => p.yhat_upper), lo + 1);
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);

  const line = points.map((p, i) => `${x(i)},${y(p.yhat)}`).join(" ");
  const band =
    points.map((p, i) => `${x(i)},${y(p.yhat_upper)}`).join(" ") +
    " " +
    points
      .map((p, i) => `${x(points.length - 1 - i)},${y(p.yhat_lower)}`)
      .reverse()
      .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Demand forecast over ${points.length} days`}
        preserveAspectRatio="none"
      >
        <polygon points={band} fill={color} opacity={0.15} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} />
      </svg>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{points[0]?.ds}</span>
        <span>{points[points.length - 1]?.ds}</span>
      </div>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
}

/** Vertical bar chart. `format` renders values in the a11y summary + tooltips. */
export function BarChart({
  data,
  height = 180,
  color = "#1d4ed8",
  format = (v) => String(v),
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No data for this period yet.
      </p>
    );
  }

  return (
    <div>
      <div
        className="flex items-end gap-1"
        style={{ height }}
        role="img"
        aria-label={`Bar chart with ${data.length} points, max ${format(max)}`}
      >
        {data.map((d) => (
          <div
            key={d.label}
            className="group relative flex flex-1 flex-col items-center justify-end"
            title={`${d.label}: ${format(d.value)}`}
          >
            <div
              className="w-full rounded-t transition-[height] motion-reduce:transition-none"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value > 0 ? 2 : 0,
                backgroundColor: color,
              }}
            />
          </div>
        ))}
      </div>
      {/* Sparse axis labels: first, middle, last — avoids crowding */}
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
