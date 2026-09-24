"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** The open ticket lives in the `?ticket=<id>` URL param so it survives refresh and back/forward. */
export function useTicketParam() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const ticketId = searchParams.get("ticket");

	const setTicket = useCallback(
		(id: string | null) => {
			const params = new URLSearchParams(searchParams.toString());
			if (id) params.set("ticket", id);
			else params.delete("ticket");
			const qs = params.toString();
			const href = qs ? `${pathname}?${qs}` : pathname;
			if (id) router.push(href, { scroll: false });
			else router.replace(href, { scroll: false });
		},
		[pathname, router, searchParams],
	);

	const openTicket = useCallback((id: string) => setTicket(id), [setTicket]);
	const closeTicket = useCallback(() => setTicket(null), [setTicket]);

	return { ticketId, openTicket, closeTicket };
}
