import "server-only";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

// Single source of truth for who may do what. Route handlers call these instead
// of comparing roles inline, so the permission model lives in one place.
//
//   admin  — runs the workspace: sees everything, assigns tickets, manages the
//            team, mailbox and knowledge base.
//   agent  — works only the tickets an admin assigned to them.
//   viewer — read-only access to the whole workspace.

type Actor = Pick<Session, "user">;
type AssignableTicket = { assigned_agent: string | null };

const isAdmin = (s: Actor) => s.user.role === "admin";
const isAgent = (s: Actor) => s.user.role === "agent";
const isViewer = (s: Actor) => s.user.role === "viewer";

export const can = {
	/** See every ticket in the organization (agents only see their own). */
	viewAllTickets: (s: Actor) => isAdmin(s) || isViewer(s),
	assignTickets: isAdmin,
	manageTeam: isAdmin,
	manageSettings: isAdmin,
	manageKnowledgeBase: isAdmin,
	importEmails: isAdmin,
	/** Admins and agents appear in the assignee pool and can mark themselves (un)available. */
	setOwnAvailability: (s: Actor) => isAdmin(s) || isAgent(s),

	viewTicket(s: Actor, ticket: AssignableTicket) {
		return isAdmin(s) || isViewer(s) || (isAgent(s) && ticket.assigned_agent === s.user.id);
	},

	/** Change status/priority/category and send replies. */
	workTicket(s: Actor, ticket: AssignableTicket) {
		return isAdmin(s) || (isAgent(s) && ticket.assigned_agent === s.user.id);
	},
};

export function forbidden(message = "You don't have permission to do that") {
	return NextResponse.json({ error: message }, { status: 403 });
}

/** Used when the caller may not know the resource exists (avoids leaking ids across roles). */
export function notFound(message = "Not found") {
	return NextResponse.json({ error: message }, { status: 404 });
}
