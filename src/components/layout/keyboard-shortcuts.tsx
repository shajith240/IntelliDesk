"use client";

// Global keyboard shortcuts: command palette, navigation via 'g' prefix, sidebar toggle.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { NAV_GROUPS } from "./nav";
import { useShell } from "./shell-context";

const SECOND_KEY_TO_HREF: Record<string, string> = {
	d: "/dashboard",
	i: "/dashboard/queue",
	m: "/dashboard/my-work",
	a: "/dashboard/analytics",
	k: "/dashboard/knowledge-base",
	s: "/dashboard/settings",
};

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		target.getAttribute("contenteditable") === "true"
	);
}

export function KeyboardShortcuts() {
	const { toggleSidebar, paletteOpen, setPaletteOpen, setShortcutsOpen, shortcutsOpen } = useShell();
	const router = useRouter();
	const { data: session } = useSession();
	const isAdmin = session?.user.role === "admin";
	const pendingGRef = useRef<number>(0);
	const isAdminRef = useRef(isAdmin);

	useEffect(() => {
		isAdminRef.current = isAdmin;
	}, [isAdmin]);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.defaultPrevented || e.isComposing) return;

			const isMod = e.metaKey || e.ctrlKey;
			const modKey = isMod && !e.altKey && e.key.toLowerCase() === "k";

			if (isTypingTarget(e.target) && !modKey) return;

			if (modKey) {
				e.preventDefault();
				setPaletteOpen(!paletteOpen);
				return;
			}

			// Ignore everything else while any modifier besides Shift is held.
			if (e.metaKey || e.ctrlKey || e.altKey) return;

			if (e.key === "/") {
				e.preventDefault();
				setPaletteOpen(true);
				return;
			}

			if (e.key === "?") {
				e.preventDefault();
				setShortcutsOpen(true);
				return;
			}

			if (e.key === "[") {
				e.preventDefault();
				toggleSidebar();
				return;
			}

			if (e.key.toLowerCase() === "g") {
				// Record time of 'g' press; if next key arrives within 1s, navigate.
				pendingGRef.current = Date.now();
				return;
			}

			const pendingAt = pendingGRef.current;
			if (pendingAt && Date.now() - pendingAt < 1000) {
				pendingGRef.current = 0;
				const key = e.key.toLowerCase();
				if (key === "s" && !isAdminRef.current) return;
				const href = SECOND_KEY_TO_HREF[key];
				if (href) {
					e.preventDefault();
					router.push(href);
				}
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [paletteOpen, setPaletteOpen, setShortcutsOpen, toggleSidebar, router]);

	return <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />;
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Keyboard shortcuts" size="md">
				<div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2">
					<section>
						<h3 className="mb-1 text-sm font-semibold text-foreground">Global</h3>
						<dl>
							<Row label="Search">
								<Kbd>/</Kbd>
							</Row>
							<Row label="Command palette">
								<Kbd>Ctrl</Kbd>
								<Kbd>K</Kbd>
							</Row>
							<Row label="Toggle sidebar">
								<Kbd>[</Kbd>
							</Row>
							<Row label="Show shortcuts">
								<Kbd>?</Kbd>
							</Row>
						</dl>
					</section>
					<section>
						<h3 className="mb-1 text-sm font-semibold text-foreground">Navigation</h3>
						<dl>
							{NAV_GROUPS.flatMap((group) => group.items).map((item) => {
								const [first, second] = item.shortcut.split(" ");
								return (
									<Row key={item.href} label={item.label}>
										<Kbd>{first}</Kbd>
										<span className="text-subtlest">then</span>
										<Kbd>{second}</Kbd>
									</Row>
								);
							})}
						</dl>
					</section>
					<section>
						<h3 className="mb-1 text-sm font-semibold text-foreground">Queue</h3>
						<dl>
							<Row label="Move selection">
								<Kbd>J</Kbd>
								<Kbd>K</Kbd>
							</Row>
							<Row label="Open ticket">
								<Kbd>Enter</Kbd>
							</Row>
						</dl>
					</section>
					<section>
						<h3 className="mb-1 text-sm font-semibold text-foreground">Ticket</h3>
						<dl>
							<Row label="Close panel">
								<Kbd>Esc</Kbd>
							</Row>
						</dl>
					</section>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 py-1.5 text-sm">
			<dt className="text-subtle">{label}</dt>
			<dd className="flex items-center gap-1">{children}</dd>
		</div>
	);
}
