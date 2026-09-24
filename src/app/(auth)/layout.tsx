// Auth layout: form on the left, animated brand panel on the right (hidden below lg).
import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { AuthHero } from "@/features/auth/components/auth-hero";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your IntelliDesk workspace.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex min-w-0 flex-col px-6 py-8 sm:px-12">
        <Logo className="lg:invisible" />
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>
        <p className="text-xs text-subtlest">&copy; {new Date().getFullYear()} IntelliDesk</p>
      </div>
      <aside className="hidden p-3 lg:block" aria-label="About IntelliDesk">
        <div className="sticky top-3 h-[calc(100dvh-24px)]">
          <AuthHero />
        </div>
      </aside>
    </div>
  );
}
