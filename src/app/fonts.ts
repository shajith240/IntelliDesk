// ============================================================================
// SEARCH: FONTS
// IntelliDesk AI — Font Registration
// Fraunces (display/wordmark), IBM Plex Sans (UI/body), IBM Plex Mono (data)
// ============================================================================

import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

// Display face — wordmark only, used with restraint
export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["italic", "normal"],
  variable: "--font-display",
  display: "swap",
});

// UI face — body copy, labels, buttons
export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

// Data face — numbers, IDs, timestamps, countdown
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
