import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
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
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					return null;
				}

				const email = credentials.email as string;
				const password = credentials.password as string;

				const { data: user, error } = await supabaseAdmin
					.from("users")
					.select(
						"id, email, name, password_hash, role, organization_id, avatar_url, is_active",
					)
					.eq("email", email.toLowerCase().trim())
					.single();

				if (error || !user) {
					return null;
				}

				if (!user.is_active) {
					return null;
				}

				const isValid = await compare(password, user.password_hash);
				if (!isValid) {
					return null;
				}

				// Update last_login
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
