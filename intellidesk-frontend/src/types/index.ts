// ============================================================================
// IntelliDesk AI - Unified Type Definitions
// Merged from backend (shajith240/intellidesk) and frontend (dineshydk/intellidesk-ai)
// ============================================================================

// ==================== ENUMS ====================

export type TicketStatus = "New" | "In Progress" | "Resolved" | "Closed";

export type Severity = "P1" | "P2" | "P3" | "P4";

export type EmailCategory =
	| "Technical Support"
	| "Access Request"
	| "Billing/Invoice"
	| "Feature Request"
	| "Hardware/Infrastructure"
	| "How-To/Documentation"
	| "Data Request"
	| "Complaint/Escalation"
	| "General Inquiry";

export type AccountTier = "Gold" | "Silver" | "Bronze";

export type MatchType = "perfect" | "partial" | "none";

export type EmailRelationship = "original" | "reply" | "forward" | "duplicate";

export type LeadStatus = "new" | "contacted" | "qualified" | "converted";

export type AutoResponseType = "perfect" | "partial" | "none";

export type UserRole = "admin" | "agent" | "viewer";

// ==================== AUTH MODELS ====================

export interface Organization {
	id: string;
	name: string;
	slug: string;
	domain: string | null;
	plan: string;
	max_agents: number;
	created_at: string;
	updated_at: string;
}

export interface User {
	id: string;
	organization_id: string;
	email: string;
	name: string;
	password_hash: string;
	role: UserRole;
	avatar_url: string | null;
	is_active: boolean;
	last_login: string | null;
	created_at: string;
	updated_at: string;
	organization?: Organization;
}

// ==================== DATABASE MODELS ====================

export interface Account {
	id: string;
	domain: string;
	company_name: string;
	tier: AccountTier;
	csm_name: string | null;
	csm_email: string | null;
	plan: string | null;
	location: string | null;
	created_at: string;
}

export interface Contact {
	id: string;
	account_id: string | null;
	email: string;
	name: string | null;
	role: string | null;
	department: string | null;
	phone: string | null;
	last_login: string | null;
	subscribed_modules: string[];
	is_lead: boolean;
	lead_status: LeadStatus | null;
	created_at: string;
}

export interface Email {
	id: string;
	message_id: string | null;
	in_reply_to: string | null;
	references_header: string[];
	from_address: string;
	from_name: string | null;
	to_address: string;
	cc: string | null;
	subject: string;
	body_text: string;
	body_html: string | null;
	raw_headers: Record<string, unknown> | null;
	received_at: string;
	processed: boolean;
	is_spam: boolean;
	language: string | null;
	embedding_id: string | null;
	created_at: string;
}

export interface Ticket {
	id: string;
	ticket_number: string;
	status: TicketStatus;
	category: EmailCategory | null;
	subcategory: string | null;
	severity: Severity;
	ai_confidence: number | null;
	subject: string;
	summary: string | null;
	account_id: string | null;
	contact_id: string | null;
	assigned_team: string | null;
	assigned_agent: string | null;
	sla_first_response_due: string | null;
	sla_resolution_due: string | null;
	sla_first_response_at: string | null;
	sla_resolved_at: string | null;
	sla_breach: boolean;
	escalation_count: number;
	auto_response_sent: boolean;
	auto_response_type: AutoResponseType | null;
	is_flagged_for_review: boolean;
	ai_classification?: Record<string, unknown>;
	created_at: string;
	updated_at: string;
	// Joined fields
	account?: Account;
	contact?: Contact;
	emails?: TicketEmail[];
}

export interface TicketEmail {
	id: string;
	ticket_id: string;
	email_id: string;
	relationship: EmailRelationship;
	email?: Email;
}

export interface FAQ {
	id: string;
	question: string;
	answer: string;
	category: EmailCategory;
	solution_steps: string[];
	video_url: string | null;
	manual_ref: string | null;
	success_rate: number;
	avg_resolution_minutes: number | null;
	times_used: number;
	embedding_id: string | null;
	created_at: string;
}

export interface AutoResponse {
	id: string;
	ticket_id: string;
	email_id: string | null;
	response_text: string;
	match_type: MatchType;
	match_score: number;
	cited_faq_ids: string[];
	cited_ticket_ids: string[];
	sent: boolean;
	sent_at: string | null;
	created_at: string;
}

export interface SLAPolicy {
	id: string;
	severity: Severity;
	first_response_minutes: number;
	resolution_minutes: number;
}

export interface Team {
	id: string;
	name: string;
	description: string | null;
	category_routing: EmailCategory[];
}

export interface AuditLog {
	id: string;
	ticket_id: string;
	action: string;
	details: Record<string, unknown> | null;
	performed_by: string;
	created_at: string;
}

