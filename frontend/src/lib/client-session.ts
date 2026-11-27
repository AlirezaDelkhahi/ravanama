export const VERIFIED_CONTACT_STORAGE_KEY = "ravannama_verified_contact_v1";
const LEGACY_PORTAL_STORAGE_KEY = "ravannama_portal_auth_v1";

export type VerifiedContactChannel = "phone" | "email";

export interface VerifiedClientSession {
  channel: VerifiedContactChannel;
  identifier: string;
  verifiedAt: number;
}

export function readVerifiedClientSession(): VerifiedClientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(VERIFIED_CONTACT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VerifiedClientSession>;
    if (
      (parsed.channel === "phone" || parsed.channel === "email") &&
      typeof parsed.identifier === "string" &&
      parsed.identifier.length > 0 &&
      typeof parsed.verifiedAt === "number"
    ) {
      return {
        channel: parsed.channel,
        identifier: parsed.identifier,
        verifiedAt: parsed.verifiedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeVerifiedClientSession(
  channel: VerifiedContactChannel,
  identifier: string,
): VerifiedClientSession {
  const session: VerifiedClientSession = {
    channel,
    identifier,
    verifiedAt: Date.now(),
  };
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        VERIFIED_CONTACT_STORAGE_KEY,
        JSON.stringify(session),
      );
    } catch {
      // Ignore storage access restrictions
    }
  }
  return session;
}

export function clearVerifiedClientSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(VERIFIED_CONTACT_STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_PORTAL_STORAGE_KEY);
  } catch {
    // Ignore storage access restrictions
  }
}
