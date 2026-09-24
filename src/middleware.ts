// ============================================================================
// SEARCH: MIDDLEWARE
// IntelliDesk AI - Next.js Middleware for Auth Route Protection
// Protects /dashboard routes and redirects auth pages for logged-in users
// Route flow: / → /dashboard (server redirect) → middleware checks auth
// ============================================================================

import { auth } from "@/server/auth/config";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isPublicApi =
    pathname.startsWith("/api/emails/ingest") ||
    pathname.startsWith("/api/emails/poll") ||
    pathname.startsWith("/api/emails/process-queue");
  const isDashboard = pathname.startsWith("/dashboard");

  // Always allow auth-related API routes and public webhook endpoints
  if (isAuthApi || isPublicApi) {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth?.user;

  // Redirect logged-in users away from auth pages to dashboard
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Protect dashboard routes — redirect unauthenticated users to login
  if (isDashboard && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

