import "server-only";
import { supabaseAdmin } from "@/server/db/supabase";

interface SLAStatus {
	ticket_id: string;
	ticket_number: string;
	severity: string;
	first_response_due: string | null;
	resolution_due: string | null;
	first_response_at: string | null;
	resolved_at: string | null;
	first_response_breached: boolean;
	resolution_breached: boolean;
	time_to_first_response_minutes: number | null;
	time_to_resolution_minutes: number | null;
}

interface SlaPolicyRow {
	severity: string;
	organization_id: string | null;
	first_response_minutes: number;
	resolution_minutes: number;
}

/**
 * Build a severity -> policy map from candidate rows, preferring the
 * organization-specific row over the global default (organization_id null)
 * when both are present for the same severity.
 */
function buildPolicyMap(
	rows: SlaPolicyRow[],
): Map<string, { first_response_minutes: number; resolution_minutes: number }> {
	const map = new Map<
		string,
		{ first_response_minutes: number; resolution_minutes: number }
	>();
	for (const row of [...rows].sort(
		(a, b) => Number(a.organization_id !== null) - Number(b.organization_id !== null),
	)) {
		map.set(row.severity, {
			first_response_minutes: row.first_response_minutes,
			resolution_minutes: row.resolution_minutes,
		});
	}
	return map;
}

/**
 * Calculate SLA status for a ticket
 */
export async function getTicketSLAStatus(
	ticketId: string,
): Promise<SLAStatus | null> {
	const { data: ticket } = await supabaseAdmin
		.from("tickets")
		.select(
			"id, ticket_number, severity, organization_id, created_at, sla_first_response_at, sla_resolved_at",
		)
		.eq("id", ticketId)
		.single();

	if (!ticket) return null;

	// Two rows can match (org override + global default); never .single() this.
	const { data: policyRows } = await supabaseAdmin
		.from("sla_policies")
		.select("severity, organization_id, first_response_minutes, resolution_minutes")
		.eq("severity", ticket.severity)
		.or(`organization_id.eq.${ticket.organization_id},organization_id.is.null`);

	const slaPolicy = policyRows
		? buildPolicyMap(policyRows as SlaPolicyRow[]).get(ticket.severity)
		: undefined;

	if (!slaPolicy) return null;

	const createdAt = new Date(ticket.created_at);
	const now = new Date();

	const firstResponseDue = new Date(
		createdAt.getTime() + slaPolicy.first_response_minutes * 60 * 1000,
	);
	const resolutionDue = new Date(
		createdAt.getTime() + slaPolicy.resolution_minutes * 60 * 1000,
	);

	const firstResponseAt = ticket.sla_first_response_at
		? new Date(ticket.sla_first_response_at)
		: null;
	const resolvedAt = ticket.sla_resolved_at
		? new Date(ticket.sla_resolved_at)
		: null;

	const firstResponseBreached = firstResponseAt
		? firstResponseAt > firstResponseDue
		: now > firstResponseDue;

	const resolutionBreached = resolvedAt
		? resolvedAt > resolutionDue
		: now > resolutionDue;

	return {
		ticket_id: ticket.id,
		ticket_number: ticket.ticket_number,
		severity: ticket.severity,
		first_response_due: firstResponseDue.toISOString(),
		resolution_due: resolutionDue.toISOString(),
		first_response_at: ticket.sla_first_response_at,
		resolved_at: ticket.sla_resolved_at,
		first_response_breached: firstResponseBreached,
		resolution_breached: resolutionBreached,
		time_to_first_response_minutes: firstResponseAt
			? Math.round((firstResponseAt.getTime() - createdAt.getTime()) / 60000)
			: null,
		time_to_resolution_minutes: resolvedAt
			? Math.round((resolvedAt.getTime() - createdAt.getTime()) / 60000)
			: null,
	};
}

/**
 * Get all tickets that are breaching or about to breach SLA.
 * `assigneeId`, when set, restricts to tickets assigned to that user (used for
 * agents, who may only see SLA data for their own tickets).
 */
