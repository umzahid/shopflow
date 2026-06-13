import Link from "next/link";
import { Store, ShoppingBag } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-secondary transition-opacity hover:opacity-80"
        >
          <ShoppingBag className="h-6 w-6" aria-hidden="true" strokeWidth={2.25} />
          ShopFlow
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/merchant/apply"
            className="hidden sm:inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Store className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            Sell on ShopFlow
          </Link>
          <ThemeToggle />
          <Button variant="secondary" size="sm" className="hidden sm:inline-flex">
            Sign in
          </Button>
        </nav>
      </div>
    </header>
  );
}
