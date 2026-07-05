"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Lock, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthGuard } from "@/components/AuthGuard";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { placeOrder, syncCartToServer } from "@/lib/checkout";
import { cn, formatPrice } from "@/lib/utils";
import { useCart, useCartLines, useCartSubtotal } from "@/store/cart";

const schema = z.object({
  line1: z.string().min(1, "Street address is required").max(255),
  line2: z.string().max(255).optional().or(z.literal("")),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().max(100).optional().or(z.literal("")),
  postal_code: z.string().min(1, "Postal code is required").max(20),
  country: z
    .string()
    .length(2, "Use the 2-letter country code, e.g. PK")
    .regex(/^[A-Za-z]{2}$/, "Use the 2-letter country code, e.g. PK"),
  coupon_code: z.string().max(50).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export default function CheckoutPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <AuthGuard>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <CheckoutContent />
          </Suspense>
        </AuthGuard>
      </main>
    </>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();
  const lines = useCartLines();
  const subtotal = useCartSubtotal();
  const clearCart = useCart((s) => s.clear);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "PK",
      coupon_code: sp.get("coupon") ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (lines.length === 0) {
      toast({
        title: "Your cart is empty",
        description: "Add a product before checking out.",
        variant: "warning",
      });
      return;
    }
    try {
      // Local cart is the source of truth — push to backend Redis cart
      // before invoking checkout. Cleared first so we never duplicate.
      await syncCartToServer(lines);

      const order = await placeOrder({
        shipping_address: {
          line1: values.line1,
          line2: values.line2 || null,
          city: values.city,
          state: values.state || null,
          postal_code: values.postal_code,
          country: values.country.toUpperCase(),
        },
        coupon_code: values.coupon_code?.trim() || undefined,
      });

      clearCart();
      toast({ title: "Order placed!", variant: "success" });
      router.replace(`/orders/${order.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.problem.detail ?? "";
        if (err.status === 400 && /coupon/i.test(detail)) {
          setError("coupon_code", { message: detail });
          return;
        }
        if (err.status === 409) {
          toast({
            title: "Stock changed",
            description: detail,
            variant: "warning",
            durationMs: 6000,
          });
          return;
        }
        toast({
          title: "Couldn't place order",
          description: detail || err.message,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Couldn't place order",
        description:
          err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    }
  });

  if (mounted && lines.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-token-sm">
        <h1 className="font-heading text-xl font-bold text-foreground">
          Your cart is empty
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a product first, then come back to check out.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-11 cursor-pointer items-center rounded-lg bg-primary px-5 font-heading text-sm font-bold text-primary-foreground shadow-token transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link
              href="/cart"
              className="rounded font-medium hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Cart
            </Link>
          </li>
          <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          <li aria-current="page" className="font-medium text-foreground">
            Checkout
          </li>
        </ol>
      </nav>

      <h1 className="mb-8 font-heading text-3xl font-bold text-foreground sm:text-4xl">
        Checkout
      </h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
        {/* ── Form ────────────────────────────────────────────────── */}
        <form
          id="checkout-form"
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-5 shadow-token-sm sm:p-6"
        >
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 font-heading text-lg font-bold text-foreground">
              Shipping address
            </legend>
            <Input
              label="Street address"
              autoComplete="address-line1"
              error={errors.line1?.message}
              {...register("line1")}
            />
            <Input
              label="Apartment, suite, etc. (optional)"
              autoComplete="address-line2"
              error={errors.line2?.message}
              {...register("line2")}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="City"
                autoComplete="address-level2"
                error={errors.city?.message}
                {...register("city")}
              />
              <Input
                label="State / Province (optional)"
                autoComplete="address-level1"
                error={errors.state?.message}
                {...register("state")}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Postal code"
                autoComplete="postal-code"
                inputMode="numeric"
                error={errors.postal_code?.message}
                {...register("postal_code")}
              />
              <Input
                label="Country (ISO code)"
                autoComplete="country"
                maxLength={2}
                helperText="2-letter ISO code, e.g. PK, US, GB"
                error={errors.country?.message}
                {...register("country")}
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-border pt-5">
            <legend className="mb-1 font-heading text-base font-bold text-foreground">
              Promo code (optional)
            </legend>
            <div className="relative">
              <Tag
                aria-hidden="true"
                strokeWidth={2}
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                autoComplete="off"
                placeholder="SAVE10"
                aria-label="Coupon code"
                {...register("coupon_code")}
                className={cn(
                  "h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm font-medium uppercase tracking-wide",
                  "text-foreground placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground",
                  "transition-colors focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20",
                  errors.coupon_code &&
                    "border-danger focus-visible:border-danger focus-visible:ring-danger/20",
                )}
              />
            </div>
            {errors.coupon_code?.message && (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.coupon_code.message}
              </p>
            )}
          </fieldset>
        </form>

        {/* ── Order summary ───────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-token sm:p-6">
            <h2 className="font-heading text-lg font-bold text-foreground">
              Order summary
            </h2>

            <ul className="flex flex-col divide-y divide-border text-sm">
              {lines.map((line) => (
                <li
                  key={line.productId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-medium text-foreground">
                      {line.title}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Qty {line.qty} × {formatPrice(line.unitPrice)}
                    </p>
                  </div>
                  <p className="font-heading text-sm font-bold tabular-nums text-foreground">
                    {formatPrice(Number(line.unitPrice) * line.qty)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatPrice(subtotal)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="text-xs italic text-muted-foreground">
                  Calculated on placement
                </dd>
              </div>
              <div className="my-1 h-px bg-border" aria-hidden="true" />
              <div className="flex items-baseline justify-between">
                <dt className="font-heading text-base font-bold text-foreground">
                  Total
                </dt>
                <dd className="font-heading text-xl font-bold tabular-nums text-foreground">
                  {formatPrice(subtotal)}
                </dd>
              </div>
            </dl>

            <Button
              type="submit"
              form="checkout-form"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className="w-full"
            >
              Place order
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock
                className="h-3.5 w-3.5"
                aria-hidden="true"
                strokeWidth={2}
              />
              Encrypted at every step
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
