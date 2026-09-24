// Dashboard stats endpoint: compiles ticket counts, email metrics, SLA status, and activity feed for the org.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { getSLAMetrics, getSLAAlerts } from "@/server/pipeline/sla-tracker";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const startOfTodayIso = new Date(
			new Date().setHours(0, 0, 0, 0),
		).toISOString();

		// Start the slow SLA computation and the activity feed immediately so they
		// overlap with the count queries below instead of running after them.
		const slaAlertsPromise = getSLAAlerts(orgId);
		const slaMetricsPromise = slaAlertsPromise.then((alerts) => getSLAMetrics(orgId, alerts));
		const recentActivityPromise = supabaseAdmin
			.from("audit_logs")
			.select("*")
			.eq("organization_id", orgId)
			.order("created_at", { ascending: false })
			.limit(10);

		// Run independent queries in parallel
		const [
			{ count: totalTickets },
			{ count: openTickets },
			{ count: resolvedToday },
			{ data: categoryStats },
			{ data: severityStats },
			{ data: statusStats },
			{ count: awaitingReview },
			{ count: totalEmails },
			{ count: spamEmails },
			{ data: aiConfidenceData },
			{ count: sentToday },
		] = await Promise.all([
			supabaseAdmin
				.from("tickets")
				.select("*", { count: "exact", head: true })
				.eq("organization_id", orgId),
			supabaseAdmin
				.from("tickets")
				.select("*", { count: "exact", head: true })
				.eq("organization_id", orgId)
				.in("status", ["New", "In Progress"]),
			supabaseAdmin
				.from("tickets")
				.select("*", { count: "exact", head: true })
				.eq("organization_id", orgId)
				.eq("status", "Resolved")
				.gte("sla_resolved_at", startOfTodayIso),
			supabaseAdmin
				.from("tickets")
				.select("category")
				.eq("organization_id", orgId)
				.in("status", ["New", "In Progress"]),
			supabaseAdmin
				.from("tickets")
				.select("severity")
				.eq("organization_id", orgId)
				.in("status", ["New", "In Progress"]),
			supabaseAdmin
				.from("tickets")
				.select("status")
				.eq("organization_id", orgId),
			supabaseAdmin
				.from("tickets")
				.select("*", { count: "exact", head: true })
				.eq("organization_id", orgId)
				.in("status", ["New", "In Progress"])
				.eq("is_flagged_for_review", true),
			supabaseAdmin
				.from("emails")
				.select("*", { count: "exact", head: true })
				.eq("organization_id", orgId),
			supabaseAdmin
				.from("emails")
				.select("*", { count: "exact", head: true })
				.eq("organization_id", orgId)
				.eq("is_spam", true),
			supabaseAdmin
				.from("tickets")
				.select("ai_confidence")
				.eq("organization_id", orgId)
				.in("status", ["New", "In Progress"]),
			supabaseAdmin
				.from("auto_responses")
				.select("*", { count: "exact", head: true })
				.eq("organization_id", orgId)
				.eq("sent", true)
				.gte("sent_at", startOfTodayIso),
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
			const { data: ticketData } = await supabaseAdmin
				.from("tickets")
				.select("id, subject, contacts(name, email)")
				.eq("organization_id", orgId)
				.in("id", alertIds);

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

		const { data: activityRows } = await recentActivityPromise;

		// Give each event its ticket key and subject so the feed says which ticket changed.
		const activity = activityRows ?? [];
		const activityTicketIds = [
			...new Set(
				activity
					.map((row) => row.ticket_id ?? (row.entity_type === "ticket" ? row.entity_id : null))
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
		const recentActivity = activity.map((row) => {
			const ref = activityTickets.get(row.ticket_id ?? (row.entity_type === "ticket" ? row.entity_id : ""));
			return { ...row, ticket_number: ref?.ticket_number ?? null, ticket_subject: ref?.subject ?? null };
		});

		return NextResponse.json({
			tickets: {
				total: totalTickets || 0,
				open: openTickets || 0,
				resolved_today: resolvedToday || 0,
				awaiting_review: awaitingReview || 0,
				avg_ai_confidence: avgAiConfidence,
				by_category: categoryCounts,
				by_severity: severityCounts,
				by_status: statusCounts,
			},
			emails: {
				total: totalEmails || 0,
				spam: spamEmails || 0,
				duplicates: duplicateEmails || 0,
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
