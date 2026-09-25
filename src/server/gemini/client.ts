import "server-only";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { supabaseAdmin } from "@/server/db/supabase";
import { decryptSecret } from "@/server/crypto/secrets";

// Which Gemini key a workspace's AI calls run on. A workspace that saved its
// own key (Settings → AI) pays for its own usage; otherwise the platform key
// from GEMINI_API_KEY is used, if the deployment has one.

export interface AiContext {
	organizationId: string;
	apiKey: string;
	source: "workspace" | "platform";
}

export class AiNotConfiguredError extends Error {
	constructor() {
		super("No Gemini API key is configured for this workspace");
		this.name = "AiNotConfiguredError";
	}
}

/**
 * A failed Gemini call. `transient` errors (rate limits, overload, network)
 * are worth retrying later; the others (bad key, bad request) are not until
 * someone fixes the configuration.
 */
export class AiCallError extends Error {
	constructor(
		message: string,
		readonly transient: boolean,
		readonly status?: number,
	) {
		super(message);
		this.name = "AiCallError";
	}
}

export async function getAiContext(organizationId: string): Promise<AiContext> {
	const { data, error } = await supabaseAdmin
		.from("ai_credentials")
		.select("secret_ciphertext")
		.eq("organization_id", organizationId)
		.maybeSingle();
	if (error) throw error;
	if (data) {
		return { organizationId, apiKey: decryptSecret(data.secret_ciphertext, organizationId), source: "workspace" };
	}
	const platformKey = process.env.GEMINI_API_KEY?.trim();
	if (platformKey) return { organizationId, apiKey: platformKey, source: "platform" };
	throw new AiNotConfiguredError();
}

/** Remember that the workspace key failed, so admins see it in Settings. */
export async function recordAiKeyFailure(ctx: AiContext, err: AiCallError): Promise<void> {
	if (ctx.source !== "workspace" || err.transient) return;
	await supabaseAdmin
		.from("ai_credentials")
		.update({ status: "error", last_error: err.message.slice(0, 1000) })
		.eq("organization_id", ctx.organizationId);
}

export function getModel(apiKey: string, modelName: string, systemInstruction?: string) {
	return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName, systemInstruction });
}

function toAiCallError(err: unknown): AiCallError {
	if (err instanceof AiCallError) return err;
	if (err instanceof GoogleGenerativeAIFetchError) {
		const status = err.status;
		const transient = status === undefined || status === 429 || status >= 500;
		const reason =
			status === 400 && /API key/i.test(err.message)
				? "The Gemini API key is invalid"
				: status === 403
					? "The Gemini API key doesn't have access to this model"
					: status === 429
						? "Gemini rate limit reached"
						: `Gemini request failed (${status ?? "network"})`;
		return new AiCallError(reason, transient, status);
	}
	// Network failures and timeouts surface as plain errors.
	return new AiCallError(err instanceof Error ? err.message : String(err), true);
}

const RETRY_DELAYS_MS = [1_000, 4_000];

/**
 * Run a Gemini call, retrying transient failures with exponential backoff and
 * jitter. Anything still failing is thrown as an AiCallError for the caller
 * (the intake queue retries the whole email later).
 */
export async function withRetry<T>(call: () => Promise<T>): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await call();
		} catch (raw) {
			const err = toAiCallError(raw);
			if (!err.transient || attempt >= RETRY_DELAYS_MS.length) throw err;
			const delay = RETRY_DELAYS_MS[attempt] * (0.75 + Math.random() * 0.5);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

/** HTTP status and message for an AI failure inside a user-facing route, or null if it isn't one. */
export function aiErrorResponse(err: unknown): { status: number; error: string } | null {
	if (err instanceof AiNotConfiguredError) {
		return { status: 503, error: "AI isn't set up for this workspace. An admin can add a Gemini API key in Settings." };
	}
	if (err instanceof AiCallError) {
		return err.transient
			? { status: 503, error: "The AI service is busy. Try again in a minute." }
			: { status: 502, error: `${err.message}. An admin can check the key in Settings.` };
	}
	return null;
}
