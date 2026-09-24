// Bearer token verification for cron jobs and webhooks; fails closed if secret env var is unset.
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Returns a NextResponse to short-circuit with, or null when the request carries `Authorization: Bearer <secret>`.
 * Fails closed if the secret env var is unset.
 */
export function verifyBearerSecret(
	req: Request,
	secret: string | undefined,
	name: string,
): NextResponse | null {
	if (!secret) {
		console.error(`${name} is not configured`);
		return NextResponse.json(
			{ error: "Endpoint is not configured" },
			{ status: 503 },
		);
	}

	const authHeader = req.headers.get("authorization") ?? "";
	const expected = `Bearer ${secret}`;

	// Compare only when lengths are equal to prevent timing attacks
	let isValid = false;
	if (authHeader.length === expected.length) {
		try {
			isValid = timingSafeEqual(
				Buffer.from(authHeader),
				Buffer.from(expected),
			);
		} catch {
			isValid = false;
		}
	}

	if (!isValid) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}

/**
 * Verify Vercel Cron request authorization.
 */
export function verifyCronRequest(req: Request): NextResponse | null {
	return verifyBearerSecret(req, process.env.CRON_SECRET, "CRON_SECRET");
}
