"use client";

import { useEffect, useState } from "react";

/** Current time, re-rendering every `intervalMs`. Use for SLA countdowns and "x ago" labels. */
export function useNow(intervalMs = 30_000): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), intervalMs);
		return () => window.clearInterval(id);
	}, [intervalMs]);
	return now;
}
