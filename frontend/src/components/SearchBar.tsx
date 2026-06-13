"use client";

import { Search } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  className?: string;
  /** Hero variant gets a larger height + integrated submit button. */
  size?: "md" | "lg";
}

export function SearchBar({
  placeholder = "Search for products, brands, merchants…",
  onSearch,
  className,
  size = "lg",
}: SearchBarProps) {
  const inputId = useId();
  const [value, setValue] = useState("");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (value.trim()) onSearch?.(value.trim());
  };

  const heightCls = size === "lg" ? "h-14 sm:h-16" : "h-12";
  const padCls = size === "lg" ? "pl-12 sm:pl-14 pr-2" : "pl-10 pr-1.5";
  const iconCls = size === "lg" ? "left-4 sm:left-5 h-5 w-5" : "left-3 h-4 w-4";

  return (
    <form
      role="search"
      onSubmit={submit}
      className={cn(
        "relative flex items-center w-full rounded-xl bg-surface",
        "border border-border shadow-token-lg",
        "transition-[box-shadow,border-color]",
        "focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/20",
        heightCls,
        className,
      )}
    >
      <label htmlFor={inputId} className="sr-only">
        Search products
      </label>
      <Search
        aria-hidden="true"
        strokeWidth={2}
        className={cn("absolute pointer-events-none text-muted-foreground", iconCls)}
      />
      <input
        id={inputId}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-full w-full bg-transparent text-base font-medium",
          "text-foreground placeholder:text-muted-foreground placeholder:font-normal",
          "focus:outline-none",
          padCls,
        )}
      />
      <Button
        type="submit"
        variant="primary"
        size={size === "lg" ? "md" : "sm"}
        className="mr-1.5 shrink-0"
        aria-label="Search"
      >
        Search
      </Button>
    </form>
  );
}
