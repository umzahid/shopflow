"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useLogout } from "@/lib/auth";
import { useAuth } from "@/store/auth";

export function AuthMenu() {
  const user = useAuth((s) => s.user);
  const bootChecked = useAuth((s) => s.bootChecked);
  const logout = useLogout();
  const router = useRouter();
  const { toast } = useToast();

  // Until silent-refresh completes we don't know which UI to render.
  // Show a placeholder block of the same width so the header doesn't reflow.
  if (!bootChecked) {
    return (
      <div
        aria-hidden="true"
        className="hidden sm:block h-11 w-20 rounded-lg bg-muted/40"
      />
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="hidden sm:inline-flex h-11 cursor-pointer items-center rounded-lg border-2 border-secondary px-4 font-heading text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="hidden sm:flex items-center gap-1">
      <span
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-muted/60 px-3 text-sm font-semibold text-foreground"
        title={user.email}
      >
        <UserIcon className="h-4 w-4 text-secondary" aria-hidden="true" strokeWidth={2} />
        <span className="max-w-[8rem] truncate">{user.email}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        loading={logout.isPending}
        leftIcon={<LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={2} />}
        onClick={() => {
          logout.mutate(undefined, {
            onSettled: () => {
              toast({ title: "Signed out", variant: "info" });
              router.push("/");
            },
          });
        }}
        aria-label="Sign out"
      >
        Sign out
      </Button>
    </div>
  );
}
