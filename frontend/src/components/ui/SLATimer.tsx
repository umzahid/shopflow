"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

function remainingMs(deadline: string | number | Date): number {
  return new Date(deadline).getTime() - Date.now();
}

function format(ms: number): string {
  if (ms <= 0) return "Overdue";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Animated countdown to a deadline (e.g. an SLA / estimated delivery). Colour
 * shifts as time runs out: normal → warning under `warnUnderMinutes` → danger
 * when overdue. Updates once per second; stops at zero.
 */
export function SLATimer({
  deadline,
  warnUnderMinutes = 60,
  className,
  prefix,
}: {
  deadline: string | number | Date;
  warnUnderMinutes?: number;
  className?: string;
  prefix?: string;
}) {
  const [ms, setMs] = useState(() => remainingMs(deadline));

  useEffect(() => {
    setMs(remainingMs(deadline));
    const id = setInterval(() => setMs(remainingMs(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const overdue = ms <= 0;
  const warning = !overdue && ms <= warnUnderMinutes * 60_000;
  const tone = overdue
    ? "text-danger"
    : warning
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";

  return (
    <span
      role="timer"
      aria-live={warning || overdue ? "assertive" : "off"}
      className={cn("inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums", tone, className)}
    >
      <Clock
        className={cn("h-4 w-4", warning && !overdue && "animate-pulse motion-reduce:animate-none")}
        aria-hidden="true"
        strokeWidth={2}
      />
      {prefix ? `${prefix} ` : ""}
      {format(ms)}
    </span>
  );
}
