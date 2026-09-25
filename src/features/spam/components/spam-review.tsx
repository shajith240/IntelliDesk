"use client";

// List of email the spam filters caught, with "Not spam" to send one back into the intake queue.
import { useState } from "react";
import useSWR from "swr";
import { MailCheck, ShieldCheck } from "lucide-react";
import { apiGet, apiSend, ApiRequestError } from "@/lib/api-client";
import { formatDateTime, formatRelative } from "@/lib/ticket-meta";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { SpamListResponse } from "@/types/api";

export function SpamReview() {
	const { data, error, isLoading, mutate, isValidating } = useSWR<SpamListResponse>("/api/emails/spam", apiGet, {
		revalidateOnFocus: false,
	});
	const { toast } = useToast();
	const [recovering, setRecovering] = useState<string | null>(null);

	const recover = async (id: string, from: string) => {
		setRecovering(id);
		try {
			await apiSend(`/api/emails/${id}/not-spam`, "POST");
			toast({
				tone: "success",
				title: "Moved to the queue",
				description: `The email from ${from} becomes a ticket on the next mailbox check (within 10 minutes).`,
			});
			await mutate(
				(current) => current && { ...current, emails: current.emails.filter((email) => email.id !== id) },
				{ revalidate: false },
			);
		} catch (err) {
			toast({
				tone: "error",
				title: "Couldn't recover the email",
				description: err instanceof ApiRequestError ? err.message : undefined,
			});
		} finally {
			setRecovering(null);
		}
	};

	if (isLoading) {
		return (
			<div className="space-y-2">
				{[1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-[72px] w-full" />
				))}
			</div>
		);
	}
	if (error || !data) {
		return <ErrorState message="Couldn't load the spam list." onRetry={() => mutate()} retrying={isValidating} />;
	}
	if (data.emails.length === 0) {
		return (
			<EmptyState
				icon={ShieldCheck}
				title="Nothing in spam"
				description={`No email was filtered as spam in the last ${data.window_days} days.`}
			/>
		);
	}

	return (
		<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-raised">
			{data.emails.map((email) => {
				const from = email.from_name || email.from_address;
				return (
					<li key={email.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-baseline gap-x-2">
								<span className="truncate text-sm font-semibold text-foreground">{from}</span>
								{email.from_name && <span className="truncate text-xs text-subtle">{email.from_address}</span>}
								<time
									className="ml-auto shrink-0 text-xs text-subtlest"
									dateTime={email.received_at}
									title={formatDateTime(email.received_at)}
								>
									{formatRelative(email.received_at)}
								</time>
							</div>
							<p className="truncate text-sm text-foreground">{email.subject}</p>
							{email.preview && <p className="truncate text-xs text-subtle">{email.preview}</p>}
						</div>
						<Button
							size="sm"
							onClick={() => void recover(email.id, from)}
							loading={recovering === email.id}
							disabled={recovering !== null}
						>
							<MailCheck aria-hidden="true" />
							Not spam
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
