"use client";

import { useSyncExternalStore } from "react";

/** How often data views revalidate against the API. */
export const REFRESH_INTERVAL_MS = 30_000;

export type SyncState = "connecting" | "synced" | "stale" | "reconnecting" | "offline";

interface SyncSnapshot {
	lastSuccessAt: number | null;
	lastError: string | null;
	consecutiveFailures: number;
	browserOnline: boolean;
}

let snapshot: SyncSnapshot = {
	lastSuccessAt: null,
	lastError: null,
	consecutiveFailures: 0,
	browserOnline: true,
};

const listeners = new Set<() => void>();

function emit(next: SyncSnapshot) {
	snapshot = next;
	listeners.forEach((listener) => listener());
}

export function recordSyncSuccess() {
	emit({ ...snapshot, lastSuccessAt: Date.now(), lastError: null, consecutiveFailures: 0 });
}

export function recordSyncFailure(message: string) {
	emit({
		...snapshot,
		lastError: message,
		consecutiveFailures: snapshot.consecutiveFailures + 1,
	});
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	const setOnline = () => emit({ ...snapshot, browserOnline: navigator.onLine });
	if (listeners.size === 1) {
		window.addEventListener("online", setOnline);
		window.addEventListener("offline", setOnline);
		setOnline();
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			window.removeEventListener("online", setOnline);
			window.removeEventListener("offline", setOnline);
		}
	};
}

const serverSnapshot: SyncSnapshot = {
	lastSuccessAt: null,
	lastError: null,
	consecutiveFailures: 0,
	browserOnline: true,
};

export function useSyncSnapshot(): SyncSnapshot {
	return useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
}

/** Derives the user-facing state. `now` is passed in so callers control re-render cadence. */
export function deriveSyncState(s: SyncSnapshot, now: number): SyncState {
	if (!s.browserOnline) return "offline";
	if (s.consecutiveFailures >= 3) return "offline";
	if (s.consecutiveFailures > 0) return "reconnecting";
	if (s.lastSuccessAt === null) return "connecting";
	if (now - s.lastSuccessAt > REFRESH_INTERVAL_MS * 2.5) return "stale";
	return "synced";
}
