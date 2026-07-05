import { ShieldCheck, Truck, RotateCcw, BadgeCheck } from "lucide-react";

const items = [
  {
    Icon: ShieldCheck,
    title: "Secure checkout",
    body: "256-bit encryption and PCI-DSS compliant payment flows.",
  },
  {
    Icon: BadgeCheck,
    title: "Verified merchants",
    body: "Every seller passes identity and inventory checks.",
  },
  {
    Icon: Truck,
    title: "Fast shipping",
    body: "Most orders ship within 24 hours from local merchants.",
  },
  {
    Icon: RotateCcw,
    title: "30-day returns",
    body: "Hassle-free returns on anything you change your mind about.",
  },
];

export function TrustStrip() {
  return (
    <section
      aria-labelledby="trust-title"
      className="rounded-2xl border border-border bg-surface px-6 py-10 shadow-token sm:px-10 sm:py-12"
    >
      <h2 id="trust-title" className="sr-only">
        Why shop with ShopFlow
      </h2>
      <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary"
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-heading text-sm font-semibold text-foreground">
                {title}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