// ==================== AI/PIPELINE TYPES ====================

export interface ClassificationResult {
	is_spam: boolean;
	spam_reason?: string | null;
	category: EmailCategory;
	subcategory?: string;
	severity: Severity;
	language: string;
	sentiment: "angry" | "frustrated" | "neutral" | "positive" | "negative";
	confidence: number;
	summary: string;
	key_entities: string[];
	suggested_tags: string[];
	requires_human_review: boolean;
	reasoning: string;
	entities?: string[];
	category_confidence?: number;
	severity_confidence?: number;
	severity_signals?: string[];
	escalation_recommended?: boolean;
	escalation_reason?: string | null;
}

export interface ThreadDetectionResult {
	is_thread: boolean;
	existing_ticket_id: string | null;
	thread_type:
		| "header"
		| "ticket_ref"
		| "subject_match"
		| "sender_time"
		| "none";
	confidence: number;
	matched_email_id: string | null;
}

export interface DeduplicationResult {
	is_duplicate: boolean;
	duplicate_of: string | null;
	duplicate_of_email_id?: string | null;
	duplicate_of_ticket_id?: string | null;
	similarity_score: number;
	method:
		| "header"
		| "message_id"
		| "ticket_ref"
		| "subject"
		| "semantic"
		| "none";
}

export interface CustomerIdentificationResult {
	account: Account | null;
	contact: Contact | null;
	is_new_lead?: boolean;
	is_existing_customer?: boolean;
	is_existing?: boolean;
	contact_id?: string | null;
	account_id?: string | null;
	account_name?: string | null;
	account_tier?: string | null;
	contact_name?: string;
	method?: string;
	extracted_signature?: ExtractedSignature | null;
}

export interface ExtractedSignature {
	name: string | null;
	role: string | null;
	company: string | null;
	phone: string | null;
	email: string | null;
}

export interface FAQMatch {
	faq?: FAQ;
	faq_id?: string;
	question?: string;
	answer?: string;
	score: number;
}

export interface SimilarTicket {
	ticket: Ticket;
	score: number;
	resolution_summary: string | null;
}

export interface AutoResponseResult {
	response_text: string | null;
	match_type?: MatchType;
	match_score?: number;
	cited_faqs?: FAQMatch[];
	cited_ticket_ids?: string[];
	similar_tickets?: SimilarTicket[];
	should_respond?: boolean;
	response_type?: "auto" | "suggest" | "none";
	faq_matches?: FAQMatch[];
	confidence?: number;
	reasoning?: string;
}

export interface PipelineResult {
	email_id: string;
	ticket_id?: string | null;
	ticket_number?: string | null;
	status?: string;
	classification?: ClassificationResult | null;
	thread?: ThreadDetectionResult | null;
	dedup?: DeduplicationResult | null;
	customer?: CustomerIdentificationResult | null;
	auto_response?: AutoResponseResult | null;
	auto_response_sent?: boolean;
	skipped_reason?: string | null;
	message?: string;
	processing_time_ms: number;
}

// ==================== RAW EMAIL ====================

export interface RawEmail {
	message_id: string | null;
	in_reply_to: string | null;
	references: string[];
	from_address: string;
	from_name: string | null;
	to_address: string;
	cc: string | null;
	subject: string;
	body_text: string;
	body_html: string | null;
	raw_headers: Record<string, unknown> | null;
	received_at: Date;
}

// ==================== API TYPES ====================

export interface EmailIngestPayload {
	from_address: string;
	from_name?: string;
	to_address?: string;
	cc?: string;
	subject: string;
	body_text: string;
	body_html?: string;
	message_id?: string;
	in_reply_to?: string;
	references?: string[];
	received_at?: string;
}

export interface BulkEmailPayload {
	emails: EmailIngestPayload[];
}

export interface TicketUpdatePayload {
	status?: TicketStatus;
	assigned_agent?: string;
	assigned_team?: string;
	severity?: Severity;
	notes?: string;
}

export interface FAQPayload {
	question: string;
	answer: string;
	category: EmailCategory;
	solution_steps?: string[];
	video_url?: string;
	manual_ref?: string;
}

// ==================== FRONTEND COMPATIBILITY ALIASES ====================
// These aliases maintain backward compatibility with the original frontend
// components that used different naming conventions.

export type Priority = Severity;
export type CustomerTier = AccountTier;
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'angry' | 'frustrated' | 'happy';

/** Legacy AI analysis shape used by frontend components like AIReasoningOverlay */
export interface AIAnalysis {
	category: string;
	confidence: number;
	reasoning: string;
	sentiment: string;
}

