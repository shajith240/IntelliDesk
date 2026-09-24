// Client-side root provider for auth, theme, SWR config, and UI context (tooltips, toasts).
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { ApiRequestError } from "@/lib/api-client";

function isClientError(error: unknown): boolean {
	return error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
}

// An expired session makes every API call return 401; send the user back to login, keeping their place.
function handleSwrError(error: unknown) {
	if (error instanceof ApiRequestError && error.status === 401) {
		const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
		window.location.assign(`/login?callbackUrl=${callbackUrl}`);
	}
}

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider>
			<ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
				<SWRConfig
					value={{
						dedupingInterval: 2000,
						errorRetryCount: 3,
						shouldRetryOnError: (error: unknown) => !isClientError(error),
						onError: handleSwrError,
					}}
				>
					<TooltipProvider>
						<ToastProvider>{children}</ToastProvider>
					</TooltipProvider>
				</SWRConfig>
			</ThemeProvider>
		</SessionProvider>
	);
}
