"use client";
// Signup page: creates organization and user, then signs in.

import { useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldMessage } from "@/components/ui/field";
import { SectionMessage } from "@/components/ui/section-message";

export default function SignupPage() {
  const router = useRouter();
  const errorMessageRef = useRef<HTMLDivElement>(null);

  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({
    organizationName: false,
    name: false,
    email: false,
    password: false,
  });

  const orgInvalid = Boolean(touched.organizationName && !organizationName);
  const nameInvalid = Boolean(touched.name && !name);
  const emailInvalid = Boolean(touched.email && !email);
  const emailFormatInvalid = Boolean(touched.email && email && !email.includes("@"));
  const passwordInvalid = Boolean(touched.password && !password);
  const passwordShortInvalid = Boolean(touched.password && password && password.length < 8);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, organizationName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Signup failed. Please try again.");
        requestAnimationFrame(() => {
          errorMessageRef.current?.focus();
        });
        setSubmitting(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created! Please sign in manually.");
        router.push("/login");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
      requestAnimationFrame(() => {
        errorMessageRef.current?.focus();
      });
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Create your workspace</h1>
        <p className="mt-2 text-sm text-subtle">You&apos;ll be the admin. You can invite your team later.</p>
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

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="organization">Organization name</Label>
          <Input
            className="h-10"
            id="organization"
            type="text"
            autoComplete="organization"
            placeholder="Acme Inc."
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, organizationName: true }))}
            invalid={orgInvalid}
            aria-describedby={orgInvalid ? "org-error" : undefined}
            required
          />
          {orgInvalid && (
            <FieldMessage id="org-error" tone="error">
              Organization name is required
            </FieldMessage>
          )}
        </div>

        <div>
          <Label htmlFor="name">Your name</Label>
          <Input
            className="h-10"
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
            invalid={nameInvalid}
            aria-describedby={nameInvalid ? "name-error" : undefined}
            required
          />
          {nameInvalid && (
            <FieldMessage id="name-error" tone="error">
              Name is required
            </FieldMessage>
          )}
        </div>

        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            className="h-10"
            id="email"
            type="email"
            autoComplete="email"
            placeholder="jane@acme.com"
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
          <Label htmlFor="password">Password</Label>
          <Input
            className="h-10"
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
            invalid={passwordInvalid || passwordShortInvalid}
            aria-describedby={
              passwordInvalid
                ? "password-error-empty"
                : passwordShortInvalid
                  ? "password-error-short"
                  : undefined
            }
            required
          />
          {passwordInvalid && (
            <FieldMessage id="password-error-empty" tone="error">
              Password is required
            </FieldMessage>
          )}
          {passwordShortInvalid && (
            <FieldMessage id="password-error-short" tone="error">
              Password must be at least 8 characters
            </FieldMessage>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          className="h-10 w-full"
          loading={submitting}
        >
          Create account
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-subtle">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </div>
    </div>
  );
}
