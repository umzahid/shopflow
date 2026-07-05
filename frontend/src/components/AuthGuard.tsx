"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/store/auth";

/**
 * Client-side guard: while booting, render nothing (parent still owns layout).
 * After boot, if no user, redirect to /login?next=<current path>. Once signed
 * in, render children.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const bootChecked = useAuth((s) => s.bootChecked);

  useEffect(() => {
    if (bootChecked && !user) {
      const next = encodeURIComponent(pathname || "/");
      router.replace(`/login?next=${next}`);
    }
  }, [bootChecked, user, pathname, router]);

  if (!bootChecked || !user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
