"use client";

// Displays ticket metadata: assignee, priority, SLA timers, reporter, organization, contact info.
import { useSession } from "next-auth/react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Lozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTeam } from "@/hooks/useApi";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";
import { formatDateTime, isSeverity, PRIORITY_META, readSla, SEVERITIES } from "@/lib/ticket-meta";
import { useTicketMutation } from "./useTicketMutation";
import type { TicketDetail, SLAStatus } from "@/types/api";
import { differenceInMinutes, parseISO } from "date-fns";

interface DetailsColumnProps {
	ticket: TicketDetail;
	sla: SLAStatus | null;
}

export function DetailsColumn({ ticket, sla }: DetailsColumnProps) {
	const { data: session } = useSession();
	const { data: team } = useTeam();
	const { pendingField, update } = useTicketMutation(ticket.id);
	const now = useNow();

	const member = team?.members.find((m) => m.id === ticket.assigned_agent) ?? null;
	const isSelf = ticket.assigned_agent === session?.user.id;
	const assigneeName = isSelf ? "You" : (member?.name ?? null);

	const firstResponseWindow = ticket.sla_first_response_due
		? differenceInMinutes(parseISO(ticket.sla_first_response_due), parseISO(ticket.created_at))
		: undefined;
	const resolutionWindow = ticket.sla_resolution_due
		? differenceInMinutes(parseISO(ticket.sla_resolution_due), parseISO(ticket.created_at))
		: undefined;

	const firstResponseReading = sla
		? readSla(sla.first_response_due, sla.first_response_at, now, firstResponseWindow)
		: readSla(null, null, now);
	const resolutionReading = sla
		? readSla(sla.resolution_due, sla.resolved_at, now, resolutionWindow)
		: readSla(null, null, now);

	const handleAssignToggle = () => {
		if (!session?.user.id) return;
		if (isSelf) {
			void update({ assigned_agent: null }, "Unassigned");
		} else {
			void update({ assigned_agent: session.user.id }, "Assigned to you");
		}
	};

	const handlePriorityChange = (value: string) => {
		if (!isSeverity(value) || value === ticket.severity) return;
		void update({ severity: value }, `Priority set to ${PRIORITY_META[value].label}`);
	};

	return (
		<div>
			<h2 className="text-sm font-semibold text-foreground">Details</h2>
			<dl className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
				<dt className="text-subtle">Assignee</dt>
				<dd className="flex flex-wrap items-center gap-2">
					<Avatar name={assigneeName} size="xs" />
					<span className="text-foreground">{assigneeName ?? "Unassigned"}</span>
					<Button
						variant="link"
						size="sm"
						loading={pendingField === "assigned_agent"}
						onClick={handleAssignToggle}
					>
						{isSelf ? "Unassign" : "Assign to me"}
					</Button>
				</dd>

				<dt className="text-subtle">Priority</dt>
				<dd>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="subtle"
								size="sm"
								loading={pendingField === "severity"}
								aria-label={`Priority: ${PRIORITY_META[ticket.severity].label}. Change priority`}
							>
								{pendingField !== "severity" && <PriorityIcon severity={ticket.severity} showLabel />}
								<ChevronDown aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuRadioGroup value={ticket.severity} onValueChange={handlePriorityChange}>
								{SEVERITIES.map((severity) => (
									<DropdownMenuRadioItem key={severity} value={severity}>
										<PriorityIcon severity={severity} showLabel />
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</dd>

				<dt className="text-subtle">Category</dt>
				<dd className="text-foreground">{ticket.category ?? "—"}</dd>

				<dt className="text-subtle">Team</dt>
				<dd className="text-foreground">{ticket.assigned_team ?? "—"}</dd>

				<dt className="text-subtle">Reporter</dt>
				<dd className="text-foreground">
					{ticket.contacts ? (
						<>
							{ticket.contacts.name ?? ticket.contacts.email}
							{ticket.contacts.name && (
								<span className="block text-xs text-subtle">{ticket.contacts.email}</span>
							)}
						</>
					) : (
						"—"
					)}
				</dd>

				<dt className="text-subtle">Organization</dt>
				<dd className="flex flex-wrap items-center gap-2 text-foreground">
					{ticket.accounts ? (
						<>
							<span>{ticket.accounts.company_name}</span>
							<Lozenge>{ticket.accounts.tier}</Lozenge>
						</>
					) : (
						"—"
					)}
				</dd>

				<dt className="col-span-2 pt-1 text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">
					SLA
				</dt>
				<dd className="col-span-2 -mt-2 space-y-2">
					<SlaRow label="First response" reading={firstResponseReading} due={sla?.first_response_due ?? null} />
					<SlaRow label="Resolution" reading={resolutionReading} due={sla?.resolution_due ?? null} />
					{!sla && <p className="text-xs text-subtlest">No SLA policy for this priority</p>}
				</dd>

				<dt className="text-subtle">Created</dt>
				<dd className="text-foreground">{formatDateTime(ticket.created_at)}</dd>

				<dt className="text-subtle">Updated</dt>
				<dd className="text-foreground">{formatDateTime(ticket.updated_at)}</dd>

				<dt className="text-subtle">Ticket key</dt>
				<dd className="font-mono text-foreground">{ticket.ticket_number}</dd>
			</dl>
		</div>
	);
}

function SlaRow({
	label,
	reading,
	due,
}: {
	label: string;
	reading: ReturnType<typeof readSla>;
	due: string | null;
}) {
	const Icon =
		reading.tone === "breached" ? AlertTriangle : reading.tone === "met" ? CheckCircle2 : Clock;
	const toneClass =
		reading.tone === "breached"
			? "text-danger-text"
			: reading.tone === "critical" || reading.tone === "warning"
				? "text-warning-text"
				: reading.tone === "met"
					? "text-success-text"
					: "text-subtle";

	return (
		<div className="flex items-start justify-between gap-2 text-sm">
			<span className="text-subtle">{label}</span>
			<span className="flex flex-col items-end">
				<span className={cn("flex items-center gap-1 font-medium", toneClass)}>
					<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{reading.label}
				</span>
				{due && <span className="text-xs text-subtlest">{formatDateTime(due)}</span>}
			</span>
		</div>
	);
}
