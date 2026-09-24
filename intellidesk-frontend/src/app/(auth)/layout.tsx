// Auth layout: centered container for login/signup pages.
import type { Metadata } from "next";
import { Logo } from "@/components/shell/Logo";

export const metadata: Metadata = {
  title: "IntelliDesk | Sign In",
  description: "Sign in to your IntelliDesk account to manage your support dashboard.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sunken px-4 py-10">
      <Logo className="mb-6" />
      <main className="w-full max-w-[400px]">{children}</main>
      <p className="mt-8 text-xs text-subtlest">AI-assisted support operations</p>
    </div>
  );
}
