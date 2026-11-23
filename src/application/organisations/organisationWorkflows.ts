import type { Organisation, User } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { invalidRequest } from "@/rpp/operations/paths";
import type { RppClient } from "@/rpp/operations/RppClient";
import type { OperationSuccess } from "@/rpp/operations/types";
import { createBody as organisationBody, parseOrganisationId, userLinksOf, type CreateOrganisationInput } from "./organisationData";
import { createBody as userBody, parseUserId, type CreateUserInput } from "./userData";

export interface Signal {
  signal?: AbortSignal;
}

export interface RemoveOrganisationOptions extends Signal {
  /** Delete the users of the organisation first. Without it, an organisation that still has users is not deleted. */
  deleteUsers?: boolean;
  /** Called for each user once the registry has deleted it, so that a stop halfway is visible. */
  onUserDeleted?(userId: string): void;
}

export interface RemovedOrganisation {
  deletedUsers: string[];
}

export type OrganisationWorkflows = ReturnType<typeof createOrganisationWorkflows>;

/** The registrar workflows on organisations and their users, as use cases over the protocol client. */
export function createOrganisationWorkflows(client: RppClient) {
  const { organisations } = client;
  // A user is only ever reached through its organisation, and its identifier only means something within it.
  const usersOf = (organisationId: string) => client.users(parseOrganisationId(organisationId));

  return {
    async info(id: string, options: Signal = {}): Promise<OperationSuccess<Organisation>> {
      return organisations.read(parseOrganisationId(id), options);
    },

    async create(input: CreateOrganisationInput, options: Signal = {}): Promise<OperationSuccess<Organisation>> {
      return organisations.create(organisationBody(input), options);
    },

    /** Partial update: only what the operations name changes (json §5.2). */
    async change(id: string, operations: readonly PatchOperation[], options: Signal = {}): Promise<OperationSuccess<Organisation>> {
      return organisations.patch(parseOrganisationId(id), operations, options);
    },

    /**
     * Deletes an organisation. The organisation is read again first, so that users added since it was last looked at are
     * seen: with users and without `deleteUsers` nothing is deleted. With it, the users go first, one at a time, and the
     * organisation is left alone when one of them cannot be deleted.
     */
    async remove(id: string, options: RemoveOrganisationOptions = {}): Promise<OperationSuccess<RemovedOrganisation>> {
      const organisationId = parseOrganisationId(id);
      const { signal } = options;
      const users = userLinksOf((await organisations.read(organisationId, { signal })).data).map((user) => user.id);
      if (users.length > 0 && !options.deleteUsers) {
        throw invalidRequest(
          `The organisation still has ${users.length === 1 ? "1 user" : `${users.length} users`}: ${users.join(", ")}. Delete the users first, or choose to delete all users of the organisation.`,
        );
      }
      const deletedUsers: string[] = [];
      for (const userId of users) {
        await usersOf(organisationId).delete(userId, { signal });
        deletedUsers.push(userId);
        options.onUserDeleted?.(userId);
      }
      const result = await organisations.delete(organisationId, { signal });
      return { data: { deletedUsers }, meta: result.meta };
    },

    users: {
      async info(organisationId: string, userId: string, options: Signal = {}): Promise<OperationSuccess<User>> {
        return usersOf(organisationId).read(parseUserId(userId), options);
      },

      /** Creates the user in the organisation; the same identifier may exist in another organisation. */
      async create(organisationId: string, input: CreateUserInput, options: Signal = {}): Promise<OperationSuccess<User>> {
        return usersOf(organisationId).create(userBody(input), options);
      },

      async change(organisationId: string, userId: string, operations: readonly PatchOperation[], options: Signal = {}): Promise<OperationSuccess<User>> {
        return usersOf(organisationId).patch(parseUserId(userId), operations, options);
      },

      async remove(organisationId: string, userId: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
        return usersOf(organisationId).delete(parseUserId(userId), options);
      },
    },
  };
}
