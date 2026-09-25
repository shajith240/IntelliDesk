"use client";

// Workspace AI: which Gemini key the AI runs on (the workspace's own, verified and stored
// encrypted, or the platform's), and whether confident answers may be sent without review.
import { useState } from "react";
import useSWR from "swr";
import { ExternalLink, KeyRound, Trash2 } from "lucide-react";
import { apiGet, apiSend, ApiRequestError } from "@/lib/api-client";
import { formatRelative } from "@/lib/ticket-meta";
import { Button } from "@/components/ui/button";
import { Label, Input, FieldMessage } from "@/components/ui/field";
import { Lozenge } from "@/components/ui/lozenge";
import { SectionMessage } from "@/components/ui/section-message";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import type { AiSettingsResponse } from "@/types/api";

const ENDPOINT = "/api/settings/ai";

export function AiSettings() {
	const { data, error, isLoading, mutate } = useSWR<AiSettingsResponse>(ENDPOINT, apiGet, { revalidateOnFocus: false });
	const { toast } = useToast();
	const [keyInput, setKeyInput] = useState("");
	const [keyError, setKeyError] = useState<string | null>(null);
	const [savingKey, setSavingKey] = useState(false);
	const [removingKey, setRemovingKey] = useState(false);
	const [savingToggle, setSavingToggle] = useState(false);

	if (isLoading) return <Spinner label="Loading AI settings" />;
	if (error || !data) {
		return (
			<SectionMessage appearance="error" actions={<Button size="sm" onClick={() => mutate()}>Retry</Button>}>
				Couldn&apos;t load the AI settings.
			</SectionMessage>
		);
	}

	const { key } = data;

	const saveKey = async (e: React.FormEvent) => {
		e.preventDefault();
		setKeyError(null);
		setSavingKey(true);
		try {
			await apiSend(ENDPOINT, "POST", { api_key: keyInput.trim() });
			setKeyInput("");
			toast({ tone: "success", title: "Gemini key saved", description: "Your workspace's AI now runs on this key." });
			await mutate();
		} catch (err) {
			setKeyError(err instanceof ApiRequestError ? err.message : "Couldn't save the key. Try again.");
		} finally {
			setSavingKey(false);
		}
	};

	const removeKey = async () => {
		setRemovingKey(true);
		try {
			await apiSend(ENDPOINT, "DELETE");
			toast({ tone: "success", title: "Key removed" });
			await mutate();
		} catch (err) {
			toast({ tone: "error", title: "Couldn't remove the key", description: err instanceof ApiRequestError ? err.message : undefined });
		} finally {
			setRemovingKey(false);
		}
	};

	const toggleAutoSend = async (next: boolean) => {
		setSavingToggle(true);
		try {
			await apiSend(ENDPOINT, "PATCH", { auto_send: next });
			await mutate({ ...data, auto_send: next }, { revalidate: false });
			toast({ tone: "success", title: next ? "Automatic replies turned on" : "Automatic replies turned off" });
		} catch (err) {
			toast({ tone: "error", title: "Couldn't change the setting", description: err instanceof ApiRequestError ? err.message : undefined });
		} finally {
			setSavingToggle(false);
		}
	};

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<KeyRound className="h-4 w-4 text-subtle" aria-hidden="true" />
					<h3 className="text-sm font-semibold text-foreground">Gemini API key</h3>
					{key.source === "workspace" && (
						<Lozenge appearance={key.status === "error" ? "removed" : "success"}>
							{key.status === "error" ? "Needs attention" : `Your key ···${key.key_hint}`}
						</Lozenge>
					)}
					{key.source === "platform" && <Lozenge>Shared platform key</Lozenge>}
					{key.source === "none" && <Lozenge appearance="removed">Not configured</Lozenge>}
				</div>
				<p className="text-sm text-subtle">
					{key.source === "workspace"
						? `AI usage is billed to your own Google account${key.updated_at ? ` (key saved ${formatRelative(key.updated_at)})` : ""}.`
						: key.source === "platform"
							? "The AI runs on the platform's shared key. Add your own to have usage billed to your Google account."
							: "The AI can't classify or draft replies until a key is added. New email waits in the queue until then."}
				</p>
				{key.status === "error" && key.last_error && (
					<SectionMessage appearance="error">{key.last_error}. Paste a working key below.</SectionMessage>
				)}

				<form onSubmit={saveKey} className="flex flex-wrap items-end gap-2">
					<div className="min-w-[240px] flex-1">
						<Label htmlFor="gemini-key">{key.source === "workspace" ? "Replace key" : "Your Gemini API key"}</Label>
						<Input
							id="gemini-key"
							type="password"
							autoComplete="off"
							placeholder="AIza…"
							value={keyInput}
							onChange={(e) => setKeyInput(e.target.value)}
							invalid={keyError !== null}
							aria-describedby="gemini-key-hint"
							disabled={savingKey}
						/>
					</div>
					<Button type="submit" variant="primary" loading={savingKey} disabled={savingKey || keyInput.trim().length === 0}>
						Verify and save
					</Button>
					{key.source === "workspace" && (
						<Button variant="subtle" onClick={() => void removeKey()} loading={removingKey} disabled={removingKey}>
							<Trash2 aria-hidden="true" />
							Remove
						</Button>
					)}
				</form>
				<FieldMessage id="gemini-key-hint" tone={keyError ? "error" : "hint"}>
					{keyError ?? (
						<span>
							Create a key at{" "}
							<a
								href="https://aistudio.google.com/apikey"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-0.5 text-primary hover:underline"
							>
								aistudio.google.com/apikey
								<ExternalLink className="h-3 w-3" aria-hidden="true" />
							</a>
							. It&apos;s checked with Google before saving, stored encrypted, and never shown again. Use a key on a paid
							tier for customer data: Google may use free-tier data to improve its models.
						</span>
					)}
				</FieldMessage>
			</section>

			<section className="space-y-2 border-t border-border pt-5">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 id="auto-send-label" className="text-sm font-semibold text-foreground">
							Send confident answers automatically
						</h3>
						<p id="auto-send-description" className="mt-1 max-w-prose text-sm text-subtle">
							When off, the AI only writes drafts for your team to review. When on, a reply is emailed without review
							only if it comes from a strong knowledge-base match, contains no links or figures the articles
							don&apos;t, the topic is low-risk (not billing, access, data requests or complaints), the customer
							isn&apos;t upset, the sender isn&apos;t automated, and they haven&apos;t already had two automatic replies
							today. Follow-ups in an existing conversation are always answered by a person.
						</p>
					</div>
					<button
						type="button"
						role="switch"
						aria-checked={data.auto_send}
						aria-labelledby="auto-send-label"
						aria-describedby="auto-send-description"
						disabled={savingToggle}
						onClick={() => void toggleAutoSend(!data.auto_send)}
						className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${
							data.auto_send ? "bg-primary" : "bg-border-bold"
						}`}
					>
						<span
							className={`inline-block h-5 w-5 rounded-full bg-background shadow transition-transform duration-150 ${
								data.auto_send ? "translate-x-[22px]" : "translate-x-0.5"
							}`}
						/>
					</button>
				</div>
			</section>
		</div>
	);
}
