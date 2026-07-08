"use client";

import {
  ArrowRight,
  LineChart,
  MessageSquareText,
  Quote,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Wand2,
  Zap,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  Aurora,
  Counter,
  GlassCard,
  Reveal,
  ScrollProgress,
  Stagger,
  StaggerItem,
  useParallax,
} from "@/components/landing/primitives";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-background text-foreground">
      <ScrollProgress />
      <LandingNav />
      <main id="main">
        <Hero />
        <TechStrip />
        <Stats />
        <ProblemChapter />
        <FeatureBento />
        <HowItWorks />
        <PerformanceBand />
        <SocialProof />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}

/* ─── Nav ─────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#ai", label: "AI" },
];

function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-2xl px-4 glass-strong">
        <Link href="/landing" className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
          <Sparkles className="h-5 w-5 text-secondary" aria-hidden="true" strokeWidth={2.25} />
          ShopFlow
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/"
            className="group inline-flex h-10 items-center gap-1.5 rounded-lg bg-secondary px-4 text-sm font-semibold text-secondary-foreground transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Open the app
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────────── */

function FloatCard({
  children,
  className,
  delay = 0,
  float = 10,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  float?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 30, scale: 0.96 }}
      animate={
        reduce
          ? undefined
          : { opacity: 1, y: [0, -float, 0], scale: 1 }
      }
      transition={
        reduce
          ? undefined
          : {
              opacity: { duration: 0.6, delay },
              scale: { duration: 0.6, delay },
              y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay },
            }
      }
    >
      {children}
    </motion.div>
  );
}

function Hero() {
  const y = useParallax(80);
  const reduce = useReducedMotion();
  return (
    <section className="relative flex min-h-dvh items-center justify-center px-4 pt-24 sm:px-6">
      <Aurora />
      <motion.div style={reduce ? undefined : { y }} className="relative z-10 mx-auto max-w-4xl text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-secondary glass">
            <Zap className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
            AI-powered commerce, end to end
          </span>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="mt-6 text-balance font-heading text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            Commerce,{" "}
            <span className="text-iridescent">reimagined</span> by AI.
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Semantic search, demand forecasting, fraud detection, and a merchant
            copilot — a full storefront and admin, with intelligence built into
            every step.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="shimmer group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Browse the storefront
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="/merchant"
              className="inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold text-foreground transition-colors glass hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Store className="h-4 w-4" aria-hidden="true" />
              Merchant dashboard
            </Link>
          </div>
        </Reveal>

        {/* Floating glass feature chips */}
        <div className="pointer-events-none mt-16 hidden items-end justify-center gap-4 sm:flex">
          <FloatCard delay={0.3} float={12}>
            <GlassCard className="pointer-events-auto flex items-center gap-3 px-4 py-3 text-left">
              <Search className="h-5 w-5 text-secondary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Semantic search</p>
                <p className="text-xs text-muted-foreground">Understands intent, not just keywords</p>
              </div>
            </GlassCard>
          </FloatCard>
          <FloatCard delay={0.45} float={16}>
            <GlassCard className="pointer-events-auto flex items-center gap-3 px-4 py-3 text-left">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Fraud shield</p>
                <p className="text-xs text-muted-foreground">Scores every order at checkout</p>
              </div>
            </GlassCard>
          </FloatCard>
          <FloatCard delay={0.6} float={12}>
            <GlassCard className="pointer-events-auto flex items-center gap-3 px-4 py-3 text-left">
              <MessageSquareText className="h-5 w-5 text-accent" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Merchant copilot</p>
                <p className="text-xs text-muted-foreground">Ask your store anything</p>
              </div>
            </GlassCard>
          </FloatCard>
        </div>
      </motion.div>
    </section>
  );
}

/* ─── Tech strip ──────────────────────────────────────────────────────── */

const STACK = ["FastAPI", "Next.js 14", "PostgreSQL + pgvector", "Redis", "Prophet", "LightGBM", "Claude"];

function TechStrip() {
  return (
    <Reveal as="section" className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Built on a modern, open stack
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {STACK.map((t) => (
          <span key={t} className="text-sm font-semibold text-muted-foreground/80">
            {t}
          </span>
        ))}
      </div>
    </Reveal>
  );
}

