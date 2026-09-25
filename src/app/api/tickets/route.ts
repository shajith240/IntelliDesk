// Ticket list endpoint: returns filtered/searched/paginated tickets for the org, filling missing SLA due dates from policies.
import { NextRequest, NextResponse } from "next/server";
import { OPEN_STATUSES, isStatus } from "@/lib/ticket-meta";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";

interface TicketRow {
	created_at: string;
	severity: string;
	sla_first_response_due: string | null;
	sla_resolution_due: string | null;
	[key: string]: unknown;
}

export async function GET(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const { searchParams } = new URL(req.url);

		// Parse status (comma-separated)
		const statusParam = searchParams.get("status") ?? "";
		const statuses = statusParam
			.split(",")
			.map((s) => s.trim())
			.filter((s) => isStatus(s));

		// Parse severity (comma-separated)
		const severityParam = searchParams.get("severity") ?? "";
		const severities = severityParam
			.split(",")
			.map((s) => s.trim())
			.filter((s) => ["P1", "P2", "P3", "P4"].includes(s));

		// Sanitize search
		const rawSearch = searchParams.get("search") ?? "";
		const search = rawSearch
			.replace(/[,()*%\\:]/g, " ")
			.trim()
			.slice(0, 100);

		// Parse assigned filter
		const assigned = searchParams.get("assigned");

		const category = searchParams.get("category");

		// Robust paging
		const page = Math.max(
			1,
			Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
		);
		const limit = Math.min(
			100,
			Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20),
		);
		const offset = (page - 1) * limit;

		const sortBy = searchParams.get("sort") || "created_at";
		const sortOrder = searchParams.get("order") === "asc" ? true : false;

		let query = supabaseAdmin
			.from("tickets")
			.select(
				"*, contacts(id, name, email), accounts(id, company_name, tier)",
				{
					count: "exact",
				},
			)
			.eq("organization_id", orgId);

		// Apply status filter
		if (statuses.length === 1) {
			query = query.eq("status", statuses[0]);
		} else if (statuses.length > 1) {
			query = query.in("status", statuses);
		}

		// Apply severity filter
		if (severities.length === 1) {
			query = query.eq("severity", severities[0]);
		} else if (severities.length > 1) {
			query = query.in("severity", severities);
		}

		if (category) {
			query = query.eq("category", category);
		}

		// Apply search filter
		if (search) {
			query = query.or(
				`subject.ilike.%${search}%,ticket_number.ilike.%${search}%,summary.ilike.%${search}%`,
			);
		}

		// Agents only ever see tickets assigned to them, whatever filters they send.
		if (!can.viewAllTickets(session)) {
			query = query.eq("assigned_agent", session.user.id);
		} else if (assigned === "me") {
			query = query.eq("assigned_agent", session.user.id);
		} else if (assigned === "unassigned") {
			query = query.is("assigned_agent", null);
		}

		// Review queue: open, unassigned tickets the pipeline flagged for a human.
		if (searchParams.get("view") === "review") {
			if (!can.viewAllTickets(session)) return forbidden();
			query = query
				.is("assigned_agent", null)
				.eq("is_flagged_for_review", true)
				.in("status", OPEN_STATUSES);
		}

		const validSortFields = [
			"created_at",
			"updated_at",
			"severity",
			"status",
			"ticket_number",
		];
		const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";

		const { data, count, error } = await query
			.order(sortField, { ascending: sortOrder })
			.range(offset, offset + limit - 1);

		if (error) throw error;

		// Fill missing SLA due dates
		let tickets: TicketRow[] = data || [];
		const missingAny = tickets.some(
			(t) => t.sla_first_response_due === null || t.sla_resolution_due === null,
		);

		if (missingAny) {
			// SLA due dates are computed from sla_policies because the email pipeline does not store them on the ticket.
			// Organization-specific policies override the global defaults (organization_id NULL).
			const { data: policies, error: policiesError } = await supabaseAdmin
				.from("sla_policies")
				.select("severity, organization_id, first_response_minutes, resolution_minutes")
				.or(`organization_id.eq.${orgId},organization_id.is.null`);

			if (!policiesError && policies) {
				const policyMap = new Map<
					string,
					{ first_response_minutes: number; resolution_minutes: number }
				>();
				for (const policy of [...policies].sort((a, b) => Number(a.organization_id !== null) - Number(b.organization_id !== null))) {
					policyMap.set(policy.severity, {
						first_response_minutes: policy.first_response_minutes,
						resolution_minutes: policy.resolution_minutes,
					});
				}

				tickets = tickets.map((t) => {
					const policy = policyMap.get(t.severity);
					if (policy) {
						const createdTime = new Date(t.created_at).getTime();
						if (t.sla_first_response_due === null) {
							t.sla_first_response_due = new Date(
								createdTime + policy.first_response_minutes * 60000,
							).toISOString();
						}
						if (t.sla_resolution_due === null) {
							t.sla_resolution_due = new Date(
								createdTime + policy.resolution_minutes * 60000,
							).toISOString();
						}
					}
					return t;
				});
			}
		}

		return NextResponse.json({
			tickets,
			total: count,
			page,
			limit,
			total_pages: Math.ceil((count || 0) / limit),
		});
	} catch (error) {
		console.error("Get tickets error:", error);
		return NextResponse.json(
			{ error: "Failed to fetch tickets" },
			{ status: 500 },
		);
	}
}
