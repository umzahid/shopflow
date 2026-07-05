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
import { useLogin } from "@/lib/auth";
import { useAuth } from "@/store/auth";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

// useSearchParams forces CSR — wrapping LoginForm in Suspense keeps the
// AuthCard shell pre-renderable so the user sees the layout immediately.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4 py-12 sm:px-6">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const login = useLogin();

  // Already signed in? Bounce them onward.
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
      await login.mutateAsync(values);
      toast({ title: "Welcome back!", variant: "success" });
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("password", { message: "Invalid email or password" });
        return;
      }
      toast({
        title: "Sign-in failed",
        description:
          err instanceof Error ? err.message : "Something went wrong",
        variant: "error",
      });
    }
  });

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back to ShopFlow."
      footer={
        <>
          New to ShopFlow?{" "}
          <Link
            href={`/register${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Create an account
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting || login.isPending}
          className="mt-2 w-full"
        >
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
