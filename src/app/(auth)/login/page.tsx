"use client";
// Login page with email/password form; validates callbackUrl to prevent open redirects.

import { Suspense, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldMessage } from "@/components/ui/field";
import { SectionMessage } from "@/components/ui/section-message";
import { Skeleton } from "@/components/ui/skeleton";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorMessageRef = useRef<HTMLDivElement>(null);

  const callbackUrlParam = searchParams.get("callbackUrl");
  const callbackUrl =
    callbackUrlParam && /^\/[^/\\]/.test(callbackUrlParam)
      ? callbackUrlParam
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailInvalid = Boolean(touched.email && !email);
  const emailFormatInvalid = Boolean(touched.email && email && !email.includes("@"));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError("");

    const emailMissingOrBad = !email || !email.includes("@");
    if (emailMissingOrBad || !password) {
      setTouched({ email: true, password: true });
      const form = e.currentTarget;
      requestAnimationFrame(() => {
        form.querySelector<HTMLInputElement>(emailMissingOrBad ? "#email" : "#password")?.focus();
      });
      return;
    }

    setSubmitting(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error || result.ok === false) {
        setError("Incorrect email or password.");
        requestAnimationFrame(() => {
          errorMessageRef.current?.focus();
        });
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
      requestAnimationFrame(() => {
        errorMessageRef.current?.focus();
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Log in to IntelliDesk</h1>
        <p className="mt-2 text-sm text-subtle">Use your workspace account.</p>
      </div>

      {error && (
        <div
          ref={errorMessageRef}
          tabIndex={-1}
          className="mb-6"
        >
          <SectionMessage appearance="error">
            {error}
          </SectionMessage>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            className="h-10"
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            invalid={emailInvalid || emailFormatInvalid}
            aria-describedby={
              emailInvalid
                ? "email-error-empty"
                : emailFormatInvalid
                  ? "email-error-format"
                  : undefined
            }
            required
          />
          {emailInvalid && (
            <FieldMessage id="email-error-empty" tone="error">
              Email is required
            </FieldMessage>
          )}
          {emailFormatInvalid && (
            <FieldMessage id="email-error-format" tone="error">
              Enter a valid email address
            </FieldMessage>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              invalid={touched.password && !password}
              aria-describedby={touched.password && !password ? "password-error" : undefined}
              className="h-10 pr-10"
              required
            />
            <Button
              type="button"
              variant="subtle"
              size="icon-sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-subtle hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>
          {touched.password && !password && (
            <FieldMessage id="password-error" tone="error">
              Password is required
            </FieldMessage>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          className="h-10 w-full"
          loading={submitting}
        >
          Log in
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-subtle">
        New to IntelliDesk?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create a workspace
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div>
          <Skeleton className="mb-6 h-6 w-40" />
          <Skeleton className="mb-8 h-4 w-56" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
