import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { t } from "@/i18n";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useConnection } from "@/app/connection-context";
import { createOrganisationWorkflows, type OrganisationWorkflows } from "@/application/organisations/organisationWorkflows";
import { userLinksOf, type UserLink } from "@/application/organisations/organisationData";
import type { Organisation, User } from "@/rpp/core/types/objects";

/** Organisations the server has shown in this session; nothing in the key but the connection number and the identifier. */
const organisationKey = (sessionId: number | undefined, id: string) => ["organisation", sessionId, id] as const;
/** A user is known by its organisation and its identifier together: the identifier is only unique within the organisation. */
const userKey = (sessionId: number | undefined, organisationId: string, id: string) => ["user", sessionId, organisationId, id] as const;

/** The workflows over the protocol client of the active session; the screens that use it only exist while connected. */
export function useOrganisationWorkflows(): OrganisationWorkflows {
  const { session } = useConnection();
  return useMemo(() => {
    if (!session) throw new Error(t("organisations.error.workflowsNeedConnection"));
    return createOrganisationWorkflows(session.client);
  }, [session]);
}

/** The last organisation read or returned for this identifier in this session, or undefined. It is never fetched from here. */
export function useCachedOrganisation(input: string): Organisation | undefined {
  const { session } = useConnection();
  const id = input.trim();
  const query = useQuery<Organisation>({ queryKey: organisationKey(session?.id, id), queryFn: skipToken, staleTime: Infinity });
  return id === "" ? undefined : query.data;
}

export function useCachedUser(organisationInput: string, userInput: string): User | undefined {
  const { session } = useConnection();
  const organisationId = organisationInput.trim();
  const id = userInput.trim();
  const query = useQuery<User>({ queryKey: userKey(session?.id, organisationId, id), queryFn: skipToken, staleTime: Infinity });
  return organisationId === "" || id === "" ? undefined : query.data;
}

/** The users of the organisation as it lists them, and those of it this session has read or created. */
export function useKnownUsers(organisationInput: string): UserLink[] {
  const { session } = useConnection();
  const cache = useQueryClient().getQueryCache();
  const organisationId = organisationInput.trim();
  const organisation = useCachedOrganisation(organisationId);
  const sessionId = session?.id;

  // The ids of the users seen, one to a line: a string, so that an unchanged set is an unchanged snapshot.
  const seen = useSyncExternalStore(
    (listener) => cache.subscribe(listener),
    () =>
      organisationId === ""
        ? ""
        : cache
            .findAll({
              predicate: (query) => query.queryKey[0] === "user" && query.queryKey[1] === sessionId && query.queryKey[2] === organisationId && query.state.data !== undefined,
            })
            .map((query) => String(query.queryKey[3]))
            .sort()
            .join("\n"),
  );

  return useMemo(() => userLinksOf(organisation, seen === "" ? [] : seen.split("\n")), [organisation, seen]);
}

/** Keeps what the server showed of an organisation or a user for the other workflows. */
export function useOrganisationStore() {
  const { session } = useConnection();
  const queryClient = useQueryClient();
  return {
    remember(id: string, organisation: Organisation) {
      queryClient.setQueryData(organisationKey(session?.id, id.trim()), organisation);
    },
    rememberUser(organisationId: string, id: string, user: User) {
      queryClient.setQueryData(userKey(session?.id, organisationId.trim(), id.trim()), user);
    },
    forgetOrganisation(id: string) {
      void queryClient.resetQueries({ queryKey: organisationKey(session?.id, id.trim()), exact: true });
    },
    forgetUser(organisationId: string, id: string) {
      void queryClient.resetQueries({ queryKey: userKey(session?.id, organisationId.trim(), id.trim()), exact: true });
    },
    /** Every user this session has seen in the organisation. */
    forgetUsersOf(organisationId: string) {
      void queryClient.resetQueries({ queryKey: ["user", session?.id, organisationId.trim()] });
    },
    /** The organisation as read no longer lists the user, once the registry has deleted it. */
    unlinkUser(organisationId: string, userId: string) {
      queryClient.setQueryData<Organisation>(organisationKey(session?.id, organisationId.trim()), (organisation) => {
        if (!organisation || !Array.isArray(organisation.users)) return organisation;
        const users = organisation.users.filter((entry: { object?: { id?: unknown } }) => entry?.object?.id !== userId.trim());
        return { ...organisation, users };
      });
    },
  };
}

/** Every user of the organisation this session has read, created or changed, by identifier. */
export function useCachedUsers(organisationInput: string): ReadonlyMap<string, User> {
  const { session } = useConnection();
  const cache = useQueryClient().getQueryCache();
  const organisationId = organisationInput.trim();
  const sessionId = session?.id;
  const find = useCallback(
    () => cache.findAll({ predicate: (query) => query.queryKey[0] === "user" && query.queryKey[1] === sessionId && query.queryKey[2] === organisationId && query.state.data !== undefined }),
    [cache, sessionId, organisationId],
  );
  // A string of identifiers and update times, so that an unchanged set of users is an unchanged snapshot.
  const version = useSyncExternalStore(
    (listener) => cache.subscribe(listener),
    () => find().map((query) => `${String(query.queryKey[3])}@${query.state.dataUpdatedAt}`).sort().join("\n"),
  );
  return useMemo(() => (version === "" ? new Map() : new Map(find().map((query) => [String(query.queryKey[3]), query.state.data as User]))), [find, version]);
}

/** Every organisation this session has read, listed, created or changed, by identifier. */
export function useCachedOrganisations(): ReadonlyMap<string, Organisation> {
  const { session } = useConnection();
  const cache = useQueryClient().getQueryCache();
  const sessionId = session?.id;
  const find = useCallback(
    () => cache.findAll({ predicate: (query) => query.queryKey[0] === "organisation" && query.queryKey[1] === sessionId && query.state.data !== undefined }),
    [cache, sessionId],
  );
  const version = useSyncExternalStore(
    (listener) => cache.subscribe(listener),
    () => find().map((query) => `${String(query.queryKey[2])}@${query.state.dataUpdatedAt}`).sort().join("\n"),
  );
  return useMemo(() => (version === "" ? new Map() : new Map(find().map((query) => [String(query.queryKey[2]), query.state.data as Organisation]))), [find, version]);
}
