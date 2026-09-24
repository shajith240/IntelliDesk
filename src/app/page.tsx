// ============================================================================
// SEARCH: ROOT_PAGE
// IntelliDesk AI - Root page redirects to /dashboard
// Middleware will enforce auth: unauthenticated → /login, authenticated → dashboard
// ============================================================================

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/dashboard');
}

