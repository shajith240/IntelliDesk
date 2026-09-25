import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import { compare } from "bcryptjs";
import { supabaseAdmin } from "@/server/db/supabase";
import type { UserRole } from "@/types";

declare module "next-auth" {
	interface User {
		role: UserRole;
		organization_id: string;
	}
	interface Session {
		user: {
			id: string;
			email: string;
			name: string;
			role: UserRole;
			organization_id: string;
			image?: string | null;
		};
	}
}

declare module "@auth/core/jwt" {
	interface JWT {
		role: UserRole;
		organization_id: string;
		/** When role/active state was last confirmed against the database (ms). */
		checked_at?: number;
	}
}

export const { handlers, signIn, signOut, auth } = NextAuth({
	pages: {
		signIn: "/login",
	},
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},
	providers: [
		Credentials({
			name: "credentials",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
			},
			async authorize(credentials, request) {
				if (typeof credentials?.email !== "string" || typeof credentials?.password !== "string") {
					return null;
				}
				const email = credentials.email.toLowerCase().trim().slice(0, 254);
				const password = credentials.password.slice(0, 200);
				const ip = clientIp(request);

				if (await isThrottled(email, ip)) throw new TooManyAttempts();

				const { data: user } = await supabaseAdmin
					.from("users")
					.select("id, email, name, password_hash, role, organization_id, avatar_url, is_active")
					.eq("email", email)
					.maybeSingle();

				// Always run bcrypt, even for unknown emails, so response time doesn't
				// reveal which addresses have accounts.
				const valid = await compare(password, user?.password_hash ?? DUMMY_BCRYPT_HASH);
				const succeeded = Boolean(user && user.is_active && valid);

				const { error: attemptError } = await supabaseAdmin
					.from("auth_login_attempts")
					.insert({ email, ip_address: ip, succeeded });
				if (attemptError) console.error("Login attempt log failed:", attemptError);

				if (!user || !succeeded) return null;

				await supabaseAdmin
					.from("users")
					.update({ last_login: new Date().toISOString() })
					.eq("id", user.id);

				return {
					id: user.id,
					email: user.email,
					name: user.name,
					role: user.role as UserRole,
					organization_id: user.organization_id,
					image: user.avatar_url,
				};
			},
		}),
	],
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.role = user.role;
				token.organization_id = user.organization_id;
				token.checked_at = Date.now();
				return token;
			}
			// Sessions last 30 days, so re-confirm the account periodically: a
			// deactivated member loses access, and role changes take effect,
			// within SESSION_RECHECK_MS instead of at token expiry.
			if (!token.checked_at || Date.now() - token.checked_at > SESSION_RECHECK_MS) {
				const { data: current, error } = await supabaseAdmin
					.from("users")
					.select("role, organization_id, is_active")
					.eq("id", token.sub!)
					.maybeSingle();
				if (error) return token; // transient DB error: keep the session, retry next request
				if (!current || !current.is_active) return null;
				token.role = current.role as UserRole;
				token.organization_id = current.organization_id;
				token.checked_at = Date.now();
			}
			return token;
		},
		async session({ session, token }) {
			if (token) {
				session.user.id = token.sub!;
				session.user.role = token.role;
				session.user.organization_id = token.organization_id;
			}
			return session;
		},
	},
});

const SESSION_RECHECK_MS = 5 * 60 * 1000;

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/** bcrypt hash of a random string: compared against when the email is unknown. */
const DUMMY_BCRYPT_HASH = "$2b$12$ToWn5XBrYxv3glMXcqhzPOsEAMtGO1oPgytuVTqAjL.kmrTuC9i2S";

class TooManyAttempts extends CredentialsSignin {
	code = "rate_limited";
}

function clientIp(request: Request | undefined): string | null {
	const forwarded = request?.headers.get("x-forwarded-for");
	if (!forwarded) return null;
	return forwarded.split(",")[0].trim().slice(0, 64) || null;
}

async function isThrottled(email: string, ip: string | null): Promise<boolean> {
	const since = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString();
	const byEmail = supabaseAdmin
		.from("auth_login_attempts")
		.select("id", { count: "exact", head: true })
		.eq("email", email)
		.eq("succeeded", false)
		.gte("created_at", since);
	const byIp = ip
		? supabaseAdmin
				.from("auth_login_attempts")
				.select("id", { count: "exact", head: true })
				.eq("ip_address", ip)
				.eq("succeeded", false)
				.gte("created_at", since)
		: null;
	const [emailResult, ipResult] = await Promise.all([byEmail, byIp]);
	// Fail open on a logging-table error: throttling is a defense layer, and
	// bcrypt still gates the actual login.
	if (emailResult.error) return false;
	return (
		(emailResult.count ?? 0) >= MAX_FAILURES_PER_EMAIL ||
		(!!ipResult && !ipResult.error && (ipResult.count ?? 0) >= MAX_FAILURES_PER_IP)
	);
}