export async function getSLAAlerts(orgId?: string, assigneeId?: string): Promise<SLAStatus[]> {
	let query = supabaseAdmin
		.from("tickets")
		.select(
			"id, ticket_number, severity, created_at, sla_first_response_at, sla_resolved_at",
		)
		.in("status", ["New", "In Progress"])
		.order("created_at", { ascending: true });

	if (orgId) {
		query = query.eq("organization_id", orgId);
	}
	if (assigneeId) {
		query = query.eq("assigned_agent", assigneeId);
	}

	const { data: openTickets } = await query;

	if (!openTickets || openTickets.length === 0) return [];

	// Two rows can match per severity (org override + global default); never .single() this.
	let policiesQuery = supabaseAdmin
		.from("sla_policies")
		.select("severity, organization_id, first_response_minutes, resolution_minutes");

	if (orgId) {
		policiesQuery = policiesQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
	}

	const { data: slaPolicies } = await policiesQuery;

	if (!slaPolicies) return [];

	const policyMap = buildPolicyMap(slaPolicies as SlaPolicyRow[]);

	const now = new Date();
	const alerts: SLAStatus[] = [];

	for (const ticket of openTickets) {
		const policy = policyMap.get(ticket.severity);
		if (!policy) continue;

		const createdAt = new Date(ticket.created_at);
		const firstResponseDue = new Date(
			createdAt.getTime() + policy.first_response_minutes * 60 * 1000,
		);
		const resolutionDue = new Date(
			createdAt.getTime() + policy.resolution_minutes * 60 * 1000,
		);

		const firstResponseAt = ticket.sla_first_response_at
			? new Date(ticket.sla_first_response_at)
			: null;
		const resolvedAt = ticket.sla_resolved_at
			? new Date(ticket.sla_resolved_at)
			: null;

		const firstResponseBreached = firstResponseAt
			? firstResponseAt > firstResponseDue
			: now > firstResponseDue;

		const resolutionBreached = resolvedAt
			? resolvedAt > resolutionDue
			: now > resolutionDue;

		// Alert if breached OR within 25% of deadline
		const firstResponseWarning =
			!firstResponseAt &&
			now.getTime() >
				firstResponseDue.getTime() -
					policy.first_response_minutes * 60 * 1000 * 0.25;

		const resolutionWarning =
			!resolvedAt &&
			now.getTime() >
				resolutionDue.getTime() - policy.resolution_minutes * 60 * 1000 * 0.25;

		if (
			firstResponseBreached ||
			resolutionBreached ||
			firstResponseWarning ||
			resolutionWarning
		) {
			alerts.push({
				ticket_id: ticket.id,
				ticket_number: ticket.ticket_number,
				severity: ticket.severity,
				first_response_due: firstResponseDue.toISOString(),
				resolution_due: resolutionDue.toISOString(),
				first_response_at: ticket.sla_first_response_at,
				resolved_at: ticket.sla_resolved_at,
				first_response_breached: firstResponseBreached,
				resolution_breached: resolutionBreached,
				time_to_first_response_minutes: firstResponseAt
					? Math.round(
							(firstResponseAt.getTime() - createdAt.getTime()) / 60000,
						)
					: null,
				time_to_resolution_minutes: resolvedAt
					? Math.round((resolvedAt.getTime() - createdAt.getTime()) / 60000)
					: null,
			});
		}
	}

	// Sort: breached first, then by severity
	const severityOrder: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
	alerts.sort((a, b) => {
		const aBreached =
			a.first_response_breached || a.resolution_breached ? 0 : 1;
		const bBreached =
			b.first_response_breached || b.resolution_breached ? 0 : 1;
		if (aBreached !== bBreached) return aBreached - bBreached;
		return (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5);
	});

	return alerts;
}

/**
 * Get SLA metrics summary for dashboard.
 * `assigneeId`, when set, restricts totals/averages to tickets assigned to
 * that user (used for agents on their own dashboard).
 */
export async function getSLAMetrics(
	orgId?: string,
	precomputedAlerts?: SLAStatus[],
	assigneeId?: string,
): Promise<{
	total_open: number;
	breached: number;
	at_risk: number;
	within_sla: number;
	avg_first_response_minutes: number | null;
	avg_resolution_minutes: number | null;
}> {
	const alerts = precomputedAlerts ?? (await getSLAAlerts(orgId, assigneeId));

	let openQuery = supabaseAdmin
		.from("tickets")
		.select("id", { count: "exact" })
		.in("status", ["New", "In Progress"]);

	if (orgId) {
		openQuery = openQuery.eq("organization_id", orgId);
	}
	if (assigneeId) {
		openQuery = openQuery.eq("assigned_agent", assigneeId);
	}

	const { data: openTickets } = await openQuery;

	const totalOpen = openTickets?.length || 0;
	const breached = alerts.filter(
		(a) => a.first_response_breached || a.resolution_breached,
	).length;
	const atRisk = alerts.length - breached;

	// Calculate averages from resolved tickets
	let resolvedQuery = supabaseAdmin
		.from("tickets")
		.select("created_at, sla_first_response_at, sla_resolved_at")
		.eq("status", "Resolved")
		.not("sla_first_response_at", "is", null)
		.not("sla_resolved_at", "is", null)
		.limit(100);

	if (orgId) {
		resolvedQuery = resolvedQuery.eq("organization_id", orgId);
	}
	if (assigneeId) {
		resolvedQuery = resolvedQuery.eq("assigned_agent", assigneeId);
	}

	const { data: resolvedTickets } = await resolvedQuery;

	let avgFirstResponse: number | null = null;
	let avgResolution: number | null = null;

	if (resolvedTickets && resolvedTickets.length > 0) {
		const firstResponseTimes = resolvedTickets
			.filter((t) => t.sla_first_response_at)
			.map(
				(t) =>
					(new Date(t.sla_first_response_at!).getTime() -
						new Date(t.created_at).getTime()) /
					60000,
			);

		const resolutionTimes = resolvedTickets
			.filter((t) => t.sla_resolved_at)
			.map(
				(t) =>
					(new Date(t.sla_resolved_at!).getTime() -
						new Date(t.created_at).getTime()) /
					60000,
			);

		if (firstResponseTimes.length > 0) {
			avgFirstResponse = Math.round(
				firstResponseTimes.reduce((a, b) => a + b, 0) /
					firstResponseTimes.length,
			);
		}
		if (resolutionTimes.length > 0) {
			avgResolution = Math.round(
				resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length,
			);
		}
	}

	return {
		total_open: totalOpen,
		breached,
		at_risk: atRisk,
		within_sla: totalOpen - breached - atRisk,
		avg_first_response_minutes: avgFirstResponse,
		avg_resolution_minutes: avgResolution,
	};
}
