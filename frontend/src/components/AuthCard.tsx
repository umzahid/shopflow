import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-token-lg sm:p-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start font-heading text-xl font-bold tracking-tight text-secondary transition-opacity hover:opacity-80"
        >
          <ShoppingBag className="h-6 w-6" aria-hidden="true" strokeWidth={2.25} />
          ShopFlow
        </Link>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
        <div className="border-t border-border pt-5 text-center text-sm text-muted-foreground">
          {footer}
        </div>
      </div>
    </div>
  );
}
