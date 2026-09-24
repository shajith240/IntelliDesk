// Response shapes of the app's own route handlers (src/app/api/**).
// Keep in sync with the handlers; UI code must only read fields declared here.

import type {
	AccountTier,
	EmailCategory,
	EmailRelationship,
	MatchType,
	Severity,
	Ticket,
	TicketStatus,
	UserRole,
} from "./index";

export interface ApiError {
	error: string;
}

// ---------- GET /api/tickets ----------

export interface TicketContactRef {
	id: string;
	name: string | null;
	email: string;
}

export interface TicketAccountRef {
	id: string;
	company_name: string;
	tier: AccountTier;
}

export type TicketListItem = Omit<Ticket, "account" | "contact" | "emails"> & {
	contacts: TicketContactRef | null;
	accounts: TicketAccountRef | null;
};

export interface TicketListResponse {
	tickets: TicketListItem[];
	total: number;
	page: number;
	limit: number;
	total_pages: number;
}

export type TicketSortField =
	| "created_at"
	| "updated_at"
	| "severity"
	| "status"
	| "ticket_number";

export interface TicketListQuery {
	status?: TicketStatus;
	statuses?: TicketStatus[];
	severity?: Severity;
	severities?: Severity[];
	category?: EmailCategory;
	search?: string;
	assigned?: "me" | "unassigned";
	page?: number;
	limit?: number;
	sort?: TicketSortField;
	order?: "asc" | "desc";
}

// ---------- GET /api/tickets/[id] ----------

export interface SLAStatus {
	ticket_id: string;
	ticket_number: string;
	severity: Severity;
	first_response_due: string | null;
	resolution_due: string | null;
	first_response_at: string | null;
	resolved_at: string | null;
	first_response_breached: boolean;
	resolution_breached: boolean;
	time_to_first_response_minutes: number | null;
	time_to_resolution_minutes: number | null;
}

export interface TicketEmailRow {
	email_id: string;
	relationship: EmailRelationship;
	emails: {
		id: string;
		message_id: string | null;
		from_address: string;
		from_name: string | null;
		subject: string;
		body_text: string;
		body_html: string | null;
		received_at: string;
		language: string | null;
	} | null;
}

export interface AutoResponseRow {
	id: string;
	match_type: MatchType;
	response_text: string;
	match_score: number;
	sent: boolean;
	created_at: string;
}

export type TicketDetail = Omit<Ticket, "account" | "contact" | "emails"> & {
	contacts: {
		id: string;
		name: string | null;
		email: string;
		role: string | null;
		phone: string | null;
	} | null;
	accounts: {
		id: string;
		company_name: string;
		domain: string;
		tier: AccountTier;
	} | null;
	ticket_emails: TicketEmailRow[];
	auto_responses: AutoResponseRow[];
};

export interface SimilarTicketRef {
	id: string;
	ticket_number: string;
	subject: string;
	severity: Severity;
	status: TicketStatus;
	created_at: string;
}

export interface TicketDetailResponse {
	ticket: TicketDetail;
	sla: SLAStatus | null;
	similar_tickets: SimilarTicketRef[];
}

/** Shape written by src/server/pipeline/processor.ts into tickets.ai_classification. */
export interface AIClassification {
	category?: string;
	severity?: string;
	confidence?: number;
	sentiment?: string;
	language?: string;
	is_spam?: boolean;
	summary?: string;
	reasoning?: string;
	key_entities?: string[];
	suggested_tags?: string[];
	requires_human_review?: boolean;
}

// ---------- PATCH /api/tickets/[id] ----------

export interface TicketPatchBody {
	status?: TicketStatus;
	severity?: Severity;
	category?: EmailCategory;
	assigned_team?: string | null;
	assigned_agent?: string | null;
}

// ---------- POST /api/respond ----------

export interface RespondBody {
	ticket_id: string;
	response_id?: string;
	response_text: string;
}

export interface RespondResponse {
	success: true;
	message: string;
	ticket_id: string;
}

// ---------- GET /api/dashboard ----------

export interface AuditLogRow {
	id: string;
	organization_id: string;
	ticket_id: string | null;
	entity_type?: string | null;
	entity_id?: string | null;
	action: string;
	details: Record<string, unknown> | null;
	performed_by?: string | null;
	created_at: string;
	/** Joined by /api/dashboard; null when the event isn't tied to a ticket in this org. */
	ticket_number: string | null;
	ticket_subject: string | null;
}

export interface SLAAlert extends SLAStatus {
	subject: string | null;
	customer: string | null;
}

export interface DashboardResponse {
	tickets: {
		total: number;
		open: number;
		resolved_today: number;
		awaiting_review: number;
		avg_ai_confidence: number | null;
		by_category: Record<string, number>;
		by_severity: Partial<Record<Severity, number>>;
		by_status: Partial<Record<TicketStatus, number>>;
	};
	emails: {
		total: number;
		spam: number;
		duplicates: number;
	};
	responses: {
		sent_today: number;
	};
	sla: {
		total_open: number;
		breached: number;
		at_risk: number;
		within_sla: number;
		avg_first_response_minutes: number | null;
		avg_resolution_minutes: number | null;
	};
	sla_alerts: SLAAlert[];
	recent_activity: AuditLogRow[];
	generated_at: string;
}

// ---------- GET /api/team ----------

export interface TeamMember {
	id: string;
	name: string;
	email: string;
	role: UserRole;
}

export interface TeamResponse {
	organization: { id: string; name: string };
	members: TeamMember[];
}
