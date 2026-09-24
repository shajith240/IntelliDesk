import "server-only";
import { auth } from "./config";
import { NextResponse } from "next/server";
import type { UserRole } from "@/types";

/**
 * Get the current authenticated session or return a 401 response.
 * Use in API routes:
 *   const session = await requireAuth();
 *   if (session instanceof NextResponse) return session;
 */
export async function requireAuth() {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	return session;
}

/**
 * Require a specific role (or higher).
 * Role hierarchy: admin > agent > viewer
 */
export async function requireRole(...allowedRoles: UserRole[]) {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!allowedRoles.includes(session.user.role)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return session;
}
