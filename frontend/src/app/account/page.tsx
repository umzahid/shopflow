"use client";

import { MapPin, Package, Star, Trash2, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { formatPrice as money } from "@/lib/utils";
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useDeleteReview,
  useMyReviews,
  useUpdateProfile,
} from "@/lib/account";
import { useMyOrders } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/store/auth";
import type { AddressInput } from "@/types/api";

const TABS = [
  { key: "orders", label: "Orders", icon: Package },
  { key: "profile", label: "Profile", icon: UserIcon },
  { key: "addresses", label: "Addresses", icon: MapPin },
  { key: "reviews", label: "Reviews", icon: Star },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AccountPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <AuthGuard>
          <AccountView />
        </AuthGuard>
      </main>
    </>
  );
}

function AccountView() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<TabKey>("orders");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Your account</h1>
        {user && (
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </p>
        )}
      </div>

      <nav aria-label="Account sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === key
                ? "border-secondary text-secondary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            {label}
          </button>
        ))}
      </nav>

      {tab === "orders" && <OrdersSection />}
      {tab === "profile" && <ProfileSection />}
      {tab === "addresses" && <AddressesSection />}
      {tab === "reviews" && <ReviewsSection />}
    </div>
  );
}

function SectionError({ error }: { error: Error }) {
  return (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-muted-foreground">
      {error instanceof ApiError ? error.problem.detail : "Something went wrong."}
    </p>
  );
}

function OrdersSection() {
  const orders = useMyOrders();
  if (orders.isLoading) return <Skeleton variant="row" />;
  if (orders.isError) return <SectionError error={orders.error} />;
  if ((orders.data?.items.length ?? 0) === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-token-sm">
        <p className="font-heading font-semibold text-foreground">No orders yet</p>
        <Link href="/products" className="mt-3 inline-block text-sm font-semibold text-secondary hover:underline">
          Start shopping
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {orders.data!.items.map((o) => (
        <li key={o.id}>
          <Link
            href={`/orders/${o.id}`}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-token-sm transition-colors hover:border-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-mono text-xs text-muted-foreground">{o.id.slice(0, 8)}</span>
            <span className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</span>
            <StatusBadge status={o.status} />
            <span className="ml-auto font-heading font-bold tabular-nums text-foreground">{money(o.total_amount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProfileSection() {
  const { toast } = useToast();
  const update = useUpdateProfile();
  const user = useAuth((s) => s.user);
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: { email?: string; current_password?: string; new_password?: string } = {};
    if (email && email !== user?.email) patch.email = email;
    if (newPassword) {
      patch.current_password = currentPassword;
      patch.new_password = newPassword;
    }
    if (Object.keys(patch).length === 0) {
      toast({ title: "Nothing to update", variant: "info" });
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        toast({ title: "Profile updated", variant: "success" });
        setCurrentPassword("");
        setNewPassword("");
      },
      onError: (err) =>
        toast({
          title: "Update failed",
          description: err instanceof ApiError ? err.problem.detail : err.message,
          variant: "error",
        }),
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-token-sm">
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Change password</p>
        <div className="flex flex-col gap-3">
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="At least 8 characters"
            autoComplete="new-password"
          />
        </div>
      </div>
      <Button type="submit" variant="primary" size="sm" loading={update.isPending}>
        Save changes
      </Button>
    </form>
  );
}

const EMPTY_ADDRESS: AddressInput = {
  label: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  is_default: false,
};

function AddressesSection() {
  const { toast } = useToast();
  const addresses = useAddresses();
  const create = useCreateAddress();
  const del = useDeleteAddress();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddressInput>(EMPTY_ADDRESS);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { ...form, country: form.country.toUpperCase() },
      {
        onSuccess: () => {
          toast({ title: "Address saved", variant: "success" });
          setOpen(false);
          setForm(EMPTY_ADDRESS);
        },
        onError: (err) =>
          toast({
            title: "Couldn't save",
            description: err instanceof ApiError ? err.problem.detail : err.message,
            variant: "error",
          }),
      },
    );
  };

  const set = (k: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          Add address
        </Button>
      </div>
      {addresses.isLoading ? (
        <Skeleton variant="row" />
      ) : addresses.isError ? (
        <SectionError error={addresses.error} />
      ) : (addresses.data?.length ?? 0) === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground shadow-token-sm">
          No saved addresses yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {addresses.data!.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-token-sm"
            >
              <div className="flex-1">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  {a.label}
                  {a.is_default && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Default
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}, {a.city}
                  {a.state ? `, ${a.state}` : ""} {a.postal_code}, {a.country}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete address ${a.label}`}
                onClick={() =>
                  del.mutate(a.id, {
                    onSuccess: () => toast({ title: "Address removed", variant: "info" }),
                  })
                }
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add address">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input label="Label" value={form.label} onChange={set("label")} placeholder="Home" required />
          <Input label="Address line 1" value={form.line1} onChange={set("line1")} required />
          <Input label="Address line 2" value={form.line2 ?? ""} onChange={set("line2")} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={form.city} onChange={set("city")} required />
            <Input label="State / region" value={form.state ?? ""} onChange={set("state")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Postal code" value={form.postal_code} onChange={set("postal_code")} required />
            <Input label="Country (ISO-2)" value={form.country} onChange={set("country")} maxLength={2} required />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
              className="h-4 w-4 accent-[color:var(--secondary)]"
            />
            Set as default
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={create.isPending}>
              Save address
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ReviewsSection() {
  const { toast } = useToast();
  const reviews = useMyReviews();
  const del = useDeleteReview();

  if (reviews.isLoading) return <Skeleton variant="row" />;
  if (reviews.isError) return <SectionError error={reviews.error} />;
  if ((reviews.data?.length ?? 0) === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground shadow-token-sm">
        You haven&apos;t written any reviews yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {reviews.data!.map((r) => (
        <li key={r.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-token-sm">
          <div className="flex-1">
            <Link href={`/products/${r.product_id}`} className="font-semibold text-foreground hover:text-secondary">
              {r.product_title}
            </Link>
            <p className="my-1 flex items-center gap-0.5 text-amber-500" aria-label={`${r.rating} out of 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4" fill={i < r.rating ? "currentColor" : "none"} aria-hidden="true" strokeWidth={2} />
              ))}
            </p>
            {r.body && <p className="text-sm text-muted-foreground">{r.body}</p>}
          </div>
          <button
            type="button"
            aria-label={`Delete review of ${r.product_title}`}
            onClick={() => del.mutate(r.id, { onSuccess: () => toast({ title: "Review deleted", variant: "info" }) })}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          </button>
        </li>
      ))}
    </ul>
  );
}
