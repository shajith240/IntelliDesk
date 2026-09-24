// ============================================================================
// SEARCH: ROOT_LAYOUT
// IntelliDesk AI - Root Layout
// ============================================================================

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { fraunces, plexSans, plexMono } from "./fonts";

export const metadata: Metadata = {
  title: { default: "IntelliDesk", template: "%s · IntelliDesk" },
  description: "AI-assisted support operations: triage incoming customer email, track SLA risk, review AI evidence, and send responses.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
