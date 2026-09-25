// Free / personal mailbox providers. An address on one of these says nothing
// about which company the sender works for. Pure; unit-tested.
const PERSONAL_DOMAINS = new Set([
	"gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "ymail.com", "rocketmail.com",
	"outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
	"aol.com", "proton.me", "protonmail.com", "pm.me", "zoho.com", "zohomail.in", "yandex.com", "yandex.ru",
	"mail.com", "gmx.com", "gmx.de", "web.de", "rediffmail.com", "fastmail.com", "tutanota.com", "hey.com",
	"qq.com", "163.com", "126.com",
]);

export function isPersonalEmailDomain(domain: string): boolean {
	return PERSONAL_DOMAINS.has(domain.trim().toLowerCase());
}
