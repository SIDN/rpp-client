import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { postalModeOf, readContactSupport } from "@/application/contacts/contactSupport";
import type { PostalMode } from "@/application/contacts/contactCard";
import { createContactWorkflows, parseContactId, type ContactWorkflows } from "@/application/contacts/contactWorkflows";
import { defaultPreset } from "@/rpp/discovery/capabilities";
import type { Contact } from "@/rpp/core/types/objects";
import { seenKey } from "../shared/seenObjects";

const contactKey = (sessionId: number | undefined, id: string) => seenKey("contact", sessionId, id);

const trimmed = (input: string): string | undefined => {
  try {
    return parseContactId(input);
  } catch {
    return undefined;
  }
};

/** The workflows over the protocol client of the active session; the screens that use it only exist while connected. */
export function useContactWorkflows(): ContactWorkflows {
  const { session } = useConnection();
  return useMemo(() => {
    if (!session) throw new Error("The contact workflows need a connection");
    return createContactWorkflows(session.client);
  }, [session]);
}

/** The last contact read or returned for this identifier in this session, or undefined. It is never fetched from here. */
export function useCachedContact(input: string): Contact | undefined {
  const { session } = useConnection();
  const id = trimmed(input);
  const query = useQuery<Contact>({ queryKey: contactKey(session?.id, id ?? ""), queryFn: skipToken, staleTime: Infinity });
  return id ? query.data : undefined;
}

/** Keeps what the server showed of a contact for the other workflows, and drops it when an action makes it stale. */
export function useContactStore() {
  const { session } = useConnection();
  const queryClient = useQueryClient();
  return {
    remember(input: string, contact: Contact) {
      const id = trimmed(input);
      if (id) queryClient.setQueryData(contactKey(session?.id, id), contact);
    },
    forget(input: string) {
      const id = trimmed(input);
      if (id) void queryClient.resetQueries({ queryKey: contactKey(session?.id, id), exact: true });
    },
  };
}

/** What the contact forms offer, as the Preset Schema of the preset the requests are made under allows it. */
export type ContactForm =
  | { status: "loading" }
  | {
      status: "ready";
      mode: PostalMode;
      /** Whether the contact has a transfer password to set. */
      authInfo: boolean;
      /** Why the schema did not shape the form: every field is offered then, and the server decides. */
      note: string | undefined;
    };

/** The preset is the one the settings choose, else the server's default. Its schema is read once per connection. */
export function useContactForm(): ContactForm {
  const { session, resolvedPreset } = useConnection();
  const discovery = useDiscoveryState();
  const snapshot = discovery.status === "ready" || discovery.status === "partial" ? discovery.snapshot : undefined;
  const preset = resolvedPreset.chosen ?? (snapshot ? defaultPreset(snapshot) : undefined);
  const query = useQuery({
    queryKey: ["contact-support", session?.id, preset?.id, preset?.version] as const,
    queryFn:
      session && preset
        ? ({ signal }) => readContactSupport(session.transport, { id: preset.id, version: preset.version }, signal)
        : skipToken,
    staleTime: Infinity,
  });

  if (!preset) return { status: "ready", mode: "both", authInfo: true, note: "No preset is known, so every field is offered and the server decides." };
  if (query.isError) return { status: "ready", mode: "both", authInfo: true, note: `The schema of the preset could not be read (${query.error.message}), so every field is offered and the server decides.` };
  if (!query.data) return { status: "loading" };
  if (query.data.kind === "unknown") return { status: "ready", mode: "both", authInfo: true, note: `The schema of the preset could not be used (${query.data.reason}), so every field is offered and the server decides.` };
  return { status: "ready", mode: postalModeOf(query.data.support), authInfo: query.data.support.authInfo, note: undefined };
}
