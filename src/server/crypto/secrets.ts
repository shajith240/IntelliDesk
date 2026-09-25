import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Application-level encryption for credentials stored in the database
// (mailbox app passwords). AES-256-GCM with a random 96-bit IV per value.
// The organization id is bound in as additional authenticated data, so a
// ciphertext copied into another organization's row fails to decrypt.
//
// Stored format: "v1:<iv>:<tag>:<ciphertext>" (each part base64). The version
// prefix leaves room to rotate the algorithm or key later.

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
	const raw = process.env.MAILBOX_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
	}
	const key = Buffer.from(raw, "base64");
	if (key.length !== 32) {
		throw new Error("MAILBOX_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
	}
	return key;
}

export function isEncryptionConfigured(): boolean {
	try {
		getKey();
		return true;
	} catch {
		return false;
	}
}

export function encryptSecret(plaintext: string, organizationId: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv);
	cipher.setAAD(Buffer.from(organizationId, "utf8"));
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string, organizationId: string): string {
	const [version, ivB64, tagB64, dataB64] = stored.split(":");
	if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined) {
		throw new Error("Unrecognized secret format");
	}
	const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
	decipher.setAAD(Buffer.from(organizationId, "utf8"));
	decipher.setAuthTag(Buffer.from(tagB64, "base64"));
	return Buffer.concat([
		decipher.update(Buffer.from(dataB64, "base64")),
		decipher.final(),
	]).toString("utf8");
}
