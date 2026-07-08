"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { useGenerateDescription } from "@/lib/merchant";

/**
 * Description textarea with the one-click AI generator (PRD §5.6 task 27) —
 * shared by the product create form and the edit-details drawer. Generates
 * from the current `title`; suggestions apply via onChange.
 */
export function DescriptionField({
  id,
  title,
  value,
  onChange,
}: {
  id: string;
  title: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { toast } = useToast();
  const generate = useGenerateDescription();
  const [variants, setVariants] = useState<string[]>([]);

  const onGenerate = () => {
    if (!title.trim()) {
      toast({ title: "Add a title first", variant: "warning" });
      return;
    }
    generate.mutate(
      { title, length: "medium", tone: "professional" },
      {
        onSuccess: (r) => setVariants(r.variants),
        onError: (e) =>
          toast({
            title: "Couldn't generate",
            description: e instanceof ApiError ? e.problem.detail : e.message,
            variant: "error",
          }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          Description
        </label>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={generate.isPending}
          leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          onClick={onGenerate}
        >
          Generate with AI
        </Button>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Describe your product, or generate a draft with AI."
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20"
      />
      {variants.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            AI suggestions — click to use
          </p>
          {variants.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(v)}
              className="rounded-md border border-border bg-surface p-2 text-left text-sm text-foreground transition-colors hover:border-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
