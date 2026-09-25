import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { supabaseAdmin } from "@/server/db/supabase";
import { z } from "zod";

const signupSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	email: z.string().email("Invalid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
	organizationName: z
		.string()
		.min(2, "Organization name must be at least 2 characters"),
});

export async function POST(request: NextRequest) {
	// Workspaces are provisioned deliberately; members are added by their admin
	// from Settings. Public self-serve signup is opt-in per deployment.
	if (process.env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP !== "true") {
		return NextResponse.json(
			{ error: "Sign-up is closed. Ask your workspace admin to add you." },
			{ status: 403 },
		);
	}

	try {
		const body = await request.json();
		const parsed = signupSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: parsed.error.issues[0].message },
				{ status: 400 },
			);
		}

		const { name, email, password, organizationName } = parsed.data;
		const normalizedEmail = email.toLowerCase().trim();

		// Check if user already exists
		const { data: existingUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("email", normalizedEmail)
			.single();

		if (existingUser) {
			return NextResponse.json(
				{ error: "An account with this email already exists" },
				{ status: 409 },
			);
		}

		// Create organization
		const slug = organizationName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");

		const domain = normalizedEmail.split("@")[1];

		const { data: org, error: orgError } = await supabaseAdmin
			.from("organizations")
			.insert({
				name: organizationName,
				slug: `${slug}-${Date.now().toString(36)}`,
				domain,
				plan: "free",
				max_agents: 1,
			})
			.select("id")
			.single();

		if (orgError || !org) {
			console.error("Failed to create organization:", orgError);
			return NextResponse.json(
				{ error: "Failed to create organization" },
				{ status: 500 },
			);
		}

		// Create user (admin of new org)
		const passwordHash = await hash(password, 12);

		const { error: userError } = await supabaseAdmin.from("users").insert({
			organization_id: org.id,
			email: normalizedEmail,
			name,
			password_hash: passwordHash,
			role: "admin",
		});

		if (userError) {
			// Rollback org creation
			await supabaseAdmin.from("organizations").delete().eq("id", org.id);
			console.error("Failed to create user:", userError);
			return NextResponse.json(
				{ error: "Failed to create account" },
				{ status: 500 },
			);
		}

		return NextResponse.json(
			{ message: "Account created successfully" },
			{ status: 201 },
		);
	} catch (error) {
		console.error("Signup error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
