import type { ConnectionProfile } from "@/config/connectionProfile";

/** The organisation and username of a profile that logs in with them; the other mechanisms name neither. */
export function accountOf(profile: ConnectionProfile | undefined): { organisation: string; username: string } | undefined {
  const auth = profile?.auth;
  return auth?.type === "basic" && auth.organisation.trim() !== "" ? { organisation: auth.organisation.trim(), username: auth.username } : undefined;
}

/** The organisation made-up data belongs to when no profile names one; an identifier, so it is not translated. */
export const EXAMPLE_ORGANISATION = "ORG-EXAMPLE";
