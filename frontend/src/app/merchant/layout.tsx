"use client";

import { BarChart3, LayoutDashboard, Package, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Header } from "@/components/Header";
import { useAuth } from "@/store/auth";

const NAV = [
  { href: "/merchant", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/merchant/products", label: "Products", icon: Package, exact: false },
  { href: "/merchant/orders", label: "Orders", icon: ShoppingCart, exact: false },
  { href: "/merchant/analytics", label: "Analytics", icon: BarChart3, exact: false },
];

/**
 * Merchant-only shell. Reuses the AuthGuard pattern but additionally requires
 * role === "merchant"; customers are bounced to the storefront. The backend
 * enforces the same rule (require_role), so this is UX, not the security
 * boundary.
 */
export default function MerchantLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const bootChecked = useAuth((s) => s.bootChecked);

  useEffect(() => {
    if (!bootChecked) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/merchant")}`);
    } else if (user.role !== "merchant") {
      router.replace("/");
    }
  }, [bootChecked, user, pathname, router]);

  if (!bootChecked || !user || user.role !== "merchant") {
    return (
      <>
        <Header />
        <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4">
          <p className="text-sm text-muted-foreground">
            {!bootChecked
              ? "Checking your session…"
              : "Redirecting…"}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav
          aria-label="Merchant sections"
          className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
        >
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  active
                    ? "border-secondary text-secondary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>
        <main id="main">{children}</main>
      </div>
    </>
  );
}
