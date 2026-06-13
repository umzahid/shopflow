"use client";

import { useEffect } from "react";

import { silentRefresh } from "@/lib/api";
import { useAuth } from "@/store/auth";

/**
 * Runs once on app boot in the Providers tree. Attempts a silent refresh
 * using the httpOnly cookie so a page reload restores the signed-in user
 * without forcing them back through /login.
 */
export function AuthBoot() {
  const setBootChecked = useAuth((s) => s.setBootChecked);
  useEffect(() => {
    silentRefresh().finally(() => setBootChecked());
  }, [setBootChecked]);
  return null;
}
