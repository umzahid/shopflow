"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Shared cinematic easing (matches the CSS fade-up curve).
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Reveal — fade-and-rise entrance when the element scrolls into view.
 * Honors prefers-reduced-motion by rendering static content.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
}

/** Stagger container — children animate in sequence. Pair with <StaggerItem>. */
export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : "hidden"}
      whileInView={reduce ? undefined : "show"}
      viewport={{ once: true, margin: "-80px" }}
      variants={{ show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? undefined : itemVariants}>
      {children}
    </motion.div>
  );
}

/** Thin scroll-progress bar pinned to the top of the viewport. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-secondary via-primary to-accent"
    />
  );
}

/** Animated iridescent aurora blobs behind glass. Ambient, decorative. */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="animate-aurora absolute -left-24 -top-24 h-[38rem] w-[38rem] rounded-full bg-secondary/30 blur-3xl" />
      <div className="animate-aurora absolute right-[-8rem] top-1/4 h-[32rem] w-[32rem] rounded-full bg-primary/25 blur-3xl [animation-delay:-7s]" />
      <div className="animate-aurora absolute bottom-[-10rem] left-1/3 h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-3xl [animation-delay:-14s]" />
    </div>
  );
}

/** Glass surface card. `strong` for nav/climax panels. */
export function GlassCard({
  children,
  className,
  strong = false,
  shimmer = false,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  shimmer?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        strong ? "glass-strong" : "glass",
        shimmer && "shimmer",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Count-up number that animates once when scrolled into view. */
export function Counter({
  to,
  suffix = "",
  decimals = 0,
  className,
}: {
  to: number;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(to.toFixed(decimals));
      return;
    }
    const controls = animate(mv, to, {
      duration: 1.4,
      ease: EASE,
      onUpdate: (v) => setDisplay(v.toFixed(decimals)),
    });
    return () => controls.stop();
  }, [inView, reduce, to, decimals, mv]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}

/** Subtle parallax translate driven by page scroll, for hero layers. */
export function useParallax(distance: number) {
  const { scrollY } = useScroll();
  const reduce = useReducedMotion();
  const y = useTransform(scrollY, [0, 600], [0, reduce ? 0 : distance]);
  return y;
}
