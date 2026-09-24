// Brand panel for the login and signup screens: a slowly drifting, film-grained blue gradient.
import { Logo } from "@/components/layout/logo";

const POINTS = [
	"Every inbound email classified, prioritized and SLA-tracked on arrival",
	"Replies drafted from your knowledge base, sent only after an agent approves",
	"One queue for the whole team, scoped to your organization",
];

export function AuthHero() {
	return (
		<div className="relative isolate flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-[#03050b] p-10 text-white">
			<div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#03050b]">
				<div className="grain-field grain-field-a -right-[20%] -top-[25%] h-[85%] w-[85%] bg-[radial-gradient(closest-side,#2f6bff,#1438a8_55%,transparent)]" />
				<div className="grain-field grain-field-b -bottom-[30%] -left-[25%] h-[80%] w-[80%] bg-[radial-gradient(closest-side,#1b4fe0,#0b1f66_60%,transparent)]" />
				<div className="grain-field grain-field-c right-[5%] top-[35%] h-[45%] w-[40%] bg-[radial-gradient(closest-side,#8fbaff,#3d7bff_50%,transparent)]" />
				<div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_20%,transparent_40%,rgba(3,5,11,0.85))]" />
				<div className="grain-noise opacity-90" />
			</div>

			<Logo className="text-white" />

			<div className="max-w-md">
				<h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-balance">
					Every customer email, triaged before you open it.
				</h2>
				<ul className="mt-8 space-y-3">
					{POINTS.map((point) => (
						<li key={point} className="flex gap-3 text-sm leading-6 text-white/75">
							<span aria-hidden="true" className="mt-2.5 h-px w-4 shrink-0 bg-white/50" />
							{point}
						</li>
					))}
				</ul>
			</div>

			<p className="text-xs text-white/50">IntelliDesk support operations</p>
		</div>
	);
}
