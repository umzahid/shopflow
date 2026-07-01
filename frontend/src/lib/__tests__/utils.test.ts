import { describe, expect, it } from "vitest";

import { cn, formatPrice } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("dedupes tailwind conflicts (twMerge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional class arrays", () => {
    expect(cn("base", ["extra", false && "hidden", "shown"])).toBe(
      "base extra shown",
    );
  });
});

describe("formatPrice", () => {
  it("formats numeric values as USD", () => {
    expect(formatPrice(9.5)).toBe("$9.50");
  });

  it("accepts string inputs", () => {
    expect(formatPrice("129.00")).toBe("$129.00");
  });

  it("rounds to two decimals", () => {
    expect(formatPrice(1.995)).toBe("$2.00");
  });
});
