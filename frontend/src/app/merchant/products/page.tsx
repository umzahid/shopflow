"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, LineChart as LineChartIcon, Pencil, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";

import dynamic from "next/dynamic";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api } from "@/lib/api";
import {
  merchantKeys,
  useGenerateDescription,
  useMerchantProducts,
  useProductForecast,
  useUpdateProduct,
} from "@/lib/merchant";
import type { Product, ProductStatus } from "@/types/api";

// Only rendered inside the forecast drawer — fetch the chart chunk on demand.
const ForecastChart = dynamic(
  () => import("@/components/ui/Charts").then((m) => m.ForecastChart),
  { ssr: false },
);

const STATUS_FILTERS = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
];

const STATUS_BADGE: Record<ProductStatus, string> = {
  active: "bg-primary/10 text-primary",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-danger/10 text-danger",
};

export default function ProductManagerPage() {
  const { toast } = useToast();
  const update = useUpdateProduct();
  const [statusFilter, setStatusFilter] = useState<"" | ProductStatus>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [forecast, setForecast] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const query = useMerchantProducts(statusFilter || undefined);
  const products = query.data?.items ?? [];

  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(products.map((p) => p.id)));

  // PRD §2.3 bulk actions — PATCH each selected product; report one summary toast.
  const bulkSetStatus = async (next: ProductStatus) => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) => update.mutateAsync({ id, patch: { status: next } })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelectedIds(new Set());
    toast(
      failed === 0
        ? { title: `${ids.length} product${ids.length === 1 ? "" : "s"} ${next}`, variant: "success" }
        : {
            title: `${ids.length - failed} updated, ${failed} failed`,
            variant: "error",
          },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Products
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your catalog — prices, stock, and visibility.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setCreateOpen(true)}
        >
          New product
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select
          ariaLabel="Filter by status"
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | ProductStatus)}
          className="min-w-[12rem]"
        />
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {query.isLoading ? "" : `${products.length} product${products.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div
          data-testid="bulk-actions"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-secondary/40 bg-secondary/5 px-4 py-2.5"
        >
          <span className="text-sm font-semibold text-foreground" aria-live="polite">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={update.isPending}
              onClick={() => bulkSetStatus("active")}
            >
              Activate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={update.isPending}
              onClick={() => bulkSetStatus("archived")}
            >
              Archive
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorBox error={query.error} />
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-token-sm">
          <p className="font-heading font-semibold text-foreground">No products yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first product to start selling.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-token-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={allSelected ? "Deselect all products" : "Select all products"}
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-secondary"
                  />
                </th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  selected={selectedIds.has(p.id)}
                  onToggleSelect={() => toggleOne(p.id)}
                  onForecast={() => setForecast(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New product"
      >
        <CreateProductForm onDone={() => setCreateOpen(false)} />
      </Drawer>

      <Drawer
        open={forecast !== null}
        onClose={() => setForecast(null)}
        title={forecast ? `Demand forecast — ${forecast.title}` : "Forecast"}
      >
        {forecast && <ForecastView productId={forecast.id} />}
      </Drawer>
    </div>
  );
}

function ForecastView({ productId }: { productId: string }) {
  const { data, isLoading, isError, error } = useProductForecast(productId, 30);
  if (isLoading) return <Skeleton variant="blank" className="h-52" />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof ApiError ? error.problem.detail : "Couldn't load forecast."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Projected daily demand for the next {data?.horizon_days ?? 30} days, with a
        confidence band.
      </p>
      <ForecastChart points={data?.points ?? []} />
    </div>
  );
}

function ProductRow({
  product,
  selected,
  onToggleSelect,
  onForecast,
}: {
  product: Product;
  selected: boolean;
  onToggleSelect: () => void;
  onForecast: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateProduct();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(String(product.stock_qty));

  const save = () => {
    update.mutate(
      { id: product.id, patch: { price: Number(price), stock_qty: Number(stock) } },
      {
        onSuccess: () => {
          toast({ title: "Saved", description: product.title, variant: "success" });
          setEditing(false);
        },
        onError: (e) =>
          toast({
            title: "Update failed",
            description: e instanceof ApiError ? e.problem.detail : e.message,
            variant: "error",
          }),
      },
    );
  };

  const toggleStatus = (next: ProductStatus) => {
    update.mutate(
      { id: product.id, patch: { status: next } },
      {
        onSuccess: () =>
          toast({ title: `Product ${next}`, description: product.title, variant: "success" }),
        onError: (e) =>
          toast({
            title: "Update failed",
            description: e instanceof ApiError ? e.problem.detail : e.message,
            variant: "error",
          }),
      },
    );
  };

  return (
    <tr className="text-foreground">
      <td className="w-10 px-4 py-3">
        <input
          type="checkbox"
          aria-label={`Select ${product.title}`}
          checked={selected}
          onChange={onToggleSelect}
          className="h-4 w-4 cursor-pointer rounded border-border accent-secondary"
        />
      </td>
      <td className="max-w-[16rem] truncate px-4 py-3 font-medium">{product.title}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[product.status]}`}
        >
          {product.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {editing ? (
          <Input
            type="number"
            min={0}
            step="0.01"
            aria-label={`Price for ${product.title}`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 text-right"
          />
        ) : (
          `$${Number(product.price).toFixed(2)}`
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {editing ? (
          <Input
            type="number"
            min={0}
            step="1"
            aria-label={`Stock for ${product.title}`}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-20 text-right"
          />
        ) : (
          product.stock_qty
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="primary"
                loading={update.isPending}
                leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                onClick={save}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPrice(product.price);
                  setStock(String(product.stock_qty));
                  setEditing(false);
                }}
                aria-label="Cancel edit"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<LineChartIcon className="h-4 w-4" aria-hidden="true" />}
                onClick={onForecast}
              >
                Forecast
              </Button>
              {product.status === "active" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={update.isPending}
                  onClick={() => toggleStatus("archived")}
                >
                  Archive
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={update.isPending}
                  onClick={() => toggleStatus("active")}
                >
                  Activate
                </Button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function CreateProductForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const generate = useGenerateDescription();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim() && price !== "" && stock !== "";

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api<Product>("/products", {
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim() || null,
          price: Number(price),
          stock_qty: Number(stock),
          status: "active",
        },
      });
      toast({ title: "Product created", description: title, variant: "success" });
      qc.invalidateQueries({ queryKey: merchantKeys.all });
      onDone();
    } catch (err) {
      toast({
        title: "Create failed",
        description: err instanceof ApiError ? err.problem.detail : String(err),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Hand-thrown ceramic mug"
        required
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="new-desc" className="text-sm font-semibold text-foreground">
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
          id="new-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
                onClick={() => setDescription(v)}
                className="rounded-md border border-border bg-surface p-2 text-left text-sm text-foreground transition-colors hover:border-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Price (USD)"
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <Input
          label="Stock"
          type="number"
          min={0}
          step="1"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          required
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={!canSubmit}>
          Create product
        </Button>
      </div>
    </form>
  );
}

function ErrorBox({ error }: { error: Error }) {
  const detail = error instanceof ApiError ? error.problem.detail : error.message;
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6">
      <p className="font-heading font-semibold text-foreground">Couldn&apos;t load products</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
