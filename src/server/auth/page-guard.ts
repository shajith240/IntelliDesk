import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import type { UserRole } from "@/types";

/** Where each role lands when it hits a page it isn't allowed to open. */
function homeFor(role: UserRole): string {
	return role === "agent" ? "/dashboard/my-work" : "/dashboard";
}

/**
 * Server-component guard: redirects to /login without a session, or to the
 * caller's role home when the signed-in role isn't one of `roles`.
 */
export async function requirePageRole(...roles: UserRole[]) {
	const session = await auth();
	if (!session) redirect("/login");

	const role = session.user.role;
	if (!roles.includes(role)) redirect(homeFor(role));

	return session;
}
