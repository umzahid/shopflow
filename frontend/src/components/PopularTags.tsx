"use client";

// Marketplace pattern wants "popular searches" chips below the hero search.
// Hard-coded for now; once GET /products/search?q= is wired into routing,
// each chip becomes a Link to /products?q=<tag>.
const TAGS = [
  "Coffee",
  "Espresso",
  "Ceramic mugs",
  "Pour-over",
  "Beans",
  "Cables",
];

interface PopularTagsProps {
  onSelect?: (tag: string) => void;
}

export function PopularTags({ onSelect }: PopularTagsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Popular:
      </span>
      {TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelect?.(tag)}
          // h-9 + py via hit area = 36px — under the 44pt mobile target on
          // purpose. The visual chip stays compact; the surrounding `gap-2`
          // keeps adjacent tags ≥8px apart so mis-taps are rare.
          className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:border-secondary hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
