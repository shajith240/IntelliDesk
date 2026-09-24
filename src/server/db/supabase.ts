import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
	if (!_supabaseAdmin) {
		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
		const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
		_supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
	}
	return _supabaseAdmin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
	get(_target, prop) {
		const client = getSupabaseAdmin();
		const value = (client as unknown as Record<string | symbol, unknown>)[prop];
		if (typeof value === "function") {
			return value.bind(client);
		}
		return value;
	},
});
