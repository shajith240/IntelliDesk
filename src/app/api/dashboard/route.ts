// Dashboard stats endpoint: compiles ticket counts, email metrics, SLA status, and activity feed for the org.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { getSLAMetrics, getSLAAlerts } from "@/server/pipeline/sla-tracker";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can } from "@/server/auth/policy";

interface AuditLogDbRow {
	id: string;
	ticket_id: string | null;
	entity_type?: string | null;
	entity_id?: string | null;
	action: string;
	details: Record<string, unknown> | null;
	created_at: string;
	[key: string]: unknown;
}

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);
	// Agents only ever see numbers derived from tickets assigned to them; the
	// org inbox and the unassigned-review queue are admin/viewer-only.
	const scopeToAgent = !can.viewAllTickets(session);
	const agentId = session.user.id;

	try {
		const startOfTodayIso = new Date(
			new Date().setHours(0, 0, 0, 0),
		).toISOString();

		// Start the slow SLA computation and the activity feed immediately so they
		// overlap with the count queries below instead of running after them.
		const slaAssigneeId = scopeToAgent ? agentId : undefined;
		const slaAlertsPromise = getSLAAlerts(orgId, slaAssigneeId);
		const slaMetricsPromise = slaAlertsPromise.then((alerts) =>
			getSLAMetrics(orgId, alerts, slaAssigneeId),
		);

		// Agents only see audit rows tied to their own tickets. Fetch the id list
		// alongside the count queries below so it overlaps rather than serializes.
		const agentTicketIdsPromise = scopeToAgent
			? supabaseAdmin
					.from("tickets")
					.select("id")
					.eq("organization_id", orgId)
					.eq("assigned_agent", agentId)
			: Promise.resolve({ data: null as { id: string }[] | null });

		const recentActivityPromise = scopeToAgent
			? Promise.resolve({ data: null as AuditLogDbRow[] | null })
			: supabaseAdmin
					.from("audit_logs")
					.select("*")
					.eq("organization_id", orgId)
					.order("created_at", { ascending: false })
					.limit(10);

		let totalTicketsQuery = supabaseAdmin
			.from("tickets")
			.select("*", { count: "exact", head: true })
			.eq("organization_id", orgId);
		if (scopeToAgent) totalTicketsQuery = totalTicketsQuery.eq("assigned_agent", agentId);

		let openTicketsQuery = supabaseAdmin
			.from("tickets")
			.select("*", { count: "exact", head: true })
			.eq("organization_id", orgId)
			.in("status", ["New", "In Progress"]);
		if (scopeToAgent) openTicketsQuery = openTicketsQuery.eq("assigned_agent", agentId);

		let resolvedTodayQuery = supabaseAdmin
			.from("tickets")
			.select("*", { count: "exact", head: true })
			.eq("organization_id", orgId)
			.eq("status", "Resolved")
			.gte("sla_resolved_at", startOfTodayIso);
		if (scopeToAgent) resolvedTodayQuery = resolvedTodayQuery.eq("assigned_agent", agentId);

		let categoryQuery = supabaseAdmin
			.from("tickets")
			.select("category")
			.eq("organization_id", orgId)
			.in("status", ["New", "In Progress"]);
		if (scopeToAgent) categoryQuery = categoryQuery.eq("assigned_agent", agentId);

		let severityQuery = supabaseAdmin
			.from("tickets")
			.select("severity")
			.eq("organization_id", orgId)
			.in("status", ["New", "In Progress"]);
		if (scopeToAgent) severityQuery = severityQuery.eq("assigned_agent", agentId);

		let statusQuery = supabaseAdmin
			.from("tickets")
			.select("status")
			.eq("organization_id", orgId);
		if (scopeToAgent) statusQuery = statusQuery.eq("assigned_agent", agentId);

		let awaitingReviewQuery = supabaseAdmin
			.from("tickets")
			.select("*", { count: "exact", head: true })
			.eq("organization_id", orgId)
			.in("status", ["New", "In Progress"])
			.eq("is_flagged_for_review", true);
		if (scopeToAgent) awaitingReviewQuery = awaitingReviewQuery.eq("assigned_agent", agentId);

		// Admin/viewer only: open, unassigned tickets flagged for a human. Agents never assign, so this is always 0 for them.
		const needsAssignmentQuery = scopeToAgent
			? Promise.resolve({ count: 0 as number | null })
			: supabaseAdmin
					.from("tickets")
					.select("*", { count: "exact", head: true })
					.eq("organization_id", orgId)
					.in("status", ["New", "In Progress"])
					.is("assigned_agent", null)
					.eq("is_flagged_for_review", true);

		// Agents don't see the org inbox.
		const totalEmailsQuery = scopeToAgent
			? Promise.resolve({ count: 0 as number | null })
			: supabaseAdmin
					.from("emails")
					.select("*", { count: "exact", head: true })
					.eq("organization_id", orgId);

		const spamEmailsQuery = scopeToAgent
			? Promise.resolve({ count: 0 as number | null })
			: supabaseAdmin
					.from("emails")
					.select("*", { count: "exact", head: true })
					.eq("organization_id", orgId)
					.eq("is_spam", true);

		let aiConfidenceQuery = supabaseAdmin
			.from("tickets")
			.select("ai_confidence")
			.eq("organization_id", orgId)
			.in("status", ["New", "In Progress"]);
		if (scopeToAgent) aiConfidenceQuery = aiConfidenceQuery.eq("assigned_agent", agentId);

		// Run independent queries in parallel
		const [
			{ count: totalTickets },
			{ count: openTickets },
			{ count: resolvedToday },
			{ data: categoryStats },
			{ data: severityStats },
			{ data: statusStats },
			{ count: awaitingReview },
			{ count: needsAssignment },
			{ count: totalEmails },
			{ count: spamEmails },
			{ data: aiConfidenceData },
			{ count: sentToday },
			{ data: agentTicketRows },
			{ data: activityRowsPrefetched },
		] = await Promise.all([
			totalTicketsQuery,
			openTicketsQuery,
			resolvedTodayQuery,
			categoryQuery,
			severityQuery,
			statusQuery,
			awaitingReviewQuery,
			needsAssignmentQuery,
			totalEmailsQuery,
			spamEmailsQuery,
			aiConfidenceQuery,
			scopeToAgent
				? supabaseAdmin
						.from("auto_responses")
						.select("id, tickets!inner(assigned_agent)", { count: "exact", head: true })
						.eq("organization_id", orgId)
						.eq("sent", true)
						.gte("sent_at", startOfTodayIso)
						.eq("tickets.assigned_agent", agentId)
				: supabaseAdmin
						.from("auto_responses")
						.select("*", { count: "exact", head: true })
						.eq("organization_id", orgId)
						.eq("sent", true)
						.gte("sent_at", startOfTodayIso),
			agentTicketIdsPromise,
			recentActivityPromise,
		]);

		// Category breakdown
		const categoryCounts: Record<string, number> = {};
		categoryStats?.forEach((t) => {
			categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
		});

		// Severity breakdown
		const severityCounts: Record<string, number> = {};
		severityStats?.forEach((t) => {
			severityCounts[t.severity] = (severityCounts[t.severity] || 0) + 1;
		});

		// Status breakdown
		const statusCounts: Partial<Record<string, number>> = {};
		statusStats?.forEach((t) => {
			statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
		});

		// Average AI confidence
		let avgAiConfidence: number | null = null;
		if (aiConfidenceData && aiConfidenceData.length > 0) {
			const validScores = aiConfidenceData
				.map((t) => t.ai_confidence)
				.filter((c): c is number => typeof c === "number" && c !== null);
			if (validScores.length > 0) {
				const avg =
					validScores.reduce((a, b) => a + b, 0) / validScores.length;
				avgAiConfidence = Math.round(avg * 1000) / 1000;
			}
		}

		const duplicateEmails = 0; // Duplicate tracking is handled at pipeline level

		const slaMetrics = await slaMetricsPromise;

		// Only the alerts actually returned need subject/customer enrichment.
		let slaAlerts = (await slaAlertsPromise).slice(0, 10);
		if (slaAlerts.length > 0) {
			const alertIds = slaAlerts.map((a) => a.ticket_id);
			let ticketDataQuery = supabaseAdmin
				.from("tickets")
				.select("id, subject, contacts(name, email)")
				.eq("organization_id", orgId)
				.in("id", alertIds);
			if (scopeToAgent) ticketDataQuery = ticketDataQuery.eq("assigned_agent", agentId);
			const { data: ticketData } = await ticketDataQuery;

			slaAlerts = slaAlerts.map((alert) => {
				const row = ticketData?.find((t) => t.id === alert.ticket_id);
				const contact = row?.contacts;
				const contactObj = Array.isArray(contact) ? contact[0] : contact;
				return {
					...alert,
					subject: row?.subject ?? null,
					customer:
						(contactObj?.name as string) ||
						(contactObj?.email as string) ||
						null,
				};
			});
		}

		// For agents, the recent-activity query depends on the ticket ids just
		// fetched above, so it runs as one extra sequential round trip here.
		let activityRows: AuditLogDbRow[] = [];
		if (scopeToAgent) {
			const ticketIds = (agentTicketRows ?? []).map((t) => t.id);
			if (ticketIds.length > 0) {
				const { data } = await supabaseAdmin
					.from("audit_logs")
					.select("*")
					.eq("organization_id", orgId)
					.in("ticket_id", ticketIds)
					.order("created_at", { ascending: false })
					.limit(10);
				activityRows = (data ?? []) as AuditLogDbRow[];
			}
		} else {
			activityRows = (activityRowsPrefetched ?? []) as AuditLogDbRow[];
		}

		// Give each event its ticket key and subject so the feed says which ticket changed.
		const ticketKeyOf = (row: AuditLogDbRow): string | null =>
			row.ticket_id ?? (row.entity_type === "ticket" ? row.entity_id ?? null : null);

		const activityTicketIds = [
			...new Set(
				activityRows
					.map((row) => ticketKeyOf(row))
					.filter((id): id is string => typeof id === "string"),
			),
		];
		let activityTickets = new Map<string, { ticket_number: string; subject: string }>();
		if (activityTicketIds.length > 0) {
			const { data: ticketRefs } = await supabaseAdmin
				.from("tickets")
				.select("id, ticket_number, subject")
				.eq("organization_id", orgId)
				.in("id", activityTicketIds);
			activityTickets = new Map((ticketRefs ?? []).map((t) => [t.id, t]));
		}
		const recentActivity = activityRows.map((row) => {
			const ref = activityTickets.get(ticketKeyOf(row) ?? "");
			return { ...row, ticket_number: ref?.ticket_number ?? null, ticket_subject: ref?.subject ?? null };
		});

		return NextResponse.json({
			tickets: {
				total: totalTickets || 0,
				open: openTickets || 0,
				resolved_today: resolvedToday || 0,
				awaiting_review: awaitingReview || 0,
				needs_assignment: scopeToAgent ? 0 : needsAssignment || 0,
				avg_ai_confidence: avgAiConfidence,
				by_category: categoryCounts,
				by_severity: severityCounts,
				by_status: statusCounts,
			},
			emails: {
				total: scopeToAgent ? 0 : totalEmails || 0,
				spam: scopeToAgent ? 0 : spamEmails || 0,
				duplicates: scopeToAgent ? 0 : duplicateEmails || 0,
			},
			responses: {
				sent_today: sentToday || 0,
			},
			sla: slaMetrics,
			sla_alerts: slaAlerts,
			recent_activity: recentActivity,
			generated_at: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Dashboard stats error:", error);
		return NextResponse.json(
			{ error: "Failed to fetch dashboard stats" },
			{ status: 500 },
		);
	}
}