/* ─── Stats ───────────────────────────────────────────────────────────── */

const STATS = [
  { to: 5, suffix: "", label: "AI features, shipped" },
  { to: 3, suffix: "", label: "search modes (lexical · semantic · hybrid)" },
  { to: 0.98, decimals: 2, suffix: "", label: "fraud model ROC-AUC" },
  { to: 0, suffix: "", label: "critical accessibility issues" },
];

function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {STATS.map((s) => (
          <StaggerItem key={s.label}>
            <GlassCard className="h-full p-6 text-center">
              <p className="font-heading text-4xl font-bold text-iridescent">
                <Counter to={s.to} decimals={s.decimals} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
            </GlassCard>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

/* ─── Problem chapter ─────────────────────────────────────────────────── */

function ProblemChapter() {
  return (
    <section className="relative mx-auto max-w-5xl px-6 py-24">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-widest text-secondary">The old way</p>
          <h2 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">
            From spreadsheets to superpowers.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Most small merchants run on a patchwork — a hosted storefront here,
            order tracking in a spreadsheet there, and no real insight into what
            sells, what&apos;s about to run out, or which orders are risky.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <GlassCard className="p-6">
            <ul className="flex flex-col gap-4 text-sm">
              {[
                "Keyword search that misses what shoppers mean",
                "Stockouts you only notice after the sale is lost",
                "Fraud caught after fulfilment, not before",
                "Business questions that take a data analyst to answer",
              ].map((pain) => (
                <li key={pain} className="flex items-start gap-3 text-muted-foreground">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                  {pain}
                </li>
              ))}
            </ul>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Feature bento ───────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: Search,
    tint: "text-secondary",
    title: "Semantic + hybrid search",
    body: "pgvector embeddings blended with keyword rank (0.7 / 0.3), so “something to keep drinks cold” finds the vacuum flask.",
    span: "md:col-span-2",
  },
  {
    icon: TrendingUp,
    tint: "text-primary",
    title: "Demand forecasting",
    body: "Prophet per-product forecasts with restock alerts before you run out.",
    span: "",
  },
  {
    icon: ShieldCheck,
    tint: "text-primary",
    title: "Fraud detection",
    body: "A LightGBM model scores every checkout with SHAP-style reasons; risky orders route to review.",
    span: "",
  },
  {
    icon: MessageSquareText,
    tint: "text-accent",
    title: "Merchant copilot",
    body: "Ask your store questions in plain language — a tool-calling agent answers from your own data only.",
    span: "md:col-span-2",
  },
  {
    icon: Wand2,
    tint: "text-secondary",
    title: "AI product descriptions",
    body: "Generate on-brand copy from a title and a few attributes, one click in the editor.",
    span: "",
  },
  {
    icon: LineChart,
    tint: "text-primary",
    title: "Merchant analytics",
    body: "Revenue windows, orders by status, top products, and a fulfilment funnel at a glance.",
    span: "md:col-span-2",
  },
];

function FeatureBento() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <Aurora className="opacity-60" />
      <Reveal className="relative text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Features</p>
        <h2 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">
          Intelligence at every step.
        </h2>
      </Reveal>
      <Stagger className="relative mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, tint, title, body, span }) => (
          <StaggerItem key={title} className={span}>
            <GlassCard shimmer className="group h-full p-6 transition-transform duration-300 hover:-translate-y-1">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl glass">
                <Icon className={cnTint(tint)} aria-hidden="true" strokeWidth={2} />
              </span>
              <h3 className="mt-4 font-heading text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </GlassCard>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

function cnTint(tint: string) {
  return `h-5 w-5 ${tint}`;
}

/* ─── How it works ────────────────────────────────────────────────────── */

const STEPS = [
  { n: "01", title: "List your products", body: "Add products and let AI draft descriptions and embeddings automatically." },
  { n: "02", title: "Sell with confidence", body: "Shoppers find what they mean; every checkout is fraud-scored in real time." },
  { n: "03", title: "Grow with insight", body: "Forecasts, restock alerts, and a copilot that answers questions about your store." },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <Reveal className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">How it works</p>
        <h2 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">Three steps to smarter selling.</h2>
      </Reveal>
      <Stagger className="mt-12 grid gap-4 md:grid-cols-3" gap={0.12}>
        {STEPS.map((s) => (
          <StaggerItem key={s.n}>
            <GlassCard className="h-full p-7">
              <span className="font-heading text-5xl font-bold text-iridescent">{s.n}</span>
              <h3 className="mt-4 font-heading text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </GlassCard>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

/* ─── Performance band ────────────────────────────────────────────────── */

function PerformanceBand() {
  return (
    <section id="ai" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
      <Reveal>
        <GlassCard strong className="overflow-hidden p-8 sm:p-12">
          <Aurora className="opacity-50" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1.3fr_1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Engineered for speed</p>
              <h2 className="mt-3 font-heading text-3xl font-bold">Sub-second search, even under load.</h2>
              <p className="mt-4 text-muted-foreground">
                Query embeddings are cached and run off the request event loop, so
                concurrent traffic stays responsive. Hybrid ranking blends meaning
                and keywords for relevance you can feel.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { k: "hybrid", v: "0.7/0.3", d: "semantic · keyword" },
                { k: "encode", v: "cached", d: "repeat queries" },
                { k: "p95 ↓", v: "~55%", d: "listing latency" },
                { k: "search ↓", v: "~60%", d: "under load" },
              ].map((m) => (
                <div key={m.k} className="rounded-xl p-4 text-center glass">
                  <p className="font-heading text-2xl font-bold">{m.v}</p>
                  <p className="text-xs text-muted-foreground">{m.d}</p>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}

/* ─── Social proof (placeholders — no fabricated quotes) ──────────────── */

function SocialProof() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <Reveal className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Loved by merchants</p>
        <h2 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">What sellers will say.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Placeholder quotes — swap in real merchant testimonials before launch.
        </p>
      </Reveal>
      <Stagger className="mt-12 grid gap-4 md:grid-cols-3">
        {["[Client A]", "[Client B]", "[Client C]"].map((who) => (
          <StaggerItem key={who}>
            <GlassCard className="flex h-full flex-col p-6">
              <Quote className="h-6 w-6 text-secondary/70" aria-hidden="true" />
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                [Testimonial placeholder — add a real merchant quote about how
                ShopFlow changed their workflow.]
              </p>
              <p className="mt-4 text-sm font-semibold">
                {who} <span className="font-normal text-muted-foreground">· [role, store]</span>
              </p>
            </GlassCard>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

/* ─── Final CTA (climax) ──────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="relative mx-auto max-w-5xl px-6 py-24">
      <Reveal>
        <GlassCard strong className="relative overflow-hidden p-12 text-center sm:p-16">
          <Aurora />
          <div className="relative">
            <h2 className="text-balance font-heading text-4xl font-bold leading-tight sm:text-5xl">
              Start selling <span className="text-iridescent">smarter</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Explore the storefront or jump into the merchant dashboard — the
              whole platform runs locally with one command.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="shimmer group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-xl bg-primary px-7 font-semibold text-primary-foreground transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Launch ShopFlow
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                href="/products"
                className="inline-flex h-12 items-center gap-2 rounded-xl px-7 font-semibold text-foreground glass hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Browse products
              </Link>
            </div>
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────── */

function LandingFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-6 pb-12">
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl px-6 py-6 glass sm:flex-row">
        <span className="flex items-center gap-2 font-heading font-bold">
          <Sparkles className="h-5 w-5 text-secondary" aria-hidden="true" />
          ShopFlow
        </span>
        <p className="text-xs text-muted-foreground">
          An AI-powered e-commerce demo. Built end to end — backend, storefront,
          ML, infra, and QA.
        </p>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/" className="text-muted-foreground hover:text-foreground">Storefront</Link>
          <Link href="/merchant" className="text-muted-foreground hover:text-foreground">Merchant</Link>
        </div>
      </div>
    </footer>
  );
}
