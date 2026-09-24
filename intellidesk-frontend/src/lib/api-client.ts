// Fetch utilities for GET requests and mutations; automatically records sync status for network health.
import { recordSyncFailure, recordSyncSuccess } from "@/lib/sync-status";

export class ApiRequestError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiRequestError";
		this.status = status;
	}
}

async function readError(res: Response): Promise<string> {
	try {
		const body: unknown = await res.json();
		if (body && typeof body === "object" && "error" in body) {
			const message = (body as { error: unknown }).error;
			if (typeof message === "string" && message) return message;
		}
	} catch {
		// Non-JSON error body; fall through to the status text.
	}
	return res.statusText || `Request failed (${res.status})`;
}

/** SWR fetcher for GET requests against the app's own API routes. */
export async function apiGet<T>(url: string): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
	} catch {
		recordSyncFailure("Network unavailable");
		throw new ApiRequestError("Network unavailable. Check your connection.", 0);
	}
	if (!res.ok) {
		const message = await readError(res);
		recordSyncFailure(message);
		throw new ApiRequestError(message, res.status);
	}
	const data = (await res.json()) as T;
	recordSyncSuccess();
	return data;
}

/** Mutation helper. Throws ApiRequestError carrying the server's `error` message. */
export async function apiSend<T>(
	url: string,
	method: "POST" | "PATCH" | "PUT" | "DELETE",
	body?: unknown,
): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch {
		throw new ApiRequestError("Network unavailable. Check your connection.", 0);
	}
	if (!res.ok) {
		throw new ApiRequestError(await readError(res), res.status);
	}
	return (await res.json()) as T;
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === "") continue;
		search.set(key, String(value));
	}
	const qs = search.toString();
	return qs ? `?${qs}` : "";
}
