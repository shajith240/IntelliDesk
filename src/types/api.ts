// Response shapes of the app's own route handlers (src/app/api/**).
// Keep in sync with the handlers; UI code must only read fields declared here.

import type {
	AccountTier,
	EmailCategory,
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

/** One entry in a ticket's conversation (ticket_messages, migration 009). */
export interface TicketMessageRow {
	id: string;
	/** customer: inbound email; reply: public email from the team; note: internal only */
	kind: "customer" | "reply" | "note";
	author_type: "customer" | "agent" | "ai";
	author_user_id: string | null;
	body_text: string;
	delivery_status: "sending" | "sent" | "failed" | null;
	delivery_error: string | null;
	created_at: string;
	users: { id: string; name: string } | null;
	emails: {
		from_address: string;
		from_name: string | null;
		to_address: string;
		subject: string;
		language: string | null;
	} | null;
}

export interface AutoResponseRow {
	id: string;
	match_type: MatchType;
	response_text: string;
	match_score: number;
	sent: boolean;
	sent_message_id: string | null;
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
	ticket_messages: TicketMessageRow[];
	/** The Closed ticket this one continues (tickets.follow_up_of), if any. */
	follow_up_parent: { id: string; ticket_number: string } | null;
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
	/** Statuses this ticket may move to next, from the ticket_status_transitions table. */
	allowed_statuses: TicketStatus[];
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

/** Assignment is not patchable here; use POST /api/tickets/[id]/assign (admins). */
export interface TicketPatchBody {
	status?: TicketStatus;
	severity?: Severity;
	category?: EmailCategory;
	/** Admins only. */
	assigned_team_id?: string | null;
}

// ---------- POST /api/tickets/[id]/assign (admins) ----------

export interface AssignTicketBody {
	/** null unassigns. */
	assignee_id: string | null;
	note?: string;
}

// ---------- POST /api/respond ----------

export interface RespondBody {
	ticket_id: string;
	response_id?: string;
	response_text: string;
}

// ---------- POST /api/tickets/[id]/messages ----------

export type ReplyStatusAfter = "In Progress" | "Pending" | "Resolved";

export type PostMessageBody =
	| { kind: "reply"; body: string; status_after?: ReplyStatusAfter; draft_id?: string }
	| { kind: "note"; body: string };

export interface PostMessageResponse {
	message_id: string;
	/** Present for replies: the ticket's status after sending, and the recipient. */
	status?: TicketStatus;
	to?: string;
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
		/** Open, unassigned tickets flagged for human review; always 0 on an agent's dashboard. */
		needs_assignment: number;
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
	is_active: boolean;
	is_available: boolean;
	last_login: string | null;
	created_at: string;
}

/** GET /api/team (?include=inactive, admins only, adds deactivated members). */
export interface TeamResponse {
	organization: { id: string; name: string };
	members: TeamMember[];
}

// ---------- POST /api/team, PATCH /api/team/[id] (admins) ----------

export interface CreateMemberBody {
	name: string;
	email: string;
	role: "admin" | "agent" | "viewer";
}

export interface CreateMemberResponse {
	member: TeamMember;
	/** Shown to the admin once; never retrievable again. */
	initial_password: string;
}

export interface UpdateMemberBody {
	name?: string;
	role?: "admin" | "agent" | "viewer";
	is_active?: boolean;
}

// ---------- GET /api/team/workload (admins) ----------

export interface AssigneeCandidate {
	id: string;
	name: string;
	email: string;
	role: "admin" | "agent";
	is_available: boolean;
	open_tickets: number;
}

/** Sorted: available first, then fewest open tickets. */
export interface WorkloadResponse {
	candidates: AssigneeCandidate[];
}

// ---------- GET/PATCH /api/me, POST /api/me/password ----------

export interface Me {
	id: string;
	name: string;
	email: string;
	role: UserRole;
	is_available: boolean;
}

export interface MeResponse {
	me: Me;
}

// ---------- /api/settings/email-config ----------

export type MailboxProvider = "gmail" | "imap_smtp";

export interface MailboxStatus {
	provider: MailboxProvider;
	email_address: string;
	imap_host: string;
	imap_port: number;
	smtp_host: string;
	smtp_port: number;
	status: "active" | "error" | "disconnected";
	last_error: string | null;
	last_synced_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface MailboxResponse {
	connected: boolean;
	mailbox: MailboxStatus | null;
}

export type ConnectMailboxBody =
	| { provider: "gmail"; email: string; app_password: string }
	| {
			provider: "imap_smtp";
			email: string;
			username?: string;
			app_password: string;
			imap_host: string;
			imap_port: 993;
			smtp_host: string;
			smtp_port: 465 | 587;
	  };
