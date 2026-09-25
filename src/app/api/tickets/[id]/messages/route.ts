// Post to a ticket's conversation: a public reply (emailed to the customer) or
// an internal note (visible to the team only). Replies may carry the status the
// ticket should move to, validated against the workflow table.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden, notFound } from "@/server/auth/policy";
import { ReplyError, addInternalNote, sendTicketReply } from "@/server/tickets/replies";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = z.string().trim().min(1, "Write something first").max(20000, "Keep it under 20,000 characters");

const bodySchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("reply"),
			body: text,
			status_after: z.enum(["In Progress", "Pending", "Resolved"]).optional(),
			draft_id: z.string().uuid().optional(),
		})
		.strict(),
	z.object({ kind: z.literal("note"), body: text }).strict(),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	const orgId = getOrgId(session);

	const { id } = await params;
	if (!UUID_RE.test(id)) return notFound("Ticket not found");

	let raw: unknown;
	try {
		raw = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
	}
	const input = parsed.data;

	const { data: ticket, error } = await supabaseAdmin
		.from("tickets")
		.select("id, assigned_agent")
		.eq("id", id)
		.eq("organization_id", orgId)
		.maybeSingle();
	if (error) {
		console.error("Ticket lookup error:", error.message);
		return NextResponse.json({ error: "Failed to load the ticket" }, { status: 500 });
	}
	if (!ticket || !can.viewTicket(session, ticket)) return notFound("Ticket not found");
	if (!can.workTicket(session, ticket)) {
		return forbidden("Only the assigned agent or an admin can write on this ticket");
	}

	try {
		if (input.kind === "note") {
			const result = await addInternalNote({ orgId, ticketId: id, userId: session.user.id, body: input.body });
			return NextResponse.json({ message_id: result.messageId }, { status: 201 });
		}

		const { data: org } = await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle();
		const result = await sendTicketReply({
			orgId,
			ticketId: id,
			author: { type: "agent", userId: session.user.id },
			body: input.body,
			statusAfter: input.status_after ?? null,
			draftId: input.draft_id ?? null,
			fromName: org?.name,
		});
		return NextResponse.json(
			{ message_id: result.messageId, status: result.status, to: result.to },
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof ReplyError) {
			return NextResponse.json({ error: err.message }, { status: err.status });
		}
		console.error("Post message error:", err);
		return NextResponse.json({ error: "Failed to post the message" }, { status: 500 });
	}
}
