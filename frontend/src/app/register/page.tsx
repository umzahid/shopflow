"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Suspense } from "react";

import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { useRegister } from "@/lib/auth";
import { useAuth } from "@/store/auth";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterShell />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4 py-12 sm:px-6">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const reg = useRegister();

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await reg.mutateAsync(values);
      toast({ title: "Account created", variant: "success" });
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("email", { message: "This email is already registered" });
        return;
      }
      toast({
        title: "Couldn't create account",
        description:
          err instanceof Error ? err.message : "Something went wrong",
        variant: "error",
      });
    }
  });

  return (
    <AuthCard
      title="Create account"
      subtitle="Set up a ShopFlow account in seconds."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          helperText="At least 8 characters."
          error={errors.password?.message}
          {...register("password")}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting || reg.isPending}
          className="mt-2 w-full"
        >
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
