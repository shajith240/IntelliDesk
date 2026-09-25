"use client";

// Whether the signed-in user may change status/priority or send a reply on this ticket:
// admins can work any ticket; agents only the ones assigned to them; viewers never.
import { useSession } from "next-auth/react";

export function useCanWorkTicket(ticket: { assigned_agent: string | null }): boolean {
	const { data: session } = useSession();
	const role = session?.user.role;
	return role === "admin" || (role === "agent" && ticket.assigned_agent === session?.user.id);
}
